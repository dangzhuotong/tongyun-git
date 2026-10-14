import { describe, it, expect } from "vitest";
import { splitPath } from "./splitPath";

describe("splitPath utility", () => {
  it("splits nested file path with forward slashes", () => {
    expect(splitPath("src/components/splitPath.ts")).toEqual({
      fileName: "splitPath.ts",
      dirPath: "src/components",
    });
  });

  it("handles root-level files with empty dirPath", () => {
    expect(splitPath("README.md")).toEqual({
      fileName: "README.md",
      dirPath: "",
    });
    expect(splitPath("package.json")).toEqual({
      fileName: "package.json",
      dirPath: "",
    });
  });

  it("normalizes Windows backslashes to forward slashes", () => {
    expect(splitPath("src\\features\\changes\\ChangesList.tsx")).toEqual({
      fileName: "ChangesList.tsx",
      dirPath: "src/features/changes",
    });
    expect(splitPath("nested\\dir\\file.txt")).toEqual({
      fileName: "file.txt",
      dirPath: "nested/dir",
    });
  });

  it("handles mixed slashes correctly", () => {
    expect(splitPath("src/features\\changes/DiffViewer.tsx")).toEqual({
      fileName: "DiffViewer.tsx",
      dirPath: "src/features/changes",
    });
  });

  it("handles single filename without extension or directory", () => {
    expect(splitPath("LICENSE")).toEqual({
      fileName: "LICENSE",
      dirPath: "",
    });
  });
});
