/**
 * Candidate closure pins from the isolated npm lock and official Node 24.19.0.
 * The non-Node graph is identical across targets, including platform resources.
 * macOS arm64 executed admission tests; x64 target execution remains pending.
 * Changing any package, helper, extension or bootstrap requires regenerating all
 * three pins. Never accept a digest supplied only by an installed manifest.
 */
export const PI_DISTRIBUTION_CLOSURE_SHA256 = Object.freeze({
  "darwin-arm64": "b30047dce9c4c25e1fbc88a1aa828690a6a11ebdc3f6fcc083875986eb2d9585",
  "darwin-x64": "3bff53a334f7226bd14adb6a91e6e3603281bec7b93e7dd62aa5599483df8bba",
  "linux-x64": "482e648e5b8890971fdf326a936fddc01ae89c335159d7133ddff70b49ed3d3d",
});
