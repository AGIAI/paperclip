/**
 * Candidate closure pins from the isolated npm lock and official Node 24.19.0.
 * The non-Node graph is identical across targets, including platform resources.
 * macOS arm64 executed admission tests; x64 target execution remains pending.
 * Changing any package, helper, extension or bootstrap requires regenerating all
 * three pins. Never accept a digest supplied only by an installed manifest.
 */
export const PI_DISTRIBUTION_CLOSURE_SHA256 = Object.freeze({
  "darwin-arm64": "a523fa338cef7db88a42b81e2dc8a5cc41b78775aed1be0a9439f6622ea8a710",
  "darwin-x64": "27988352e6bb214ac1c78faeb3157cf5995cceb12612aef09c44e7f0e76356f6",
  "linux-x64": "002812b62463ffae84b8e8b58567a6f4ba5025dd830528c5ed3b4c50c2a0ee29",
});
