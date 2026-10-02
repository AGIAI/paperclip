"""Read-only Linux evidence for the exact staged Runner executable; never signal."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import stat
import time


def identity(path):
    value = path.stat()
    return {"dev": str(value.st_dev), "ino": str(value.st_ino),
            "size": value.st_size, "mode": stat.S_IMODE(value.st_mode)}


def process_identity(path):
    # comm may contain spaces or parentheses. Do not retain it, argv, or env.
    value = (path / "stat").read_text()
    fields = value[value.rindex(")") + 2:].split()
    return {"pid": int(path.name), "state": fields[0], "ppid": int(fields[1]),
            "processGroup": int(fields[2]), "startTimeTicks": fields[19]}


def inspect(target, proc=Path("/proc"), max_pids=32768, seconds=8):
    target = Path(os.path.abspath(target))
    begin = time.monotonic()
    result = {"schema": "paperclip.exact-executable-holders/v1",
              "observedAt": datetime.now(timezone.utc).isoformat(),
              "target": str(target), "targetBefore": None, "holders": [],
              "permissionDenied": 0, "racedMatches": 0, "scanned": 0,
              "complete": True, "signalsSent": 0}
    try:
        if target.is_symlink() or not stat.S_ISREG(target.stat().st_mode):
            raise ValueError("Staged executable is not a regular non-symlink file")
        result["targetBefore"] = identity(target)
    except FileNotFoundError:
        pass  # The first typecheck has not staged the daemon yet.
    for entry in proc.iterdir():
        if not entry.name.isdecimal():
            continue
        if result["scanned"] >= max_pids or time.monotonic() - begin >= seconds:
            result.update(complete=False, stopReason="bounded_scan_limit")
            break
        result["scanned"] += 1
        matched = False
        try:
            exe = entry / "exe"
            link = os.readlink(exe)
            executable = identity(exe)
            pinned = result["targetBefore"]
            by_inode = bool(pinned and all(executable[k] == pinned[k] for k in ("dev", "ino")))
            by_path = link in (str(target), str(target) + " (deleted)")
            if not (by_inode or by_path):
                continue
            matched = True
            before = process_identity(entry)
            after = process_identity(entry)
            if before != after or identity(exe) != executable or os.readlink(exe) != link:
                result["racedMatches"] += 1
                continue
            result["holders"].append({**before, "executable": executable,
                                      "matchesTargetInode": by_inode,
                                      "matchesTargetPath": by_path,
                                      "deletedExecutable": link.endswith(" (deleted)")})
        except FileNotFoundError:
            if matched:
                result["racedMatches"] += 1
        except PermissionError:
            result["permissionDenied"] += 1
    try:
        result["targetAfter"] = identity(target)
    except FileNotFoundError:
        result["targetAfter"] = None
    result["targetChangedDuringScan"] = result["targetBefore"] != result["targetAfter"]
    result["complete"] = (result["complete"] and not result["permissionDenied"]
                          and not result["racedMatches"] and not result["targetChangedDuringScan"])
    result["holders"].sort(key=lambda row: row["pid"])
    result["elapsedSeconds"] = round(time.monotonic() - begin, 6)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(inspect(args.target), sort_keys=True))
