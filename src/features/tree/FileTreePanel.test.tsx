import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FileTreePanel } from "./FileTreePanel";
import * as host from "../../lib/host";
import type { FileStatus } from "../../lib/host";

vi.mock("../../lib/host", () => ({
  listRepoFiles: vi.fn(),
}));

const files = [
  { path: "src/app.ts", deleted_on_disk: false },
  { path: "src/new.ts", deleted_on_disk: false },
  { path: "src/old.ts", deleted_on_disk: true },
  { path: "src/clean.ts", deleted_on_disk: false },
  { path: "docs/todo.md", deleted_on_disk: false },
  { path: "README.md", deleted_on_disk: false },
];
const status: FileStatus[] = [
  { path: "src/app.ts", worktree: "Modified", conflicted: false },
  { path: "src/new.ts", index: "Added", conflicted: false },
  { path: "src/old.ts", worktree: "Deleted", conflicted: false },
  { path: "docs/todo.md", worktree: "Untracked", conflicted: false },
];

const row = (path: string) => document.querySelector<HTMLElement>(`[data-path="${path}"]`);

async function setup(onOpenFile = vi.fn()) {
  render(
    <FileTreePanel rootPath="/repo" statusFiles={status} selectedPath={null} onOpenFile={onOpenFile} />
  );
  await waitFor(() => expect(row("README.md")).not.toBeNull());
  return onOpenFile;
}

describe("FileTreePanel", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(host.listRepoFiles).mockResolvedValue(files);
  });

  it("starts collapsed and expands/collapses a folder on click", async () => {
    await setup();
    expect(row("src/app.ts")).toBeNull();
    fireEvent.click(row("src")!);
    expect(row("src/app.ts")).not.toBeNull();
    expect(row("src")!.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(row("src")!);
    expect(row("src/app.ts")).toBeNull();
  });

  it("colors files by status with a letter badge and strikes deleted files", async () => {
    await setup();
    fireEvent.click(row("src")!);
    fireEvent.click(row("docs")!);
    const cases: Array<[string, string, string]> = [
      ["src/app.ts", "M", "var(--color-status-modified)"],
      ["src/new.ts", "A", "var(--color-status-added)"],
      ["src/old.ts", "D", "var(--color-status-deleted)"],
      ["docs/todo.md", "U", "var(--color-status-untracked)"],
    ];
    for (const [path, letter, color] of cases) {
      const r = row(path)!;
      expect(within(r).getByText(letter)).toBeTruthy();
      expect((r.querySelector(".tree-name") as HTMLElement).style.color).toBe(color);
    }
    expect(row("src/old.ts")!.querySelector(".tree-name")!.classList.contains("line-through")).toBe(true);
    expect(row("src/clean.ts")!.querySelector(".tree-badge")).toBeNull();
  });

  it("shows a dot on folders that contain changes", async () => {
    await setup();
    expect(row("src")!.querySelector("[data-testid=tree-dir-dot]")).not.toBeNull();
    expect(row("docs")!.querySelector("[data-testid=tree-dir-dot]")).not.toBeNull();
  });

  it("filters to changed files only", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "只看有改动的文件" }));
    expect(row("src/app.ts")).not.toBeNull();
    expect(row("src/clean.ts")).toBeNull();
    expect(row("README.md")).toBeNull();
  });

  it("searches by name and expands matching folders; Esc clears", async () => {
    await setup();
    const input = screen.getByLabelText("搜索文件");
    fireEvent.change(input, { target: { value: "NEW" } });
    expect(row("src/new.ts")).not.toBeNull();
    expect(row("src/app.ts")).toBeNull();
    expect(row("src/new.ts")!.querySelector("mark")?.textContent).toBe("new");
    fireEvent.keyDown(input, { key: "Escape" });
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("opens files on click and supports keyboard navigation", async () => {
    const onOpen = await setup();
    fireEvent.click(row("src")!);
    fireEvent.click(row("src/clean.ts")!);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ path: "src/clean.ts", status: null }));
    const tree = screen.getByRole("tree");
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    fireEvent.keyDown(tree, { key: "Enter" });
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ path: "src/new.ts", status: "added" }));
  });

  it("remembers expanded folders per repository", async () => {
    await setup();
    fireEvent.click(row("docs")!);
    expect(JSON.parse(localStorage.getItem("tongyun_tree_expanded:/repo")!)).toEqual(["docs"]);
  });
});
