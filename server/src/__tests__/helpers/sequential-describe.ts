import { describe, type SuiteFactory } from "vitest";

/**
 * Runs a suite sequentially. Vitest 5 removes the deprecated `sequential`
 * suite option; this helper uses `concurrent: false` instead, the
 * replacement vitest 4 already names, so the suite behaves the same way on
 * both major versions.
 */
export function sequentialDescribe(name: string, factory: SuiteFactory) {
  return describe(name, { concurrent: false }, factory);
}
