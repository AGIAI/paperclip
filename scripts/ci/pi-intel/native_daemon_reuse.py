"""Import one pinned native daemon; never execute an archive or infer rebuild provenance."""
import hashlib,json,os,shutil,stat,tarfile,zipfile
from pathlib import Path,PurePosixPath
from source_guard import require,sha

def safe_name(name):
    p=PurePosixPath(name)
    require(bool(name) and not p.is_absolute() and '..' not in p.parts and '\\' not in name,'Unsafe archive path')
    require(name.rstrip('/')==p.as_posix(),'Noncanonical archive path')
    return p

def extract_selected(archive,destination,pin):
    archive=Path(archive);destination=Path(destination)
    require(archive.is_file() and not archive.is_symlink(),'Missing or linked trusted artifact ZIP')
    require(archive.stat().st_size==pin['artifactZipBytes'] and sha(archive)==pin['artifactZipSha256'],'Trusted artifact ZIP mismatch')
    destination.mkdir(mode=0o700,parents=True,exist_ok=False)
    with zipfile.ZipFile(archive) as z:
        entries=z.infolist();names=[e.filename for e in entries]
        require(len(names)==len(set(names)) and len(entries)<10000,'Duplicate or excessive ZIP entries')
        require(sum(e.file_size for e in entries)<=16*1024**3,'ZIP expanded size exceeds evidence bound')
        for e in entries:
            safe_name(e.filename);kind=stat.S_IFMT(e.external_attr>>16)
            require(kind in (0,stat.S_IFREG,stat.S_IFDIR),'Linked or special ZIP entry')
        for name,expected in pin['selectedFiles'].items():
            require(safe_name(name).name==name,'Selected member must be top-level')
            item=z.getinfo(name)
            require(not item.is_dir() and item.file_size==expected['bytes'],'Selected member shape mismatch')
            target=destination/name
            with z.open(item) as source,target.open('xb') as output:shutil.copyfileobj(source,output,1024*1024)
            target.chmod(0o600)
            require(sha(target)==expected['sha256'],'Selected member digest mismatch')
    return destination

def archive_inventory(archive):
    result={}
    with tarfile.open(archive,'r:') as tar:
        for item in tar:
            safe_name(item.name)
            require(item.name not in result,'Duplicate source archive entry')
            if item.isdir():continue
            if item.isfile():
                stream=tar.extractfile(item);h=hashlib.sha256()
                for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
                row={'kind':'file','sha256':h.hexdigest(),'mode':item.mode,'size':item.size}
            else:
                require(item.issym(),'Unsupported source archive member')
                row={'kind':'symlink','target':item.linkname,'mode':item.mode}
            result[item.name]=row
    return result

def native_path(name):
    p=PurePosixPath(name)
    return (name.startswith(('packages/paperclip-runner/runner/','packages/paperclip-runner/protocol/'))
            or p.suffix=='.rs' or p.name in ('Cargo.toml','Cargo.lock','rust-toolchain','rust-toolchain.toml')
            or '.cargo' in p.parts)

def compare_declared_inputs(original,current,allowed_delta):
    old_native={p:v for p,v in original.items() if native_path(p)}
    new_native={p:v for p,v in current.items() if native_path(p)}
    require(old_native and old_native==new_native,'Declared native source/config/protocol inputs differ')
    require(all(row['kind']=='file' for row in old_native.values()),'Native input symlink refused')
    # Also reject ANY other source delta, including otherwise unrecognized native inputs.
    delta=sorted(p for p in set(original)|set(current) if original.get(p)!=current.get(p))
    require(delta==sorted(allowed_delta),'Unexpected full source delta')
    require(not any(native_path(p) for p in allowed_delta),'Native input cannot be excepted')
    return {'nativeInputs':old_native,'sourceDelta':{p:{'original':original.get(p),'candidate':current.get(p)} for p in delta}}

def import_daemon(archive,current_archive,destination,daemon,pin):
    retained=extract_selected(archive,destination,pin)
    require(sha(retained/'source.tar')==pin['sourceArchiveSha256'],'Original source archive mismatch')
    original=json.loads((retained/'receipt.json').read_text())
    require(original['sourceRevision']==pin['originalBuildSource'] and original['runId']==pin['artifactRunId'] and original['runAttempt']=='1','Original build identity mismatch')
    require(original['trustedWorkflowRevision']==pin['artifactWorkflowRevision'],'Original workflow mismatch')
    require(original['helpers']['verify.py']==pin['originalVerifierSha256'],'Original build recipe mismatch')
    require(original['compiler']==pin['compiler'],'Original compiler provenance mismatch')
    require(original['daemonSha256']==pin['selectedFiles']['paperclip-runnerd']['sha256'],'Original daemon binding mismatch')
    commands={r['label']:r for r in original['commands']}
    require(len(commands)==len(original['commands']),'Duplicate original command labels')
    for name in ('rust-install','rust-version-verbose','daemon-build','daemon-sign','daemon-architecture','daemon-metadata'):
        require(commands[name]['exitCode']==0 and commands[name]['status']=='passed','Original native production step did not pass')
    require(commands['daemon-build']['command'][1:]==pin['buildCommandTail'],'Original build flags mismatch')
    require(original['daemonBuildMetadata']==pin['daemonBuildMetadata'],'Original daemon metadata mismatch')
    require(original['cleanupUncertain'] is False,'Original process cleanup uncertain')
    old=archive_inventory(retained/'source.tar');current=archive_inventory(current_archive)
    equality=compare_declared_inputs(old,current,pin['sourceDeltaAllowed'])
    inventory=json.loads((retained/'source-input-inventory.json').read_text())
    require(original['sourceInputInventorySha256']==sha(retained/'source-input-inventory.json'),'Original source inventory binding mismatch')
    require(all(inventory[p]==row['sha256'] for p,row in equality['nativeInputs'].items()),'Original native input inventory mismatch')
    (retained/'declared-input-equality.json').write_text(json.dumps(equality,indent=2)+'\n')
    daemon=Path(daemon);daemon.parent.mkdir(parents=True,exist_ok=True)
    require(not os.path.lexists(daemon),'Refuse overwriting generated native daemon')
    shutil.copyfile(retained/'paperclip-runnerd',daemon);daemon.chmod(0o755)
    require(sha(daemon)==pin['selectedFiles']['paperclip-runnerd']['sha256'],'Imported daemon changed')
    return {'schema':pin['schema'],'originalBuildSource':pin['originalBuildSource'],'nativeInputEquivalentTo':pin['nativeInputEquivalentTo'],
            'artifactRunId':pin['artifactRunId'],'artifactId':pin['artifactId'],'artifactZipSha256':sha(archive),
            'selectedFiles':pin['selectedFiles'],'compiler':pin['compiler'],'buildCommandTail':pin['buildCommandTail'],
            'declaredInputCount':len(equality['nativeInputs']),'declaredInputEqualitySha256':sha(retained/'declared-input-equality.json'),
            'currentSourceArchiveSha256':sha(current_archive),'daemonSha256':sha(daemon),
            'missingOriginalToolchainEvidence':pin['missingOriginalToolchainEvidence'],'claims':pin['claims'],
            'historicalQualificationStatus':original['status'],'historicalTestFailures':original.get('testFailures',[])}
