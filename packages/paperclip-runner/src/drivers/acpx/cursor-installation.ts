import { join } from "node:path";

import { verifyNativeAcpxInstallation, type VerifiedAcpxInstallation } from "./installation-integrity.js";
import type { NativeAcpxDistributionInput } from "./native-distribution-integrity.js";
import { CURSOR_FIXED_ARGUMENTS } from "./cursor-launch-policy.js";
import { QUALIFIED_ACPX_PROFILES, type QualifiedAcpxProfile } from "./qualified-profiles.js";
import { resolveRunnerProviderAssetsRoot } from "./provider-assets-root.js";

export const CURSOR_PINNED_VERSION = "2026.09.26-dd393fe";
const CLOSURE_PINS = Object.freeze({
  "darwin-arm64": "89e28235685ab31d78779eccd5b6a7b2d9fec20181c439535f2fe492c5cd24da",
  "darwin-x64": "6729c65acb6b2f56690ebe54e63659f4dc31b2b5814aff8d59740767ab43ad17",
  "linux-x64": "591623da24add49fc6572e6eba3039e21b40893024efc65fc547802e00cfec17",
});

/** Trusted package assets only: no workspace, PATH, executable override or env root. */
export function cursorNativeDistributionSpec(
  platform: NodeJS.Platform = process.platform,
  architecture: string = process.arch,
): NativeAcpxDistributionInput {
  const key = `${platform}-${architecture}`;
  if (!Object.hasOwn(CLOSURE_PINS, key)) throw new Error(`Cursor ${CURSOR_PINNED_VERSION} has no pinned distribution for ${key}`);
  const distributionRoot = join(resolveRunnerProviderAssetsRoot(import.meta.url, "cursor"), key);
  return {
    distributionRoot,
    manifestPath: join(distributionRoot, ".paperclip-cursor-closure.json"),
    expectedClosureSha256: CLOSURE_PINS[key as keyof typeof CLOSURE_PINS],
    executable: "node",
    entrypoint: "index.js",
    fixedArguments: [...CURSOR_FIXED_ARGUMENTS],
  };
}

/** Verifies launch bytes, not qualification. Profile admission remains separate. */
export async function verifyCursorInstallation(profile: QualifiedAcpxProfile): Promise<VerifiedAcpxInstallation> {
  const trusted = QUALIFIED_ACPX_PROFILES.cursor;
  const modelFields = new Set(["qualificationModel", "reportedModelId"]);
  if (Object.keys(profile).some(key => !Object.hasOwn(trusted, key))
    || Object.entries(trusted).some(([key, value]) => !modelFields.has(key) && profile[key as keyof QualifiedAcpxProfile] !== value)
    || !profile.qualificationModel.trim() || profile.reportedModelId !== profile.qualificationModel) {
    throw new Error("Cursor installation requires the exact pinned profile and an explicit model");
  }
  const installation = await verifyNativeAcpxInstallation(cursorNativeDistributionSpec());
  return { ...installation, commandDigest: trusted.commandDigest };
}
