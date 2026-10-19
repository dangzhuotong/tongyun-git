import { describe, it, expect } from "vitest";
import { computeIntraLineDiff } from "./intraLineDiff";

describe("diffViewUtils - computeIntraLineDiff", () => {
  it("returns empty ranges for identical strings and empty inputs", () => {
    expect(computeIntraLineDiff("", "")).toEqual({ oldRanges: [], newRanges: [] });
    expect(computeIntraLineDiff("const x = 1;", "const x = 1;")).toEqual({
      oldRanges: [],
      newRanges: [],
    });
    expect(computeIntraLineDiff("   ", "   ")).toEqual({
      oldRanges: [],
      newRanges: [],
    });
  });

  it("handles pure additions and pure deletions", () => {
    const addResult = computeIntraLineDiff("", "console.log('new line');");
    expect(addResult.oldRanges).toEqual([]);
    expect(addResult.newRanges).toEqual([{ start: 0, end: 24 }]);

    const delResult = computeIntraLineDiff("console.log('old line');", "");
    expect(delResult.oldRanges).toEqual([{ start: 0, end: 24 }]);
    expect(delResult.newRanges).toEqual([]);
  });

  it("identifies single word replacement with accurate character offsets", () => {
    const oldLine = "const timeout = 1000;";
    const newLine = "const timeout = 5000;";
    const res = computeIntraLineDiff(oldLine, newLine);

    expect(res.oldRanges).toEqual([{ start: 16, end: 20 }]);
    expect(res.newRanges).toEqual([{ start: 16, end: 20 }]);
    expect(oldLine.slice(res.oldRanges[0].start, res.oldRanges[0].end)).toBe("1000");
    expect(newLine.slice(res.newRanges[0].start, res.newRanges[0].end)).toBe("5000");
  });

  it("identifies multiple disjoint changes in a single line", () => {
    const oldLine = "function calculate(a: number, b: number): number";
    const newLine = "function calculate(x: number, y: number): number";
    const res = computeIntraLineDiff(oldLine, newLine);

    expect(res.oldRanges).toHaveLength(2);
    expect(res.newRanges).toHaveLength(2);

    expect(oldLine.slice(res.oldRanges[0].start, res.oldRanges[0].end)).toBe("a");
    expect(oldLine.slice(res.oldRanges[1].start, res.oldRanges[1].end)).toBe("b");

    expect(newLine.slice(res.newRanges[0].start, res.newRanges[0].end)).toBe("x");
    expect(newLine.slice(res.newRanges[1].start, res.newRanges[1].end)).toBe("y");
  });

  it("detects addition and deletion at the start of a line", () => {
    const resAdd = computeIntraLineDiff("start();", "await start();");
    expect(resAdd.oldRanges).toEqual([]);
    expect(resAdd.newRanges).toEqual([{ start: 0, end: 6 }]);

    const resDel = computeIntraLineDiff("await start();", "start();");
    expect(resDel.oldRanges).toEqual([{ start: 0, end: 6 }]);
    expect(resDel.newRanges).toEqual([]);
  });

  it("detects addition and deletion at the end of a line", () => {
    const resAdd = computeIntraLineDiff("const x = 1", "const x = 1;");
    expect(resAdd.oldRanges).toEqual([]);
    expect(resAdd.newRanges).toEqual([{ start: 11, end: 12 }]);

    const resDel = computeIntraLineDiff("const x = 1;", "const x = 1");
    expect(resDel.oldRanges).toEqual([{ start: 11, end: 12 }]);
    expect(resDel.newRanges).toEqual([]);
  });

  it("detects operator substitutions accurately", () => {
    const oldLine = "if (a === b)";
    const newLine = "if (a !== b)";
    const res = computeIntraLineDiff(oldLine, newLine);

    expect(res.oldRanges).toEqual([{ start: 6, end: 7 }]);
    expect(res.newRanges).toEqual([{ start: 6, end: 7 }]);
    expect(oldLine.slice(6, 7)).toBe("=");
    expect(newLine.slice(6, 7)).toBe("!");
  });

  it("handles whitespace and indentation differences", () => {
    const oldLine = "  return true;";
    const newLine = "    return true;";
    const res = computeIntraLineDiff(oldLine, newLine);

    expect(res.oldRanges).toEqual([{ start: 0, end: 2 }]);
    expect(res.newRanges).toEqual([{ start: 0, end: 4 }]);
  });

  it("handles CJK and multilingual character sets accurately", () => {
    // Chinese characters insertion
    const oldZh = 'console.log("错误");';
    const newZh = 'console.log("严重错误");';
    const resZh = computeIntraLineDiff(oldZh, newZh);
    expect(resZh.oldRanges).toEqual([]);
    expect(resZh.newRanges).toEqual([{ start: 13, end: 15 }]);
    expect(newZh.slice(13, 15)).toBe("严重");

    // Japanese Katakana change
    const oldJa = 'const name = "テスト";';
    const newJa = 'const name = "テスト中";';
    const resJa = computeIntraLineDiff(oldJa, newJa);
    expect(resJa.oldRanges).toEqual([]);
    expect(resJa.newRanges).toEqual([{ start: 17, end: 18 }]);
    expect(newJa.slice(17, 18)).toBe("中");
  });

  it("guards against lines exceeding 800 characters by returning full line range", () => {
    const longOld = "x".repeat(801);
    const longNew = "x".repeat(801) + "y";

    const res = computeIntraLineDiff(longOld, longNew);
    expect(res.oldRanges).toEqual([{ start: 0, end: 801 }]);
    expect(res.newRanges).toEqual([{ start: 0, end: 802 }]);

    // Only new line long
    const resNewLong = computeIntraLineDiff("short", "y".repeat(805));
    expect(resNewLong.oldRanges).toEqual([{ start: 0, end: 5 }]);
    expect(resNewLong.newRanges).toEqual([{ start: 0, end: 805 }]);
  });
});
