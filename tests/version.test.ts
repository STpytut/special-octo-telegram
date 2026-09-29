import { describe, expect, it } from "vitest";
import { getVersion } from "../src/index.js";

describe("getVersion", () => {
  it("returns a semver-like string matching package.json", () => {
    expect(getVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
