"""Private qualification cleanup. Journals identities, never argv/environment.

Postgres is not an ordinary kill-tree leaf. The installed embedded-postgres
stop() uses SIGINT and awaits exit. Give a known wrapper sole graceful-signal ownership before native cleanup.
Unknown database/initializer identities never receive fallback TERM/KILL.
"""
import datetime, hashlib, json, os, pathlib, shlex, signal, stat, subprocess, threading, time
from cleanup_policy import (OWNER_GRACE_SECONDS,POSTGRES_GRACE_SECONDS,RESIDUAL_GRACE_SECONDS,KILL_GRACE_SECONDS,INSPECTION_RETRY_SECONDS,STOP_DEADLINE_SECONDS)

def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def atomic_json(path, value):
    path=pathlib.Path(path); tmp=path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value,indent=2)+'\n'); tmp.chmod(0o600); tmp.replace(path)
def process_table(*, timeout=2):
    result={}
    for line in subprocess.check_output(['/bin/ps','-axo','pid=,ppid=,lstart=,stat=,comm='],text=True,timeout=timeout).splitlines():
        row=line.split(maxsplit=8)
        if len(row)!=9: continue
        status={'R':'running','S':'sleeping','I':'idle','T':'stopped','Z':'zombie','U':'uninterruptible'}.get(row[7][:1],'unknown')
        result[int(row[0])]={'parent':int(row[1]),'started':' '.join(row[2:7]),'status':status,'executable':row[8]}
    return result

class ProcessInspectionUnavailable(Exception):
    """No trustworthy argv snapshot; caller must revalidate identity."""

def command_tokens(pid, *, timeout=2):
    # Inspect only an already owned PID; never persist or print this output.
    try:value=subprocess.check_output(['/bin/ps','-p',str(pid),'-o','command='],text=True,stderr=subprocess.DEVNULL,timeout=timeout)
    except (subprocess.SubprocessError,OSError) as error:raise ProcessInspectionUnavailable() from error
    if not value.strip() or len(value)>16384:raise ProcessInspectionUnavailable()
    try:return shlex.split(value)
    except ValueError as error:raise ProcessInspectionUnavailable() from error

