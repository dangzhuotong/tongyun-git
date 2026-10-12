import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { splitPath } from "./splitPath";
import { FilePathLabel } from "./FilePathLabel";

describe("splitPath", () => {
  it("splits nested file paths into fileName and dirPath", () => {
    expect(splitPath("src/a/b.ts")).toEqual({
      fileName: "b.ts",
      dirPath: "src/a",
    });
  });

  it("returns empty dirPath for root files", () => {
    expect(splitPath("README.md")).toEqual({
      fileName: "README.md",
      dirPath: "",
    });
    expect(splitPath("b.ts")).toEqual({
      fileName: "b.ts",
      dirPath: "",
    });
  });

  it("handles deep paths and single directory paths", () => {
    expect(splitPath("a/b")).toEqual({
      fileName: "b",
      dirPath: "a",
    });
    expect(splitPath("packages/core/src/index.ts")).toEqual({
      fileName: "index.ts",
      dirPath: "packages/core/src",
    });
  });

  it("normalizes Windows backslashes", () => {
    expect(splitPath("src\\a\\b.ts")).toEqual({
      fileName: "b.ts",
      dirPath: "src/a",
    });
  });
});

describe("FilePathLabel", () => {
  it("renders filename and directory for flat nested files", () => {
    render(<FilePathLabel path="src/features/DiffViewer.tsx" />);
    expect(screen.getByText("DiffViewer.tsx")).toBeDefined();
    expect(screen.getByText("src/features")).toBeDefined();
  });

  it("renders only filename when in root directory", () => {
    const { container } = render(<FilePathLabel path="README.md" />);
    expect(screen.getByText("README.md")).toBeDefined();
    expect(container.querySelectorAll("span").length).toBe(2); // outer + inner fileName
  });

  it("respects displayName when in tree mode without appending directory", () => {
    render(<FilePathLabel path="src/lib/host.ts" displayName="host.ts" />);
    expect(screen.getByText("host.ts")).toBeDefined();
    expect(screen.queryByText("src/lib")).toBeNull();
  });

  it("displays renamed files as 'newFileName ← oldFileName'", () => {
    render(<FilePathLabel path="src/new.ts" oldPath="src/old.ts" />);
    expect(screen.getByText("new.ts ← old.ts")).toBeDefined();
    expect(screen.getByText("src")).toBeDefined();
  });

  it("applies strikethrough only to filename on deletion", () => {
    render(<FilePathLabel path="src/deleted.ts" isDeleted={true} />);
    const fileSpan = screen.getByText("deleted.ts");
    expect(fileSpan.className).toContain("line-through");
    const dirSpan = screen.getByText("src");
    expect(dirSpan.className).not.toContain("line-through");
  });
});
