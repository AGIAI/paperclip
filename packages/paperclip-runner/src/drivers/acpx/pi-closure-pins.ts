/**
 * Candidate closure pins from the isolated npm lock and official Node 24.21.0.
 * The non-Node graph is identical across targets, including platform resources.
 * macOS arm64 executed admission tests; x64 target execution remains pending.
 * Changing any package, helper, extension or bootstrap requires regenerating all
 * three pins. Never accept a digest supplied only by an installed manifest.
 */
export const PI_DISTRIBUTION_CLOSURE_SHA256 = Object.freeze({
  "darwin-arm64": "0010175e4bc200f145386e59f7a824cf7532ad273e9db6824d22c4f82cdcd6ff",
  "darwin-x64": "9dd49bd1341a6e3438db56cc6b3dc772964ebcdd0552bcfbf2e5e621b2970ab6",
  "linux-x64": "91169667544764764e2e402868fbb76a9a429575cfdb1b312b8ed8ae669ebc89",
});
