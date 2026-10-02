import { describe, expect, it } from "vitest";
import { gradeGate, stockHarnessGates } from "./stock-harness-checks.mjs";

const gate = { id: "SH-test", name: "Boundary", files: ["boundary.test.ts"], required: ["must preserve instructions"] };
const report = () => ({ testResults: [{ name: "/repo/boundary.test.ts", status: "passed",
  assertionResults: [{ fullName: "Boundary must preserve instructions", status: "passed" }] }],
numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numPendingTests: 0 });
describe("stock harness prerequisite coverage", () => {
  it("maps every implemented change to an executable gate", () => {
    expect(stockHarnessGates.map(gate => gate.id)).toEqual(["SH-1", "SH-2", "SH-3", "SH-3-hermes"]);
    expect(stockHarnessGates.every(gate => gate.files.length > 0 && gate.required.length > 0)).toBe(true);
  });
  it("accepts an executed passing boundary", () => expect(gradeGate(gate, report(), 0).passed).toBe(true));
  it.each([null, undefined, { testResults: [] }])("rejects unavailable evidence %s", (report) => {
    expect(gradeGate(gate, report, 0).passed).toBe(false);
  });
  it.each(["pending", "skipped", "failed", "todo"])("rejects a %s required assertion", (status) => {
    const observation = report();
    observation.testResults[0].assertionResults[0].status = status;
    expect(gradeGate(gate, observation, 0).passed).toBe(false);
  });
  it("rejects a passing different assertion and a nonzero launcher exit", () => {
    const different = report();
    different.testResults[0].assertionResults[0].fullName = "Unrelated pass";
    expect(gradeGate(gate, different, 0).passed).toBe(false);
    expect(gradeGate(gate, report(), 1).passed).toBe(false);
  });
  it("allows explicitly filtered unrelated tests while rejecting a skipped required test", () => {
    const filtered = { ...gate, testPattern: "must preserve instructions" };
    const observation = report();
    observation.testResults[0].assertionResults.push({ fullName: "Unrelated", status: "skipped" });
    expect(gradeGate(filtered, observation, 0).passed).toBe(true);
    observation.testResults[0].assertionResults[0].status = "skipped";
    expect(gradeGate(filtered, observation, 0).passed).toBe(false);
  });
  it("rejects a requested file absent from Vitest discovery even when required names pass", () => {
    expect(gradeGate({ ...gate, files: [...gate.files, "undiscovered.test.ts"] }, report(), 0).passed).toBe(false);
    expect(stockHarnessGates.find(gate => gate.id === "SH-3-hermes").cwd).toBe("packages/adapters/hermes");
  });
});
