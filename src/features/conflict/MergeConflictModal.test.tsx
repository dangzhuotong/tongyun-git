import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MergeConflictModal } from "./MergeConflictModal";
import * as host from "../../lib/host";

vi.mock("../../lib/host", () => ({
  listConflicts: vi.fn(),
  getConflictDetails: vi.fn(),
  resolveConflictFile: vi.fn(),
  acceptOurs: vi.fn(),
  acceptTheirs: vi.fn(),
  continueMergeOrRebase: vi.fn(),
}));

describe("MergeConflictModal", () => {
  const rootPath = "/mock/repo";
  const mockConflictList: host.ConflictFileSummary[] = [
    {
      path: "app.txt",
      has_ancestor: true,
      has_our: true,
      has_their: true,
    },
  ];

  const mockDetails: host.ConflictFileDetails = {
    path: "app.txt",
    is_binary: false,
    base_content: "base line 1\nbase line 2",
    our_content: "base line 1\nlocal modification",
    their_content: "base line 1\nremote modification",
    worktree_content:
      "<<<<<<< HEAD\nlocal modification\n=======\nremote modification\n>>>>>>> branch",
    hunks: [
      {
        hunk_index: 0,
        our_start_line: 1,
        our_lines: ["local modification"],
        their_start_line: 1,
        their_lines: ["remote modification"],
        base_lines: ["base line 2"],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(host.listConflicts).mockResolvedValue(mockConflictList);
    vi.mocked(host.getConflictDetails).mockResolvedValue(mockDetails);
    vi.mocked(host.acceptOurs).mockResolvedValue(undefined);
    vi.mocked(host.acceptTheirs).mockResolvedValue(undefined);
    vi.mocked(host.resolveConflictFile).mockResolvedValue(undefined);
    vi.mocked(host.continueMergeOrRebase).mockResolvedValue(undefined);
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <MergeConflictModal
        isOpen={false}
        onClose={vi.fn()}
        rootPath={rootPath}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders 3-way layout with conflict details", async () => {
    render(
      <MergeConflictModal
        isOpen={true}
        onClose={vi.fn()}
        rootPath={rootPath}
      />
    );

    expect(await screen.findByText("三方合并冲突解决器 (3-Way Merge Tool)")).toBeDefined();
    expect(await screen.findByText("本地分支 (Ours)")).toBeDefined();
    expect(await screen.findByText("最终合并结果 (Result)")).toBeDefined();
    expect(await screen.findByText("传入分支 (Theirs)")).toBeDefined();
  });

  it("accepts all ours when clicking '全部采用本地'", async () => {
    render(
      <MergeConflictModal
        isOpen={true}
        onClose={vi.fn()}
        rootPath={rootPath}
      />
    );

    const acceptOursBtn = await screen.findByRole("button", { name: /全部采用本地/i });
    fireEvent.click(acceptOursBtn);

    await waitFor(() => {
      expect(host.acceptOurs).toHaveBeenCalledWith(rootPath, "app.txt");
    });
  });

  it("accepts all theirs when clicking '全部采用传入'", async () => {
    render(
      <MergeConflictModal
        isOpen={true}
        onClose={vi.fn()}
        rootPath={rootPath}
      />
    );

    const acceptTheirsBtn = await screen.findByRole("button", { name: /全部采用传入/i });
    fireEvent.click(acceptTheirsBtn);

    await waitFor(() => {
      expect(host.acceptTheirs).toHaveBeenCalledWith(rootPath, "app.txt");
    });
  });

  it("saves and resolves file when clicking '标记此文件已解决'", async () => {
    render(
      <MergeConflictModal
        isOpen={true}
        onClose={vi.fn()}
        rootPath={rootPath}
      />
    );

    const resolveBtn = await screen.findByRole("button", { name: /标记此文件已解决/i });
    const textarea = screen.getByPlaceholderText("在此编辑最终合并代码...");
    fireEvent.change(textarea, { target: { value: "base line 1\nresolved clean code" } });
    fireEvent.click(resolveBtn);

    await waitFor(() => {
      expect(host.resolveConflictFile).toHaveBeenCalledWith(
        rootPath,
        "app.txt",
        "base line 1\nresolved clean code"
      );
    });
  });


  it("displays complete merge button when no conflicts remain", async () => {
    vi.mocked(host.listConflicts).mockResolvedValue([]);

    render(
      <MergeConflictModal
        isOpen={true}
        onClose={vi.fn()}
        rootPath={rootPath}
      />
    );

    expect(await screen.findByText("所有冲突已全部解决！")).toBeDefined();
    const completeBtn = screen.getAllByRole("button", { name: /完成合并提交/i })[0];
    fireEvent.click(completeBtn);

    await waitFor(() => {
      expect(host.continueMergeOrRebase).toHaveBeenCalledWith(rootPath);
    });
  });
});
