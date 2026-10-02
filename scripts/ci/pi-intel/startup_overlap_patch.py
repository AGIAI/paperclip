"""Apply an exact compiled two-module derivative, without executing bundle contents."""
import hashlib


def apply_overlap(original, patch):
    def require(value, message):
        if not value:
            raise ValueError(message)

    require(isinstance(original, bytes) and len(original) <= 8 * 1024 * 1024,
            'Original sidecar bound')
    require(patch.get('schema') == 'paperclip.exact-sidecar-overlap-patch/v1',
            'Unexpected patch schema')
    require(hashlib.sha256(original).hexdigest() == patch['originalSha256'],
            'Original sidecar identity mismatch')
    lines = original.decode('utf-8').splitlines(keepends=True)
    operations = patch['operations']
    require(isinstance(operations, list) and 0 < len(operations) <= 64,
            'Patch operation bound')
    result = []
    cursor = 0
    previous = -1
    added_bytes = 0
    for operation in operations:
        require(set(operation) == {'oldStartLine', 'oldLines', 'newLines'},
                'Unexpected patch fields')
        start, old, new = (operation[key] for key in
                           ['oldStartLine', 'oldLines', 'newLines'])
        require(type(start) is int and previous < start and cursor <= start <= len(lines),
                'Overlapping or unordered patch operation')
        require(isinstance(old, list) and isinstance(new, list)
                and all(isinstance(line, str) for line in old + new),
                'Malformed patch lines')
        require(lines[start:start + len(old)] == old, 'Original patch context mismatch')
        require(start + len(old) <= len(lines), 'Patch past original end')
        added_bytes += sum(len(line.encode('utf-8')) for line in new)
        require(added_bytes <= 256 * 1024, 'Patch addition bound')
        result.extend(lines[cursor:start])
        result.extend(new)
        cursor, previous = start + len(old), start
    result.extend(lines[cursor:])
    candidate = ''.join(result).encode('utf-8')
    require(len(candidate) <= 8 * 1024 * 1024, 'Candidate sidecar bound')
    require(hashlib.sha256(candidate).hexdigest() == patch['candidateSha256'],
            'Compiled candidate identity mismatch')
    return candidate
