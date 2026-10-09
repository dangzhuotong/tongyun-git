import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FileHistoryModal } from "./FileHistoryModal";
import * as host from "../../lib/host";

vi.mock("../../lib/host", () => ({
  getFileHistory: vi.fn(),
  getCommitFileDiff: vi.fn(),
}));

describe("FileHistoryModal", () => {
  const rootPath = "/test/repo";
  const filePath = "src/main.rs";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <FileHistoryModal
        isOpen={false}
        onClose={vi.fn()}
        rootPath={rootPath}
        filePath={filePath}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("loads history items and shows commit list", async () => {
    vi.mocked(host.getFileHistory).mockResolvedValue([
      {
        oid: "abc111111111",
        short_oid: "abc1111",
        summary: "feat: add main function",
        author_name: "Alice",
        author_email: "alice@example.com",
        timestamp: 1712500000,
      },
      {
        oid: "def222222222",
        short_oid: "def2222",
        summary: "chore: init repo",
        author_name: "Bob",
        author_email: "bob@example.com",
        timestamp: 1712400000,
      },
    ]);
    vi.mocked(host.getCommitFileDiff).mockResolvedValue({
      path: "src/main.rs",
      old_path: null,
      staged: false,
      is_binary: false,
      old_size: 10,
      new_size: 20,
      is_crlf_change: false,
      is_large: false,
      hunks: [],
    });

    render(
      <FileHistoryModal
        isOpen={true}
        onClose={vi.fn()}
        rootPath={rootPath}
        filePath={filePath}
      />
    );

    expect(await screen.findByText("feat: add main function")).toBeDefined();
    expect(screen.getByText("chore: init repo")).toBeDefined();
    expect(screen.getByText("Alice")).toBeDefined();
  });
});
