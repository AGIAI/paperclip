#!/usr/bin/env python3
"""Retain complete reconstructable diagnostic delta, capped at 256MiB for seven days."""
import argparse,json
from pathlib import Path
from admit_evidence import admit_evidence
MAX_DIAGNOSTIC_BYTES=256*1024**2
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--evidence',type=Path,required=True);p.add_argument('--github-output',type=Path,required=True);a=p.parse_args()
 result=admit_evidence(a.evidence,MAX_DIAGNOSTIC_BYTES);accepted=result['status']=='admitted_complete_evidence'
 with a.github_output.open('a') as f:f.write('admitted='+str(accepted).lower()+'\n')
 print(json.dumps(result));raise SystemExit(0 if accepted else 1)
