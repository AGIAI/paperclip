import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Paperclip } from "lucide-react";
import { publicMcpApi } from "@/api/publicMcp";
import { ApiError } from "@/api/client";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { Link } from "@/lib/router";
import { CompanyPatternIcon } from "@/components/CompanyPatternIcon";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const ASSISTANT_CONNECTION_PATH = "/apps/assistant-connection";
const connectionsKey = ["mcp-connections"];
type Assistant = "codex" | "claude" | "opencode" | "other";
const assistants: Record<Assistant, string> = { codex: "Codex", claude: "Claude Code", opencode: "OpenCode", other: "Other" };

function useConnections(poll = false) {
  const { selectedCompanyId } = useCompany();
  const query = useQuery({
    queryKey: connectionsKey, queryFn: publicMcpApi.connections, retry: false,
    enabled: Boolean(selectedCompanyId), refetchInterval: poll ? 5000 : false,
  });
  return { ...query, rows: (query.data ?? []).filter(row => row.companyId === selectedCompanyId) };
}

/** Inbound assistant access belongs beside the existing outbound connectors. */
export function AssistantConnectionCard({ onNavigate }: { onNavigate: (href: string) => void }) {
  const connections = useConnections();
  const active = connections.rows.filter(row => !row.revokedAt);
  const action = !connections.isSuccess ? "Open" : active.length ? "Manage" : "Set up";
  return <div role="listitem" data-app-slug="assistant-connection" data-connected={connections.isSuccess ? String(active.length > 0) : undefined} className="overflow-hidden rounded-xl border border-border">
    <div className="flex flex-wrap items-center gap-3 px-4 py-4">
      <Paperclip className="size-9 shrink-0 p-1 text-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-foreground">Assistant Connection (MCP)</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Use your Paperclip organization from Codex, Claude, OpenCode, or another assistant.</p>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={() => onNavigate(ASSISTANT_CONNECTION_PATH)} aria-label={`${action} Assistant Connection (MCP)`}>{action}</Button>
    </div>
    {connections.isPending && <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">Checking your connection status…</p>}
    {connections.isError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
      <p className="text-xs text-destructive">Couldn’t load your connection status.</p>
      <Button size="sm" variant="ghost" disabled={connections.isFetching} onClick={() => void connections.refetch()}>Try again</Button>
    </div>}
    {connections.isSuccess && active.length > 0 && <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3 text-sm">
      <Check className="size-4 text-muted-foreground" aria-hidden="true" />
      <span>{active.map(row => row.clientName).join(", ")}</span>
      <span className="text-xs text-muted-foreground">Connected as you</span>
    </div>}
  </div>;
}

/** Only copy user-visible, non-secret setup values. Never execute them here. */
function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => { setCopied(false); setError(false); }, [value]);
  return <div className="space-y-2">
    <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3">
      <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{value}</pre>
      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label={`Copy ${label}`} onClick={async () => {
        try { await navigator.clipboard.writeText(value); setCopied(true); setError(false); }
        catch { setError(true); }
      }}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}</Button>
    </div>
    <p role="status" className="text-xs text-muted-foreground">{error ? "Couldn’t copy. Select and copy the text above." : copied ? "Copied" : null}</p>
  </div>;
}

function setupError(error: Error): string {
  if (error instanceof ApiError && error.status === 401) return "Sign in to connect an assistant. This requires a Paperclip instance with authenticated user accounts.";
  if (error instanceof ApiError && error.status === 404) return "Assistant connections need an authenticated instance with a public HTTPS URL. Ask your instance administrator to configure the public URL, then try again.";
  return "Couldn’t load assistant setup. Try again in a moment.";
}

