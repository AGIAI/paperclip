"""Retain exact tested bytes, internal symlinks, and modes outside owned scratch."""
import hashlib
from pathlib import Path, PurePosixPath
import tarfile
from source_guard import require, sha

def archive_relative(name):
    path = PurePosixPath(name)
    require(name.startswith('provider-pack/') and not path.is_absolute()
            and '..' not in path.parts and path.as_posix() == name, 'Unsafe archive member path')
    return name.removeprefix('provider-pack/')

def verify_archive(output, inventory):
    expected = {row['path']: row for row in inventory}
    require(len(expected) == len(inventory), 'Duplicate inventory member')
    observed = set()
    regular_members = set()
    archived_groups = {}
    with tarfile.open(output, 'r:gz') as archive:
        for member in archive:
            if member.name == 'provider-pack':
                require(member.isdir(), 'Archive root must be directory')
                continue
            relative = archive_relative(member.name)
            require(relative in expected and relative not in observed, 'Unexpected archive member')
            row = expected[relative]; observed.add(relative)
            require(member.mode == row['mode'], 'Archive mode mismatch')
            if row['kind'] == 'directory':
                require(member.isdir(), 'Archive directory mismatch')
            elif row['kind'] == 'symlink':
                require(member.issym() and member.linkname == row['target'], 'Archive symlink mismatch')
            else:
                require(row['kind'] == 'file', 'Unknown inventory member kind')
                if member.islnk():
                    target = archive_relative(member.linkname)
                    require(target in regular_members, 'Archive hard link target must be an earlier regular file')
                    target_row = expected[target]
                    require(row.get('links', 1) > 1 and member.size == 0
                            and row.get('hardlinkGroup') == target_row.get('hardlinkGroup')
                            and all(row[key] == target_row[key] for key in ('sha256', 'size', 'mode', 'links')),
                            'Archive hard link identity mismatch')
                else:
                    require(member.isfile() and member.size == row['size'], 'Archive file mismatch')
                    if row.get('links', 1) > 1:
                        group = row['hardlinkGroup']
                        require(group not in archived_groups, 'Archive lost hard link identity')
                        archived_groups[group] = relative
                    regular_members.add(relative)
                digest = hashlib.sha256()
                size = 0
                with archive.extractfile(member) as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                        digest.update(chunk); size += len(chunk)
                require(size == row['size'] and digest.hexdigest() == row['sha256'], 'Archive bytes mismatch')
    require(observed == set(expected), 'Archive omitted pack members')

def retain_pack(pack, output, inventory):
    pack, output = Path(pack), Path(output)
    require(not output.exists() and not output.resolve().is_relative_to(pack.resolve()), 'Archive must be new and outside pack')
    with tarfile.open(output, 'w:gz', compresslevel=1, dereference=False) as archive:
        archive.add(pack, arcname='provider-pack')
    verify_archive(output, inventory)
    return {'path':str(output), 'sha256':sha(output), 'bytes':output.stat().st_size,
            'inventoryVerified':True, 'internalSymlinksAndModesPreserved':True}
