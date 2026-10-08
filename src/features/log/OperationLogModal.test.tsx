import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { OperationLogModal } from "./OperationLogModal";
import * as host from "../../lib/host";

vi.mock("../../lib/host", () => ({
  getOperationLogs: vi.fn(),
  clearOperationLogs: vi.fn(),
}));

describe("OperationLogModal", () => {
  const mockLogs: host.OperationLogEntry[] = [
    {
      id: "log-1",
      timestamp_ms: 1700000000000,
      command_line: "git fetch origin --prune",
      cwd: "/mock/repo",
      duration_ms: 120,
      exit_code: 0,
      error_message: null,
    },
    {
      id: "log-2",
      timestamp_ms: 1700000005000,
      command_line: "git push origin main",
      cwd: "/mock/repo",
      duration_ms: 250,
      exit_code: 1,
      error_message: "Updates were rejected",
    },
  ];

  it("renders log entries and handles clear", async () => {
    vi.mocked(host.getOperationLogs).mockResolvedValue(mockLogs);
    vi.mocked(host.clearOperationLogs).mockResolvedValue(undefined);

    render(<OperationLogModal isOpen={true} onClose={vi.fn()} />);

    expect(await screen.findByText("git fetch origin --prune")).toBeDefined();
    expect(screen.getByText("git push origin main")).toBeDefined();
    expect(screen.getByText("Updates were rejected")).toBeDefined();
    expect(screen.getByText("120 ms")).toBeDefined();

    const clearBtn = screen.getByText("清空");
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(host.clearOperationLogs).toHaveBeenCalled();
      expect(screen.getByText("暂无 Git 命令行执行记录")).toBeDefined();
    });
  });
});
