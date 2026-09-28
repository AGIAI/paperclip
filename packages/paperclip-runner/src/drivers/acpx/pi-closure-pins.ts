/**
 * Candidate closure pins from the isolated npm lock and official Node 24.19.0.
 * The non-Node graph is identical across targets, including platform resources.
 * macOS arm64 executed admission tests; x64 target execution remains pending.
 * Changing any package, helper, extension or bootstrap requires regenerating all
 * three pins. Never accept a digest supplied only by an installed manifest.
 */
export const PI_DISTRIBUTION_CLOSURE_SHA256 = Object.freeze({
  "darwin-arm64": "b0e02ed16d27fd1d90a5e91d6309f1c47d6cf55f8937a8f680baeee19646d320",
  "darwin-x64": "a79b55d7773f4f67d1c6d87fe67346852df5a23e36e8c55d1e84f80d4b668f22",
  "linux-x64": "fc7464cb5ea5af2a2d2519f3a67f7471ca3185110f33eaaea3785043709ad3b2",
});
