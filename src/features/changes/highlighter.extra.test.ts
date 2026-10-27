import { describe, it, expect, afterEach } from "vitest";
import {
  detectLanguage,
  getEffectiveDiffTheme,
  getLoadedHighlighter,
  getTokensSync,
} from "./highlighter";

afterEach(() => {
  const root = document.documentElement;
  root.removeAttribute("data-theme");
  root.classList.remove("dark");
});

describe("detectLanguage extra cases", () => {
  it("lowercases the path before matching extensions", () => {
    expect(detectLanguage("FOO.TS")).toBe("typescript");
    expect(detectLanguage("nested\\Dir\\Comp.TSX")).toBe("tsx");
  });

  it("matches special file names regardless of case", () => {
    expect(detectLanguage("Makefile")).toBe("makefile");
    expect(detectLanguage("DOCKERFILE")).toBe("dockerfile");
  });

  it("uses the exact file name for well-known manifests", () => {
    expect(detectLanguage("Cargo.lock")).toBe("toml");
    expect(detectLanguage("tsconfig.json")).toBe("jsonc");
    expect(detectLanguage("package.json")).toBe("json");
  });

  it("maps a broad set of extensions", () => {
    expect(detectLanguage("schema.sql")).toBe("sql");
    expect(detectLanguage("run.zsh")).toBe("bash");
    expect(detectLanguage("data.diff")).toBe("diff");
    expect(detectLanguage("component.vue")).toBe("vue");
    expect(detectLanguage("main.go")).toBe("go");
    expect(detectLanguage("App.swift")).toBe("swift");
  });

  it("returns null for empty, extension-less and unknown paths", () => {
    expect(detectLanguage("")).toBeNull();
    expect(detectLanguage("LICENSE")).toBeNull();
    expect(detectLanguage(".gitignore")).toBeNull();
    expect(detectLanguage("archive.tar.gz")).toBeNull();
    expect(detectLanguage("weird.")).toBeNull();
  });
});

describe("getTokensSync guard behavior", () => {
  it("starts without a loaded highlighter instance", () => {
    expect(getLoadedHighlighter()).toBeNull();
  });

  it("passes plain lines through for an unknown language", () => {
    expect(getTokensSync(["plain text"], "data.xyz", "github-dark")).toEqual([
      [{ content: "plain text" }],
    ]);
  });

  it("returns null for a known language before the highlighter is loaded", () => {
    expect(getTokensSync(["const a = 1;"], "sample.ts", "github-dark")).toBeNull();
  });
});

describe("getEffectiveDiffTheme DOM handling", () => {
  it("honors the dark class on the document element", () => {
    document.documentElement.classList.add("dark");
    expect(getEffectiveDiffTheme()).toBe("github-dark");
  });

  it("lets the dark class win over an explicit light data-theme", () => {
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("data-theme", "light");
    expect(getEffectiveDiffTheme()).toBe("github-dark");
  });

  it("uses an explicit data-theme when the dark class is absent", () => {
    document.documentElement.setAttribute("data-theme", "light");
    expect(getEffectiveDiffTheme()).toBe("github-light");

    document.documentElement.setAttribute("data-theme", "dark");
    expect(getEffectiveDiffTheme()).toBe("github-dark");
  });

  it("falls back to github-light when nothing signals dark mode", () => {
    expect(getEffectiveDiffTheme()).toBe("github-light");
  });
});
