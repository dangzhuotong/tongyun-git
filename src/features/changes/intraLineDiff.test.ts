import { describe, it, expect } from "vitest";
import { computeIntraLineDiff } from "./intraLineDiff";

describe("computeIntraLineDiff", () => {
  it("returns empty ranges for identical lines", () => {
    const res = computeIntraLineDiff("const x = 10;", "const x = 10;");
    expect(res.oldRanges).toEqual([]);
    expect(res.newRanges).toEqual([]);
  });

  it("detects single word replacement", () => {
    const res = computeIntraLineDiff("const x = 10;", "const x = 20;");
    expect(res.oldRanges).toEqual([{ start: 10, end: 12 }]);
    expect(res.newRanges).toEqual([{ start: 10, end: 12 }]);
  });

  it("detects word insertion", () => {
    const res = computeIntraLineDiff("hello world", "hello beautiful world");
    expect(res.oldRanges).toEqual([]);
    expect(res.newRanges).toEqual([{ start: 5, end: 15 }]);
  });

  it("handles CJK and punctuation correctly", () => {
    const res = computeIntraLineDiff("欢迎来到橦云", "欢迎来到橦云宇宙");
    expect(res.oldRanges).toEqual([]);
    expect(res.newRanges).toEqual([{ start: 6, end: 8 }]);
  });

  it("handles empty old or new string", () => {
    const resAdd = computeIntraLineDiff("", "console.log('hi');");
    expect(resAdd.oldRanges).toEqual([]);
    expect(resAdd.newRanges).toEqual([{ start: 0, end: 18 }]);

    const resDel = computeIntraLineDiff("console.log('hi');", "");
    expect(resDel.oldRanges).toEqual([{ start: 0, end: 18 }]);
    expect(resDel.newRanges).toEqual([]);
  });
});
