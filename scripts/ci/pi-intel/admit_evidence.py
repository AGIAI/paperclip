#!/usr/bin/env python3
"""Bound the complete evidence upload; never truncate the tested pack or diagnostics."""
import argparse
import json
from pathlib import Path
import stat

MAX_BYTES = 16 * 1024 ** 3
RETENTION_DAYS = 7

def regular_bytes(root):
    total = 0
    for path in root.rglob('*'):
        mode = path.lstat().st_mode
        if stat.S_ISREG(mode): total += path.stat().st_size
        elif not stat.S_ISDIR(mode): raise RuntimeError('Evidence contains a symlink or special entry: ' + str(path))
    return total

def admit_evidence(root, maximum_bytes=MAX_BYTES):
    root = Path(root)
    if root.is_symlink() or not root.is_dir(): raise RuntimeError('Evidence root missing or linked')
    admission = root/'artifact-admission.json'
    receipt = root/'receipt.json'
    data = {'status':'checking', 'regularFileBytes':0, 'maximumBytes':maximum_bytes,
            'retentionDays':RETENTION_DAYS, 'truncated':False,
            'costScope':'Artifact storage only; standard public-runner minutes are separate.',
            'priceUsdPerGiBMonth':0.25, 'conservativeMonthDays':28,
            'maximumEstimatedStorageUsd':round(maximum_bytes / 1024**3 * RETENTION_DAYS / 28 * 0.25, 6),
            'billingPolicyUrl':'https://docs.github.com/en/billing/concepts/product-billing/github-actions'}
    # Include these receipt bytes themselves; settle the decimal-size field before admission.
    for _ in range(10):
        admission.write_text(json.dumps(data, indent=2)+'\n')
        if receipt.exists():
            full = json.loads(receipt.read_text()); full['artifactStorage'] = data
            receipt.write_text(json.dumps(full, indent=2)+'\n')
        actual = regular_bytes(root)
        status = 'admitted_complete_evidence' if actual <= maximum_bytes else 'rejected_storage_cap'
        if data['regularFileBytes'] == actual and data['status'] == status: return data
        data.update(regularFileBytes=actual, status=status)
    raise RuntimeError('Evidence size accounting did not stabilize')

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence',type=Path,required=True)
    parser.add_argument('--github-output',type=Path,required=True)
    args=parser.parse_args();result=admit_evidence(args.evidence)
    admitted=result['status']=='admitted_complete_evidence'
    with args.github_output.open('a') as output:output.write('admitted='+str(admitted).lower()+'\n')
    print(json.dumps(result))
    raise SystemExit(0 if admitted else 1)
