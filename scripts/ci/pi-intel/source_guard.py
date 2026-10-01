"""Private build source admission; no execution on import."""
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
from closed_inventory import closed_tree

ASSETS = 'packages/paperclip-runner/provider-assets'

def require(value, message):
    if not value:
        raise RuntimeError(message)

def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()

def tree(root, allow_links=False):
    root = Path(root)
    require(root.is_dir() and not root.is_symlink(), 'Missing or linked inventory root')
    result = []
    for path in sorted(root.rglob('*')):
        info = path.lstat()
        item = {'path': path.relative_to(root).as_posix(), 'mode': stat.S_IMODE(info.st_mode)}
        if stat.S_ISLNK(info.st_mode):
            require(allow_links and path.resolve(strict=True).is_relative_to(root.resolve()), 'Inventory symlink escaped or forbidden')
            item.update(kind='symlink', target=os.readlink(path))
        elif stat.S_ISDIR(info.st_mode):
            item.update(kind='directory')
        else:
            require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1,
                    f'Inventory requires private regular files: path={item["path"]!r} type={stat.S_IFMT(info.st_mode):#o} links={info.st_nlink}')
            item.update(kind='file', sha256=sha(path), size=info.st_size)
        result.append(item)
    return result

def verify_pack(pack, source, pins):
    pack = Path(pack)
    manifest = json.loads((pack / 'provider-pack.json').read_text())
    payload = manifest['payload']
    canonical = json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
    require(manifest['digest'] == 'sha256:' + hashlib.sha256(canonical).hexdigest(), 'Pack canonical digest mismatch')
    require(payload['runnerSourceRevision'] == source, 'Pack source mismatch')
    for agent, (_, digest) in pins.items():
        require(payload['candidateProviders'][agent]['profileDigest'] == digest, 'Pack candidate mismatch')
    def check(value):
        if isinstance(value, dict):
            if isinstance(value.get('path'), str) and isinstance(value.get('sha256'), str):
                relative = Path(value['path'])
                require(not relative.is_absolute() and '..' not in relative.parts, 'Unsafe pack artifact path')
                path = pack / relative
                require(path.resolve(strict=True).is_relative_to(pack.resolve()), 'Pack artifact escaped')
                require('sha256:' + sha(path) == value['sha256'], 'Pack artifact hash mismatch')
            for child in value.values():
                check(child)
        elif isinstance(value, list):
            for child in value:
                check(child)
    check(payload)
    return manifest

def capture_authority(stage, pack):
    stage, pack = Path(stage), Path(pack)
    return {'schema': 'pi-intel/build-authority/v1', 'pack': closed_tree(pack),
            'dist': tree(stage / 'packages/paperclip-runner/dist'),
            'packAssets': tree(pack / 'provider-assets'),
            'sourceAssets': tree(stage / ASSETS) if os.path.lexists(stage / ASSETS) else None}

def verify_authority(stage, pack, expected):
    """Recompute every byte before the generated-directory source exception."""
    stage, pack = Path(stage), Path(pack)
    require(expected is not None, 'Generated assets require a captured immutable inventory')
    require(expected.get('schema') == 'pi-intel/build-authority/v1', 'Unknown build authority schema')
    require(closed_tree(pack) == expected['pack'], 'Immutable pack inventory drift')
    require(tree(stage / 'packages/paperclip-runner/dist') == expected['dist'], 'Controller dist inventory drift')
    pack_assets = tree(pack / 'provider-assets')
    require(pack_assets == expected['packAssets'], 'Packed asset inventory drift')
    source_assets = tree(stage / ASSETS) if os.path.lexists(stage / ASSETS) else None
    require(source_assets == expected['sourceAssets'], 'Source asset presence or inventory drift')
    if source_assets is not None:
        require(source_assets == pack_assets, 'Source and packed asset inventories differ')
    # Every packed dist file must match the actual local controller copy.
    for item in tree(pack / 'dist'):
        if item['kind'] == 'file':
            path = stage / 'packages/paperclip-runner/dist' / item['path']
            require(sha(path) == item['sha256'], 'Packed/controller dist mismatch')

def verify_source(stage, source, lock_sha, pack=None, authority=None):
    stage = Path(stage)
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=stage, text=True).strip()
    require(head == source, 'Stage HEAD changed')
    require(sha(stage / 'pnpm-lock.yaml') == lock_sha, 'Private overlay changed')
    generated = os.path.lexists(stage / ASSETS)
    if authority is not None:
        require(pack is not None, 'Build authority requires the captured pack')
        verify_authority(stage, pack, authority)
    else:
        require(not generated, 'Generated assets cannot be admitted before pack inventory')
    status = subprocess.check_output(['git', 'status', '--porcelain=v1', '-z', '--untracked-files=all'], cwd=stage)
    entries = [entry.decode('utf8') for entry in status.split(b'\0') if entry]
    require(' M pnpm-lock.yaml' in entries, 'Expected unstaged private lock overlay missing')
    for entry in entries:
        if entry == ' M pnpm-lock.yaml':
            continue
        require(generated and entry.startswith('?? ' + ASSETS + '/'), 'Unexpected source/untracked change')
        path = entry[3:]
        require(path in {ASSETS + '/' + row['path'] for row in authority['sourceAssets'] if row['kind'] == 'file'}, 'Untracked asset is outside verified inventory')
    return {'head': head, 'lockSha256': lock_sha, 'generatedAssetsAdmitted': generated, 'statusEntries': entries}