class OwnedProcesses:
    def __init__(self, journal, private_root, app_root, sidecar_path, *, table=process_table,
                 argv=command_tokens, send=os.kill, clock=time.monotonic, sleep=time.sleep,
                 app_grace=OWNER_GRACE_SECONDS, postgres_grace=POSTGRES_GRACE_SECONDS, root_grace=RESIDUAL_GRACE_SECONDS, kill_grace=KILL_GRACE_SECONDS):
        self.journal=pathlib.Path(journal); self.root=pathlib.Path(private_root).resolve()
        st=self.root.lstat()
        if not stat.S_ISDIR(st.st_mode) or st.st_uid!=os.getuid() or st.st_mode&0o077: raise ValueError('private root ownership invalid')
        self.root_identity=(st.st_dev,st.st_ino,st.st_uid)
        self.app=str(pathlib.Path(app_root)); self.sidecar=str(pathlib.Path(sidecar_path))
        self.table=table;self.argv=argv;self.send=send;self.clock=clock;self.sleep=sleep
        self.budgets=(app_grace,postgres_grace,root_grace,kill_grace)
        self.owned={};self.actions=[];self.root_pid=None;self.lock=threading.RLock();self.stopping=False;self.stop_result=None
        self.postmasters={} # trusted paths are private in-memory only
        self.stop_done=threading.Event();self.stop_thread=None;self.stop_deadline=None;self.inspection_failures=0
    def _role(self,pid,row):
        name=pathlib.Path(row['executable']).name
        if name=='paperclip-runnerd': return 'runnerd'
        if name=='copilot': return 'copilot'
        if name=='initdb': return 'initdb'
        if name=='postgres' or name.startswith('postgres:'):
            tokens=self.argv(pid)
            if '-D' in tokens:
                i=tokens.index('-D')
                if i+1<len(tokens):
                    data=pathlib.Path(tokens[i+1]).resolve()
                    if data.is_relative_to(self.root):
                        self.postmasters[pid]=data
                        return 'postgres_postmaster_candidate'
            return 'postgres_backend'
        if name in ('node','nodejs'):
            tokens=self.argv(pid)
            if self.sidecar in tokens:return 'acpx_sidecar'
            if self.app+'/tests/runner-e2e/server-entry.ts' in tokens:return 'paperclip_server'
            if self.app+'/tests/runner-e2e/server.ts' in tokens:return 'product_server_supervisor'
            if self.app+'/tests/runner-e2e/launch.ts' in tokens:return 'product_launcher'
            return 'node'
        return {'sh':'shell','bash':'shell','zsh':'shell','python3':'supervisor','Python':'supervisor','Chromium':'browser'}.get(name,'other')
    def observe(self,root_pid=None):
        with self.lock:
            if root_pid is not None and self.root_pid is None:self.root_pid=root_pid
            rows=self.table();live={pid for pid,r in self.owned.items() if rows.get(pid,{}).get('started')==r['started']}
            if self.root_pid not in self.owned and self.root_pid in rows: live.add(self.root_pid)
            while True:
                extra={pid for pid,r in rows.items() if r['parent'] in live}-live
                if not extra:break
                live|=extra
            for pid in list(live):
                if self.stop_deadline is not None and self.clock()>=self.stop_deadline:raise ProcessInspectionUnavailable()
                row=rows[pid]
                if self.stopping or pid not in self.owned or self.owned[pid]['role']=='unresolved_inspection':
                    try:role=self._role(pid,row)
                    except ProcessInspectionUnavailable:
                        current=self.table().get(pid)
                        if current is None or current['started']!=row['started']:
                            # Natural exit/reuse between snapshots is not a
                            # supervisor failure and never creates ownership.
                            live.discard(pid);rows.pop(pid,None);continue
                        role='unresolved_inspection'
                    if pid not in self.owned:self.owned[pid]={'parent':row['parent'],'started':row['started'],'role':role,'firstObservedAt':now(),'firstObservedMonotonic':self.clock()}
                    else:self.owned[pid]['role']=role
                self.owned[pid].update(status=row['status'],lastObservedAt=now(),lastObservedMonotonic=self.clock())
            for pid,r in self.owned.items():
                if pid not in live:r['status']='gone_or_identity_changed'
            self._persist()
            return rows
    def _persist(self):
        with self.lock:atomic_json(self.journal,{'schema':'qualification-owned-processes/v2','recordedAt':now(),'rootPid':self.root_pid,'owned':self.owned,'actions':self.actions,'stopResult':self.stop_result,'rawArgvRetained':False,'rawEnvironmentRetained':False,'inspectionFailures':self.inspection_failures})
    def live(self,rows=None):
        rows=self.observe() if rows is None else rows
        return {pid for pid,r in self.owned.items() if rows.get(pid,{}).get('started')==r['started'] and rows[pid].get('status')!='zombie'}
    def _fresh(self):
        end=min(self.clock()+INSPECTION_RETRY_SECONDS,self.stop_deadline or float('inf'))
        while True:
            try:
                rows=self.observe()
                live=self.live(rows)
                if any(self.owned[pid]['role']=='unresolved_inspection' or rows[pid].get('status')=='unknown' for pid in live):raise ProcessInspectionUnavailable()
                return rows
            except (ProcessInspectionUnavailable,subprocess.SubprocessError,OSError):
                self.inspection_failures+=1
                if self.clock()>=end:raise ProcessInspectionUnavailable() from None
                self.sleep(min(.1,end-self.clock()))
    def _signal(self,pid,sig,reason):
        if pid<=1 or pid==os.getpid():raise ProcessInspectionUnavailable()
        rows=self._fresh();live=self.live(rows)
        if pid not in live:return False
        if reason=='sole_graceful_owner' and pid not in self._owners(live,rows):return False
        role=self.owned[pid]['role']
        # Reclassify at every signal boundary, including exec under the same PID.
        database=self._postgres(live) or any(self.owned[p]['role']=='initdb' for p in live)
        if (sig==signal.SIGKILL or reason=='post_owner_non_database_fallback') and database:raise ProcessInspectionUnavailable()
        if role=='initdb' or (role.startswith('postgres_') and (sig!=signal.SIGINT or not self._verified_postmaster(pid))):raise ProcessInspectionUnavailable()
        action={'at':now(),'pid':pid,'started':self.owned[pid]['started'],'role':role,'signal':signal.Signals(sig).name,'reason':reason,'delivery':'pending'}
        with self.lock:self.actions.append(action);self._persist()
        try:self.send(pid,sig)
        except ProcessLookupError:
            with self.lock:action['delivery']='not_delivered_process_absent';self._persist()
            return False
        with self.lock:action['delivery']='delivered';self._persist()
        return True
    def _postgres(self,live):return {pid for pid in live if self.owned[pid]['role'].startswith('postgres_')}
    def _verified_postmaster(self,pid):
        rows=self.observe(); r=self.owned.get(pid)
        if not r or pid not in self.live(rows) or pid not in self.postmasters:return False
        root_stat=self.root.lstat()
        if (root_stat.st_dev,root_stat.st_ino,root_stat.st_uid)!=self.root_identity:return False
        data=self.postmasters[pid];file=data/'postmaster.pid'
        try:
            fd=os.open(file,os.O_RDONLY|os.O_NOFOLLOW)
            try:
                st=os.fstat(fd)
                if not stat.S_ISREG(st.st_mode) or st.st_uid!=os.getuid() or st.st_nlink!=1 or st.st_size>4096:return False
                lines=os.read(fd,4096).decode().splitlines()
            finally:os.close(fd)
            if int(lines[0])!=pid or pathlib.Path(lines[1]).resolve()!=data:return False
            started=time.mktime(time.strptime(r['started'],'%a %b %d %H:%M:%S %Y'))
            if abs(int(lines[2])-started)>2:return False
            return True
        except (OSError,ValueError,IndexError):return False
    def _wait(self,seconds,predicate):
        end=min(self.clock()+seconds,self.stop_deadline or float('inf'))
        while True:
            rows=self._fresh();live=self.live(rows)
            if predicate(live):return True
            if self.stop_deadline is not None and self.clock()>=self.stop_deadline-1e-9:raise ProcessInspectionUnavailable()
            if self.clock()>=end-1e-9:return False
            self.sleep(min(.1,end-self.clock()))
    def stop(self,root_pid=None):
        thread=threading.get_ident()
        with self.lock:
            if self.stopping:owner=self.stop_thread==thread
            else:
                self.stopping=True;self.stop_thread=thread;owner=None
                self.stop_deadline=self.clock()+STOP_DEADLINE_SECONDS
        if owner is not None:
            if not owner:self.stop_done.wait(timeout=STOP_DEADLINE_SECONDS+2)
            return self.stop_result or {'status':'cleanup_in_progress','remainingOwnedPids':None,'postgresKilled':False}
        try:
            return self._stop(root_pid)
        except (ProcessInspectionUnavailable,subprocess.SubprocessError,OSError):
            return self._finish('unresolved_process_inspection',None)
        finally:self.stop_done.set()
    def _finish(self,status,live):
        self.stop_result={'status':status,'remainingOwnedPids':sorted(live) if live is not None else None,
                          'lastObservedOwnedPids':sorted(pid for pid,r in self.owned.items() if r['status']!='gone_or_identity_changed'),
                          'inspectionComplete':live is not None,'postgresKilled':False,
                          'cleanupDurationSeconds':round(self.clock()-(self.stop_deadline-STOP_DEADLINE_SECONDS),3),
                          'cleanupDeadlineSeconds':STOP_DEADLINE_SECONDS}
        if self.clock()>self.stop_deadline:self.stop_result['status']='unresolved_cleanup_deadline'
        self._persist();return self.stop_result
    def _owners(self,live,rows):
        # Prefer a wrapper while a server/database is live. Its stopServer path
        # owns the single signal to the real server. Never broadcast to providers.
        wrappers={pid for pid in live if self.owned[pid]['role']=='product_server_supervisor'}
        if len(wrappers)>1:
            # tsx may expose both its launcher and inner Node worker as server.ts.
            # Accept only one current, identity-validated ancestry chain; signal
            # its deepest wrapper, which owns stopServer, never both wrappers.
            def ancestors(pid):
                seen=set()
                while pid in live:
                    if pid in seen:raise ProcessInspectionUnavailable()
                    seen.add(pid)
                    current=rows.get(pid)
                    if not current or current['started']!=self.owned[pid]['started']:raise ProcessInspectionUnavailable()
                    pid=current['parent']
                return seen
            candidates={pid for pid in wrappers if wrappers.issubset(ancestors(pid))}
            if len(candidates)!=1:raise ProcessInspectionUnavailable()
            owner=next(iter(candidates))
            if any(owner not in ancestors(pid) for pid in live if self.owned[pid]['role']=='paperclip_server'):
                raise ProcessInspectionUnavailable()
            return {owner}
        if wrappers:return wrappers
        servers={pid for pid in live if self.owned[pid]['role']=='paperclip_server'}
        if servers:return servers
        if self._postgres(live) or any(self.owned[p]['role']=='initdb' for p in live):return set()
        if self.root_pid in live:return {self.root_pid}
        return {pid for pid in live if self.owned[pid]['parent'] not in live}
    def _stop(self,root_pid=None):
        with self.lock:
            if self.root_pid is None:self.root_pid=root_pid
        app_grace,pg_grace,root_grace,kill_grace=self.budgets
        live=self.live(self._fresh())
        if not live:return self._finish('stopped',live)
        delivered=set();selection_end=min(self.clock()+INSPECTION_RETRY_SECONDS,self.stop_deadline)
        while not delivered:
            rows=self._fresh();live=self.live(rows)
            if not live:return self._finish('stopped',live)
            owners=self._owners(live,rows)
            if not owners:return self._finish('unresolved_database_owner',live)
            for pid in sorted(owners):
                if self._signal(pid,signal.SIGTERM,'sole_graceful_owner'):
                    delivered.add(pid);break
            if not delivered:
                if self.clock()>=selection_end:return self._finish('unresolved_graceful_owner_delivery',self.live(self._fresh()))
                self.sleep(min(.1,selection_end-self.clock()))
        owners=delivered # Never signal a nested owner after any successful delivery.
        # Even an early root exit does not shorten this window for retained children.
        if self._wait(app_grace,lambda live:not live):return self._finish('stopped',set())
        live=self.live(self._fresh())
        if any(self.owned[p]['role']=='initdb' for p in live):return self._finish('unresolved_database_initialization',live)
        pg=self._postgres(live)
        for pid in sorted(pg):
            if self._verified_postmaster(pid):self._signal(pid,signal.SIGINT,'verified_postmaster_fast_shutdown')
        if pg and not self._wait(pg_grace,lambda live:not self._postgres(live)):
            return self._finish('unresolved_postgres_shutdown',self.live(self._fresh()))
        live=self.live(self._fresh())
        if any(self.owned[p]['role']=='initdb' for p in live):return self._finish('unresolved_database_initialization',live)
        # Inner owner had its full50s. Only now request remaining non-DB exits.
        for pid in sorted(live):
            if pid in owners or self.owned[pid]['role'] in ('paperclip_server','product_server_supervisor','product_launcher'):continue
            self._signal(pid,signal.SIGTERM,'post_owner_non_database_fallback')
        if self._wait(root_grace,lambda live:not live):return self._finish('stopped',set())
        live=self.live(self._fresh())
        if self._postgres(live) or any(self.owned[p]['role']=='initdb' for p in live):return self._finish('unresolved_late_database',live)
        for pid in sorted(live,reverse=True):self._signal(pid,signal.SIGKILL,'revalidated_non_database_fallback')
        self._wait(kill_grace,lambda live:not live)
        live=self.live(self._fresh())
        return self._finish('stopped' if not live else 'unresolved_owned_processes',live)
