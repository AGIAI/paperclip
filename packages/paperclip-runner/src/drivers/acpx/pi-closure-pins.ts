/**
 * Candidate closure pins from the isolated npm lock and official Node 24.21.0.
 * The non-Node graph is identical across targets, including platform resources.
 * macOS arm64 executed admission tests; x64 target execution remains pending.
 * Changing any package, helper, extension or bootstrap requires regenerating all
 * three pins. Never accept a digest supplied only by an installed manifest.
 */
export const PI_DISTRIBUTION_CLOSURE_SHA256 = Object.freeze({
  "darwin-arm64": "b2ce6bb2d9b93c4265b2c363cbf1433e06bb3349327f59b6f8eb3fdbd1b03d6a",
  "darwin-x64": "a9269f6e0675ad1b50b24e76d47b971d4238ff25ddd57074b707db2a9bc83a74",
  "linux-x64": "05eb422d9ce9e32b081cb2d2a3433dc113d66a55f993125b74b1666002cf3b67",
});
