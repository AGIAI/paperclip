/**
 * Candidate closure pins from the isolated npm lock and official Node 24.21.0.
 * The non-Node graph is identical across targets, including platform resources.
 * Pi 1.0.0 dependency graphs were independently installed for all three targets.
 * Native platform execution and paid qualification remain separately required.
 * Changing any package, helper, extension or bootstrap requires regenerating all
 * three pins. Never accept a digest supplied only by an installed manifest.
 */
export const PI_DISTRIBUTION_CLOSURE_SHA256 = Object.freeze({
  "darwin-arm64": "a3e43c23f9603983a59fd256ca1dcf8bbd5cc2728dad095f7bcd3b3e62278597",
  "darwin-x64": "8c6e7802d47da9410af56e367f6cf7af572fcbf3e361627cee026e8cffc9bdd3",
  "linux-x64": "40e186c53db60d1ab5673ba34f33002e93cea518725a93395d241393b984caef",
});
