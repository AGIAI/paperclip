import { useQuery } from "@tanstack/react-query";
import { toolsApi } from "@/api/tools";
import { queryKeys } from "@/lib/queryKeys";
import { AiConnectionPoolConnector } from "@/components/ai-connections/AiConnectionPoolConnector";
import { ConnectionSetupFlow } from "@/features/connections/ConnectionSetupFlow";
import type { ToolConnectionCredentialSource } from "@paperclipai/shared";
import { useCompany } from "@/context/CompanyContext";
import { useNavigate, useParams, useSearchParams } from "@/lib/router";
import { consumeSkillSourceReturn, skillSourceReturnPath } from "@/lib/skill-source-connect-return";

export { AccessStep, OAuthConnectStateScreen, type OAuthConnectPhase } from "@/features/connections/ConnectionSetupFlow";

/** Full-page host for the same setup used by inline connection requests. */
export function AppsConnect({ byoOnly = false, credentialSource = "paperclip_vault" }: {
  byoOnly?: boolean;
  credentialSource?: ToolConnectionCredentialSource;
} = {}) {
  const { selectedCompanyId } = useCompany();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { appKey } = useParams<{ appKey?: string }>();
  const source = searchParams.get("source") ?? appKey ?? searchParams.get("appKey");
  const gallery = useQuery({ queryKey: queryKeys.apps.gallery(selectedCompanyId ?? "__none__"), queryFn: () => toolsApi.listGallery(selectedCompanyId!), enabled: !!selectedCompanyId && !!source?.startsWith("ai-router-") });
  const router = gallery.data?.apps.find(app => app.slug === source)?.aiConnectionRouter;
  const returningToSkills = source === "github" && selectedCompanyId && skillSourceReturnPath(selectedCompanyId);
  function returnToSkills() {
    const path = selectedCompanyId && consumeSkillSourceReturn(selectedCompanyId);
    if (path) navigate(path);
  }
  if (source?.startsWith("ai-router-")) {
    if (gallery.isPending) return <p role="status">Loading connector…</p>;
    if (!router) return <p role="alert">{gallery.error?.message ?? "This connection pool plugin is unavailable. Enable it in Plugins."}</p>;
    return <AiConnectionPoolConnector pluginKey={router.pluginKey} />;
  }
  return <ConnectionSetupFlow byoOnly={byoOnly} credentialSource={credentialSource} host="page"
    onComplete={returningToSkills ? returnToSkills : undefined}
    onCancel={returningToSkills ? returnToSkills : undefined} />;
}
