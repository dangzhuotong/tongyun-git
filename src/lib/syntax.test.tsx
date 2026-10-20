import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { getLanguageFromPath } from "./syntax";
import { HighlightedCodeLine } from "./HighlightedCodeLine";

describe("syntax highlighting", () => {
  it("detects language from file extension correctly", () => {
    expect(getLanguageFromPath("src/App.tsx")).toBe("tsx");
    expect(getLanguageFromPath("main.rs")).toBe("rust");
    expect(getLanguageFromPath("server/index.js")).toBe("javascript");
    expect(getLanguageFromPath("models/user.py")).toBe("python");
    expect(getLanguageFromPath("package.json")).toBe("json");
    expect(getLanguageFromPath("README.md")).toBe("markdown");
    expect(getLanguageFromPath("build.sh")).toBe("bash");
    expect(getLanguageFromPath("unknown.xyz")).toBeNull();
    expect(getLanguageFromPath(null)).toBeNull();
  });

  it("renders highlighted tokens for typescript code", () => {
    const code = "const greeting: string = 'hello world';";
    const { container } = render(
      <div className="font-mono">
        <HighlightedCodeLine content={code} language="typescript" />
      </div>
    );

    // Verify token spans are rendered
    const keywordSpan = container.querySelector(".token.keyword");
    expect(keywordSpan).toBeDefined();
    expect(keywordSpan?.textContent).toBe("const");

    const stringSpan = container.querySelector(".token.string");
    expect(stringSpan).toBeDefined();
    expect(stringSpan?.textContent).toBe("'hello world'");
  });

  it("renders highlighted tokens for rust code", () => {
    const code = "fn main() { println!(\"hello\"); }";
    const { container } = render(
      <div className="font-mono">
        <HighlightedCodeLine content={code} language="rust" />
      </div>
    );

    const keywordSpan = container.querySelector(".token.keyword");
    expect(keywordSpan).toBeDefined();
    expect(keywordSpan?.textContent).toBe("fn");

    const macroSpan = container.querySelector(".token.function, .token.macro");
    expect(macroSpan).toBeDefined();
    expect(macroSpan?.textContent).toBe("println!");
  });

  it("falls back gracefully when language is unknown or null", () => {
    const code = "plain unhighlighted text";
    render(
      <div data-testid="plain-container">
        <HighlightedCodeLine content={code} language={null} />
      </div>
    );

    expect(screen.getByText("plain unhighlighted text")).toBeDefined();
  });
});
