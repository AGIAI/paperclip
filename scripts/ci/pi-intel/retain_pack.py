"""Retain exact tested bytes, internal symlinks, and modes outside owned scratch."""
import hashlib
from pathlib import Path
import tarfile
from source_guard import require, sha

def retain_pack(pack, output, inventory):
    pack, output = Path(pack), Path(output)
    require(not output.exists() and not output.resolve().is_relative_to(pack.resolve()), 'Archive must be new and outside pack')
    with tarfile.open(output, 'w:gz', compresslevel=1, dereference=False) as archive:
        archive.add(pack, arcname='provider-pack')
    expected = {row['path']: row for row in inventory}
    observed = set()
    with tarfile.open(output, 'r:gz') as archive:
        for member in archive:
            if member.name == 'provider-pack':
                require(member.isdir(), 'Archive root must be directory')
                continue
            relative = member.name.removeprefix('provider-pack/')
            require(member.name.startswith('provider-pack/') and relative in expected and relative not in observed, 'Unexpected archive member')
            row = expected[relative]; observed.add(relative)
            require(member.mode == row['mode'], 'Archive mode mismatch')
            if row['kind'] == 'directory':
                require(member.isdir(), 'Archive directory mismatch')
            elif row['kind'] == 'symlink':
                require(member.issym() and member.linkname == row['target'], 'Archive symlink mismatch')
            else:
                require(member.isfile() and member.size == row['size'], 'Archive file mismatch')
                digest = hashlib.sha256()
                with archive.extractfile(member) as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b''): digest.update(chunk)
                require(digest.hexdigest() == row['sha256'], 'Archive bytes mismatch')
    require(observed == set(expected), 'Archive omitted pack members')
    return {'path':str(output), 'sha256':sha(output), 'bytes':output.stat().st_size,
            'inventoryVerified':True, 'internalSymlinksAndModesPreserved':True}