export function AssistantConnection({ initialAssistant = "codex" }: { initialAssistant?: Assistant } = {}) {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const client = useQueryClient();
  const [assistant, setAssistant] = useState<Assistant>(initialAssistant);
  const setup = useQuery({ queryKey: ["mcp-setup"], queryFn: publicMcpApi.setup, retry: false, refetchOnWindowFocus: "always", refetchOnMount: "always" });
  const connections = useConnections(setup.data?.enabled === true);
  const revoke = useMutation({ mutationFn: publicMcpApi.revoke, onSuccess: () => client.invalidateQueries({ queryKey: connectionsKey }) });
  useEffect(() => {
    setBreadcrumbs([{ label: "Connectors", href: "/apps" }, { label: "Assistant Connection (MCP)" }]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);
  if (!selectedCompanyId || !selectedCompany) return <p className="text-sm text-muted-foreground">Select an organization to connect an assistant.</p>;
  const serverUrl = setup.data?.serverUrl ?? "";
  // A canonical server origin is supplied by Paperclip, never inferred from a proxy or a browser query parameter.
  const quotedUrl = `'${serverUrl.replaceAll("'", "'\"'\"'")}'`;
  const config = JSON.stringify({ mcp: { paperclip: { type: "remote", url: serverUrl, enabled: true, oauth: { scope: "paperclip:read paperclip:write offline_access" } } } }, null, 2);
  const active = connections.rows.filter(row => !row.revokedAt);
  return <div className="max-w-3xl space-y-6 pb-8">
    <header className="space-y-4">
      <div className="flex items-center gap-3"><Paperclip className="size-7 shrink-0" /><h1 className="text-xl font-semibold">Assistant Connection (MCP)</h1></div>
      <div className="flex items-center gap-3">
        <CompanyPatternIcon companyName={selectedCompany.name} logoUrl={selectedCompany.logoUrl} className="size-12 shrink-0 rounded-lg" />
        <div className="space-y-1"><p className="font-medium">{selectedCompany.name}</p><p className="text-sm text-muted-foreground">Connect your assistant to Paperclip. Review work, create tasks, and follow up using your account’s access to this organization.</p></div>
      </div>
    </header>
    {setup.isPending && <p className="text-sm text-muted-foreground">Loading assistant setup…</p>}
    {setup.error && <div role="alert" className="space-y-3"><p className="text-sm text-destructive">{setupError(setup.error)}</p><Button variant="outline" onClick={() => void setup.refetch()}>Try again</Button></div>}
    {setup.data && !setup.data.enabled && <section className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
      <h2 className="text-sm font-semibold">Enable assistant connections</h2>
      <p className="text-sm text-muted-foreground">An instance administrator must turn on Assistant connections (MCP) in Experimental settings. Then return here to connect your assistant.</p>
      <Button variant="outline" asChild><Link to="/company/settings/instance/experimental">Open Experimental settings</Link></Button>
    </section>}
    {setup.data?.enabled && <>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Choose your assistant</h2>
        <Tabs value={assistant} onValueChange={value => setAssistant(value as Assistant)}><TabsList className="flex h-auto flex-wrap justify-start">{Object.entries(assistants).map(([value, name]) => <TabsTrigger key={value} value={value}>{name}</TabsTrigger>)}</TabsList></Tabs>
      </section>
      <section className="space-y-3" aria-label={`Set up ${assistants[assistant]}`}>
        <h2 className="text-sm font-semibold">1. Add Paperclip to {assistants[assistant] === "Other" ? "your assistant" : assistants[assistant]}</h2>
        {assistant === "opencode" ? <><p className="text-sm text-muted-foreground">Add this entry to your project’s opencode.json. Keep any other settings you already use.</p><CopyValue value={config} label="OpenCode configuration" /></>
          : assistant === "other" ? <><p className="text-sm text-muted-foreground">Add a remote MCP server using this URL. Choose OAuth / browser sign-in when your assistant asks how to connect.</p><CopyValue value={serverUrl} label="MCP server URL" /></>
          : <><p className="text-sm text-muted-foreground">Run this in a terminal on the computer where you use {assistants[assistant]}.</p><CopyValue value={assistant === "codex" ? `codex mcp add paperclip --url ${quotedUrl}` : `claude mcp add --transport http paperclip ${quotedUrl}`} label="setup command" /></>}
        <h2 className="text-sm font-semibold">2. Sign in and approve access</h2>
        {assistant === "opencode" && <><p className="text-sm text-muted-foreground">Run this from the same project directory. OpenCode opens Paperclip’s sign-in and consent page in your browser.</p><CopyValue value="opencode mcp auth paperclip" label="sign-in command" /></>}
        {assistant === "codex" && <><p className="text-sm text-muted-foreground">Run this command to open Paperclip’s sign-in and consent page in your browser.</p><CopyValue value="codex mcp login paperclip --scopes paperclip:read,paperclip:write,offline_access" label="sign-in command" /></>}
        {assistant === "claude" && <p className="text-sm text-muted-foreground">Open Claude Code, run /mcp, select paperclip, and choose Authenticate. Claude opens Paperclip’s sign-in and consent page in your browser.</p>}
        {assistant === "other" && <p className="text-sm text-muted-foreground">Use your assistant’s Connect or Authenticate action. It opens Paperclip’s sign-in and consent page in your browser.</p>}
        <p className="text-sm">Choose <strong>{selectedCompany.name}</strong>, review read and write access, then click <strong>Connect organization</strong>. Return here after approval; your connection appears below automatically.</p>
        <p className="text-xs text-muted-foreground">Creating tasks and adding comments may start agent work using the organization’s configured execution budget.</p>
        {assistant === "opencode" && <><h2 className="text-sm font-semibold">3. Open your assistant</h2><p className="text-sm text-muted-foreground">After sign-in completes, start the browser app from that project directory. If it was already running, restart it to pick up the connection.</p><CopyValue value="opencode web" label="OpenCode launch command" /></>}
      </section>
      <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">MCP server URL</summary><div className="pt-3"><CopyValue value={serverUrl} label="MCP server URL" /></div></details>
    </>}
    <section className="space-y-3" aria-labelledby="connected-assistants">
      <h2 id="connected-assistants" className="text-sm font-semibold">Your connected assistants</h2>
      {connections.isPending && <p className="text-sm text-muted-foreground">Loading connections…</p>}
      {(connections.error || revoke.error) && <p role="alert" className="text-sm text-destructive">{revoke.error ? "Couldn’t revoke this connection. Try again." : "Couldn’t load your connections. Try again."} <button type="button" className="underline" onClick={() => void connections.refetch()}>Refresh</button></p>}
      {connections.isSuccess && connections.rows.length === 0 && <p className="text-sm text-muted-foreground">No assistants connected to {selectedCompany.name} yet.</p>}
      <div className="divide-y divide-border">{connections.rows.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="space-y-1"><p className="text-sm font-medium">{row.clientName}</p><p className="text-xs text-muted-foreground">{row.revokedAt ? "Revoked" : `Connected as you · ${row.scopes.includes("paperclip:write") ? "Read and write" : "Read only"}`}</p></div>
        {!row.revokedAt && <Button variant="outline" size="sm" disabled={revoke.isPending} onClick={() => revoke.mutate(row.id)} aria-label={`Revoke ${row.clientName} connection`}>Revoke</Button>}
      </div>)}</div>
      {active.length > 0 && <><p className="text-xs text-muted-foreground">Revoking stops future assistant calls. Work already delegated continues.</p>{setup.data?.enabled && <div className="space-y-2 pt-3"><h3 className="text-sm font-semibold">Try it in your assistant</h3><CopyValue value={`Show me the agents and open tasks in my ${selectedCompany.name} Paperclip organization.`} label="first prompt" /></div>}</>}
    </section>
    <footer className="flex items-center justify-between gap-3 border-t border-border pt-4"><Button variant="ghost" asChild><Link to="/apps">Back to Connections</Link></Button><a className="inline-flex items-center gap-1 text-xs text-muted-foreground underline" href={assistant === "opencode" ? "https://opencode.ai/docs/mcp-servers/" : assistant === "claude" ? "https://code.claude.com/docs/en/mcp" : "https://developers.openai.com/codex/mcp"} target="_blank" rel="noreferrer">Setup documentation <ExternalLink className="size-3" /></a></footer>
  </div>;
}
