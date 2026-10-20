import { createElement, type ComponentProps } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiffLineContent } from "./DiffLineContent";

type Props = ComponentProps<typeof DiffLineContent>;

function slices(props: Props): HTMLSpanElement[] {
  const { container } = render(createElement(DiffLineContent, props));
  const root = container.querySelector("span.whitespace-pre");
  expect(root).not.toBeNull();
  return Array.from(root!.children) as HTMLSpanElement[];
}

function textOf(nodes: HTMLSpanElement[]): string[] {
  return nodes.map((node) => node.textContent ?? "");
}

function cssColor(hex: string): string {
  const probe = document.createElement("span");
  probe.style.color = hex;
  return probe.style.color;
}

const ADD = "bg-[var(--color-diff-add-strong)]";
const DEL = "bg-[var(--color-diff-del-strong)]";

describe("DiffLineContent intra-line slices", () => {
  it("renders the raw line as one span when there are no highlight ranges", () => {
    const nodes = slices({ content: "const x = 1;" });
    expect(textOf(nodes)).toEqual(["const x = 1;"]);
    expect(nodes[0].className).toBe("");
    expect(nodes[0].getAttribute("style")).toBeNull();
  });

  it("falls back to the raw line when the token list is empty", () => {
    const nodes = slices({ content: "fallback", tokens: [] });
    expect(textOf(nodes)).toEqual(["fallback"]);
  });

  it("keeps syntax-token colors when no range overlaps the line", () => {
    const nodes = slices({
      content: "let n = 1;",
      tokens: [
        { content: "let", color: "#111" },
        { content: " n = ", color: "#222" },
        { content: "1", color: "#333" },
      ],
      intraLineRanges: [{ start: 40, end: 48 }],
    });
    expect(textOf(nodes)).toEqual(["let", " n = ", "1"]);
    expect(nodes.map((node) => node.style.color)).toEqual([
      cssColor("#111"),
      cssColor("#222"),
      cssColor("#333"),
    ]);
    expect(nodes.every((node) => node.className === "")).toBe(true);
  });

  it("splits a token on a partial add range and highlights only the overlap", () => {
    const line = "const timeout = 1000;";
    const nodes = slices({
      content: line,
      tokens: [{ content: line, color: "#abc" }],
      intraLineRanges: [{ start: 16, end: 20 }],
      isAdd: true,
    });
    expect(textOf(nodes)).toEqual(["const timeout = ", "1000", ";"]);
    expect(nodes[0].className).toBe("");
    expect(nodes[1].className).toContain(ADD);
    expect(nodes[1].className).not.toContain(DEL);
    expect(nodes[2].className).toBe("");
    expect(nodes.every((node) => node.style.color === cssColor("#abc"))).toBe(true);
  });

  it("uses the delete highlight when the changed slice is a deletion", () => {
    const nodes = slices({
      content: "old",
      tokens: [{ content: "old" }],
      intraLineRanges: [{ start: 0, end: 3 }],
      isDel: true,
    });
    expect(textOf(nodes)).toEqual(["old"]);
    expect(nodes[0].className).toContain(DEL);
    expect(nodes[0].className).not.toContain(ADD);
  });

  it("cuts across token boundaries and keeps each slice's own color", () => {
    const nodes = slices({
      content: "abcdef",
      tokens: [
        { content: "abc", color: "#111" },
        { content: "def", color: "#222" },
      ],
      intraLineRanges: [{ start: 2, end: 5 }],
      isAdd: true,
    });
    expect(textOf(nodes)).toEqual(["ab", "c", "de", "f"]);
    expect(nodes.map((node) => node.style.color)).toEqual([
      cssColor("#111"),
      cssColor("#111"),
      cssColor("#222"),
      cssColor("#222"),
    ]);
    expect(nodes.map((node) => node.className.includes(ADD))).toEqual([false, true, true, false]);
  });

  it("highlights several disjoint ranges and skips a zero-width range", () => {
    const nodes = slices({
      content: "0123456789",
      tokens: [{ content: "0123456789", color: "#444" }],
      intraLineRanges: [
        { start: 1, end: 3 },
        { start: 4, end: 4 },
        { start: 6, end: 8 },
      ],
      isAdd: true,
    });
    expect(textOf(nodes)).toEqual(["0", "12", "345", "67", "89"]);
    expect(nodes.map((node) => node.className.includes(ADD))).toEqual([
      false,
      true,
      false,
      true,
      false,
    ]);
  });

  it("does not paint a strong background when the line is neither an add nor a delete", () => {
    const nodes = slices({
      content: "abcdef",
      intraLineRanges: [{ start: 1, end: 4 }],
    });
    expect(textOf(nodes)).toEqual(["a", "bcd", "ef"]);
    expect(nodes.every((node) => !node.className.includes(ADD) && !node.className.includes(DEL))).toBe(
      true,
    );
  });
});
