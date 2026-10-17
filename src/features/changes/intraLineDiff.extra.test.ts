import { describe, it, expect } from "vitest";
import { computeIntraLineDiff } from "./intraLineDiff";

describe("computeIntraLineDiff extra cases", () => {
  it("returns empty ranges when both strings are empty", () => {
    expect(computeIntraLineDiff("", "")).toEqual({ oldRanges: [], newRanges: [] });
  });

  it("marks a replaced leading token on both sides", () => {
    expect(computeIntraLineDiff("const x = 10;", "let x = 10;")).toEqual({
      oldRanges: [{ start: 0, end: 5 }],
      newRanges: [{ start: 0, end: 3 }],
    });
  });

  it("reports multiple disjoint changed regions", () => {
    expect(computeIntraLineDiff("a b c", "x b y")).toEqual({
      oldRanges: [
        { start: 0, end: 1 },
        { start: 4, end: 5 },
      ],
      newRanges: [
        { start: 0, end: 1 },
        { start: 4, end: 5 },
      ],
    });
  });

  it("treats punctuation as separate tokens", () => {
    expect(computeIntraLineDiff("(foo)", "[foo]")).toEqual({
      oldRanges: [
        { start: 0, end: 1 },
        { start: 4, end: 5 },
      ],
      newRanges: [
        { start: 0, end: 1 },
        { start: 4, end: 5 },
      ],
    });
  });

  it("reports an inserted whitespace run on both sides", () => {
    expect(computeIntraLineDiff("a b", "a  b")).toEqual({
      oldRanges: [{ start: 1, end: 2 }],
      newRanges: [{ start: 1, end: 3 }],
    });
  });

  it("reports a deleted word together with its leading space", () => {
    expect(computeIntraLineDiff("foo bar baz", "foo baz")).toEqual({
      oldRanges: [{ start: 3, end: 7 }],
      newRanges: [],
    });
  });

  it("flags a CJK character replacement", () => {
    expect(computeIntraLineDiff("欢迎", "欢喜")).toEqual({
      oldRanges: [{ start: 1, end: 2 }],
      newRanges: [{ start: 1, end: 2 }],
    });
  });

  it("falls back to the whole line when it exceeds the 800-char guard", () => {
    expect(computeIntraLineDiff("a".repeat(801), "b".repeat(801))).toEqual({
      oldRanges: [{ start: 0, end: 801 }],
      newRanges: [{ start: 0, end: 801 }],
    });
  });

  it("guards independently for one long side", () => {
    expect(computeIntraLineDiff("x".repeat(900), "y")).toEqual({
      oldRanges: [{ start: 0, end: 900 }],
      newRanges: [{ start: 0, end: 1 }],
    });
  });

});
