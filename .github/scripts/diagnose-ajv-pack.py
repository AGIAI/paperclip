"""Two bounded, credential-free npm directory-pack probes; never a verify substitute."""
import hashlib
import json
import os
import resource
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time

SOURCE = "34f49a201a804564cfae81e425266b3f9f987e30"
LOCK = "5ae57d1ddd475691dac1f1cfbd4836e54f7da1956b47e6e705b218ae3070ae2e"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inventory(root):
    rows = {}
    for path in sorted(root.rglob("*")):
        assert not path.is_symlink(), "Unexpected AJV package symlink"
        rows[str(path.relative_to(root))] = {
            "mode": path.stat().st_mode & 0o777,
            **({"sha256": digest(path)} if path.is_file() else {"directory": True}),
        }
    return rows


def bound_output_files():
    resource.setrlimit(resource.RLIMIT_FSIZE, (16 * 1024 * 1024, 16 * 1024 * 1024))


def run_probe(node, npm, package, root, evidence):
    root.mkdir()
    for name in ("home", "cache", "tmp", "artifacts"):
        (root / name).mkdir()
    for name in ("user.npmrc", "global.npmrc"):
        (root / name).write_text("")
    env = {
        "PATH": str(node.parent) + ":/usr/bin:/bin", "CI": "true",
        "HOME": str(root / "home"), "TMPDIR": str(root / "tmp"),
        "NPM_CONFIG_USERCONFIG": str(root / "user.npmrc"),
        "NPM_CONFIG_GLOBALCONFIG": str(root / "global.npmrc"),
        "NPM_CONFIG_CACHE": str(root / "cache"),
        "NPM_CONFIG_UPDATE_NOTIFIER": "false", "NPM_CONFIG_AUDIT": "false",
        "NPM_CONFIG_FUND": "false",
    }
    argv = [str(node), str(npm), "pack", str(package), "--ignore-scripts",
            "--pack-destination", str(root / "artifacts"), "--loglevel=verbose"]
    started = time.monotonic()
    with (evidence / (root.name + ".stdout.log")).open("wb") as stdout, \
         (evidence / (root.name + ".stderr.log")).open("wb") as stderr:
        process = subprocess.Popen(argv, cwd=root / "artifacts", env=env,
                                   stdout=stdout, stderr=stderr, start_new_session=True,
                                   preexec_fn=bound_output_files)
        timed_out = False
        try:
            process.wait(timeout=60)
        except subprocess.TimeoutExpired:
            timed_out = True
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)
    # The clean environment has no tokens/config credentials. Do not dump ambient env.
    for label, folder in (("npm-logs", root / "cache/_logs"), ("tarballs", root / "artifacts")):
        target = evidence / (root.name + "-" + label)
        target.mkdir()
        if folder.exists():
            files = list(folder.iterdir())
            assert len(files) <= 32 and sum(p.stat().st_size for p in files) <= 16 * 1024 * 1024
            for path in files:
                assert path.is_file() and not path.is_symlink()
                shutil.copyfile(path, target / path.name)
    return {"argv": argv, "cwd": str(root / "artifacts"), "pid": process.pid,
            "exitCode": process.returncode, "timedOut": timed_out,
            "elapsedSeconds": time.monotonic() - started, "processReaped": True,
            "environment": env}


def main():
    os.umask(0o077)
    repo = Path.cwd().resolve()
    evidence = repo / "ajv-pack-diagnostic"
    evidence.mkdir(exist_ok=True)
    node = Path(shutil.which("node")).resolve()
    npm = Path(shutil.which("npm")).resolve()
    assert sys.platform == "linux" and os.uname().machine == "x86_64"
    assert subprocess.check_output(["git", "rev-parse", "HEAD"], text=True, timeout=10).strip() == SOURCE
    assert digest(repo / "pnpm-lock.yaml") == LOCK
    assert subprocess.check_output([node, "--version"], text=True, timeout=10).strip() == "v24.21.0"
    assert json.loads((npm.parent.parent / "package.json").read_text())["version"] == "11.19.0"
    source = (repo / "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv").resolve()
    assert source.is_relative_to(repo / "node_modules/.pnpm")
    assert json.loads((source / "package.json").read_text())["version"] == "8.20.0"
    before = inventory(source)
    (evidence / "ajv-input-inventory.json").write_text(json.dumps(before, indent=2) + "\n")
    work = Path(tempfile.mkdtemp(prefix="pc-ajv-pack-"))
    receipt = {"source": SOURCE, "lockSha256": LOCK, "platform": os.uname().sysname,
               "architecture": os.uname().machine, "node": {"version": "24.21.0", "path": str(node), "sha256": digest(node)},
               "npm": {"version": "11.19.0", "path": str(npm), "sha256": digest(npm),
                       "manifestSha256": digest(npm.parent.parent / "package.json")},
               "driverSha256": digest(Path(__file__)), "workRoot": str(work), "results": []}
    try:
        plain = work / "plain-ajv"
        shutil.copytree(source, plain)
        assert inventory(plain) == before
        for label, package in (("pnpm-layout", source), ("plain-copy", plain)):
            receipt["results"].append(run_probe(node, npm, package, work / label, evidence))
        assert inventory(source) == before
        receipt["sourceUnchanged"] = True
    finally:
        shutil.rmtree(work)
        receipt["privateRootRemoved"] = not work.exists()
        (evidence / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
        hashes = {str(p.relative_to(evidence)): digest(p) for p in sorted(evidence.rglob("*")) if p.is_file()}
        (evidence / "artifact-hashes.json").write_text(json.dumps(hashes, indent=2) + "\n")
    # Preserve failed probes as failures, while still collecting the comparison.
    return 0 if all(row["exitCode"] == 0 for row in receipt["results"]) else 1


if __name__ == "__main__":
    sys.exit(main())
