import { describe, it, expect } from "vitest";
import {
  detectLanguage,
  highlightLines,
  getEffectiveDiffTheme,
} from "./highlighter";

describe("highlighter", () => {
  it("detects languages correctly from various extensions and filenames", () => {
    expect(detectLanguage("src/App.tsx")).toBe("tsx");
    expect(detectLanguage("crates/tg-core/src/lib.rs")).toBe("rust");
    expect(detectLanguage("package.json")).toBe("json");
    expect(detectLanguage("Cargo.toml")).toBe("toml");
    expect(detectLanguage("README.md")).toBe("markdown");
    expect(detectLanguage("script.py")).toBe("python");
    expect(detectLanguage("unknown.xyz123")).toBe(null);
  });

  it("detects effective theme from DOM attribute or defaults", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    expect(getEffectiveDiffTheme()).toBe("github-dark");

    document.documentElement.setAttribute("data-theme", "light");
    expect(getEffectiveDiffTheme()).toBe("github-light");
  });

  it("highlights code lines using Shiki", async () => {
    const lines = ["const sum = (a: number, b: number) => a + b;"];
    const tokens = await highlightLines(lines, "math.ts", "github-dark");
    expect(tokens.length).toBe(1);
    expect(tokens[0].length).toBeGreaterThan(1);
    // At least one token should have a syntax color hex
    const hasColor = tokens[0].some((t) => t.color && t.color.startsWith("#"));
    expect(hasColor).toBe(true);
  });

  it("falls back gracefully for unknown language", async () => {
    const lines = ["some random plain text"];
    const tokens = await highlightLines(lines, "data.unknownext", "github-dark");
    expect(tokens.length).toBe(1);
    expect(tokens[0][0].content).toBe("some random plain text");
  });
});
