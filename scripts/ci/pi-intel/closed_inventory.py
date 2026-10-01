"""Read-only inventory for Docker-extracted packs with internal hard links."""
import hashlib
import os
from pathlib import Path
import stat

def closed_tree(root):
    root = Path(root)
    if root.is_symlink() or not root.is_dir():
        raise RuntimeError('Invalid inventory root')
    groups = {}
    rows = []
    for path in sorted(root.rglob('*')):
        info = path.lstat()
        row = {'path': path.relative_to(root).as_posix(), 'mode': stat.S_IMODE(info.st_mode)}
        if stat.S_ISLNK(info.st_mode):
            if not path.resolve(strict=True).is_relative_to(root.resolve()):
                raise RuntimeError(f'Symlink escapes pack: path={row["path"]!r}')
            row.update(kind='symlink', target=os.readlink(path))
        elif stat.S_ISDIR(info.st_mode):
            row.update(kind='directory')
        elif stat.S_ISREG(info.st_mode):
            identity = (info.st_dev, info.st_ino)
            groups.setdefault(identity, []).append((path, info))
            digest = hashlib.sha256()
            with path.open('rb') as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(chunk)
            row.update(kind='file', sha256=digest.hexdigest(), size=info.st_size,
                       hardlinkGroup=groups[identity][0][0].relative_to(root).as_posix(), links=info.st_nlink)
        else:
            raise RuntimeError(f'Nonregular pack file: path={row["path"]!r} type={stat.S_IFMT(info.st_mode):#o} links={info.st_nlink}')
        rows.append(row)
    for identity, members in groups.items():
        for path, before in members:
            after = path.lstat()
            if ((after.st_dev, after.st_ino) != identity or after.st_nlink != len(members)
                or after.st_size != before.st_size or after.st_mtime_ns != before.st_mtime_ns
                or after.st_mode != before.st_mode):
                raise RuntimeError(f'Pack hard link escapes inventory or file changed: path={path.relative_to(root).as_posix()!r} links={after.st_nlink} inventoriedLinks={len(members)}')
    return rows
