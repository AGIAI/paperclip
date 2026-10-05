import { describe } from "vitest";

/**
 * Runs a suite sequentially. Vitest 5 removes the deprecated `sequential`
 * suite option; this helper uses `concurrent: false` instead, the
 * replacement vitest 4 already names, so the suite behaves the same way on
 * both major versions.
 */
export const sequentialDescribe: typeof describe.skip = ((name: any, factory: any) =>
  describe(name, { concurrent: false }, factory)) as typeof describe.skip;
