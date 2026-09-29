import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { getVersion } from "../src/index.js";

describe("runCli", () => {
  it("prints help text with no arguments", () => {
    const result = runCli([]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Pocket Ledger");
    expect(result.output).toContain("Использование:");
  });

  it("prints help text for --help", () => {
    const result = runCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("pocket-ledger [команда] [опции]");
  });

  it("prints the package version for --version", () => {
    const result = runCli(["--version"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe(getVersion());
  });

  it("rejects unknown commands", () => {
    const result = runCli(["import"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Неизвестная команда");
  });
});
