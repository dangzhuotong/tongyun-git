import { describe, it, expect } from "vitest";
import { splitPath } from "./splitPath";

describe("splitPath edge cases", () => {
  it("keeps an empty file name for a trailing slash", () => {
    expect(splitPath("a/b/")).toEqual({ fileName: "", dirPath: "a/b" });
    expect(splitPath("/")).toEqual({ fileName: "", dirPath: "" });
  });

  it("treats a leading slash as a root-level file", () => {
    expect(splitPath("/a")).toEqual({ fileName: "a", dirPath: "" });
  });

  it("handles empty input", () => {
    expect(splitPath("")).toEqual({ fileName: "", dirPath: "" });
  });

  it("preserves internal empty path segments", () => {
    expect(splitPath("a//b")).toEqual({ fileName: "b", dirPath: "a/" });
  });

  it("does not touch non-slash separators or unicode names", () => {
    expect(splitPath("目录/文件.ts")).toEqual({ fileName: "文件.ts", dirPath: "目录" });
  });
});
