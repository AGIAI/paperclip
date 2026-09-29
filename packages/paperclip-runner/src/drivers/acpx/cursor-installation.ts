import { join } from "node:path";

import { verifyNativeAcpxInstallation, type VerifiedAcpxInstallation } from "./installation-integrity.js";
import type { NativeAcpxDistributionInput } from "./native-distribution-integrity.js";
import { CURSOR_FIXED_ARGUMENTS } from "./cursor-launch-policy.js";
import { QUALIFIED_ACPX_PROFILES, type QualifiedAcpxProfile } from "./qualified-profiles.js";
import { resolveRunnerProviderAssetsRoot } from "./provider-assets-root.js";

export const CURSOR_PINNED_VERSION = "2026.09.26-dd393fe";
const CLOSURE_PINS = Object.freeze({
  "darwin-arm64": "8a22016ca832ef8c8e6a83b955208d74c63f2c8dbe1dd688cbf27b81ad01886a",
  "darwin-x64": "2c461f48feb274f8e7aabd6da67d1e9aefbe6e0b232fc0a111dce874378afcc8",
  "linux-x64": "4fe9461c19d1aec0cbbe4189159291fe62ef6910732a05fc5a25923afb1ce2c7",
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
