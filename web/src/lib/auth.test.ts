import { describe, expect, it } from "vitest";
import { initials, safeNext } from "./auth";

describe("safeNext", () => {
  it("keeps same-site relative paths, including query strings", () => {
    expect(safeNext("/settings")).toBe("/settings");
    expect(safeNext("/exams/lat?tab=mocks")).toBe("/exams/lat?tab=mocks");
  });

  it("falls back when missing", () => {
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext(undefined)).toBe("/dashboard");
    expect(safeNext("")).toBe("/dashboard");
  });

  it("refuses anything that could leave the site", () => {
    for (const bad of ["https://evil.example", "//evil.example", "javascript:alert(1)", "evil.example/x", "\\\\evil"]) {
      expect(safeNext(bad)).toBe("/dashboard");
    }
  });
});

describe("initials", () => {
  it("uses the first two words", () => {
    expect(initials("Sana Fatima")).toBe("SF");
    expect(initials("ahmed raza khan")).toBe("AR");
    expect(initials("  Bilal ")).toBe("B");
    expect(initials("")).toBe("");
  });
});
