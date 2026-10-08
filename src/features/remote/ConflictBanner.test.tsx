import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ConflictBanner } from "./ConflictBanner";
import * as host from "../../lib/host";

vi.mock("../../lib/host", () => ({
  abortMergeOrRebase: vi.fn(),
}));

describe("ConflictBanner", () => {
  const rootPath = "/mock/repo";

  it("does not render when repoState is Clean or null", () => {
    const { container } = render(
      <ConflictBanner
        rootPath={rootPath}
        repoState="Clean"
        onAbortSuccess={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders when repoState is Merge and handles abort action", async () => {
    vi.mocked(host.abortMergeOrRebase).mockResolvedValue({
      success: true,
      action: "merge",
      output: "",
      error_message: null,
    });

    vi.spyOn(window, "confirm").mockReturnValue(true);

    const onAbortSuccess = vi.fn();
    render(
      <ConflictBanner
        rootPath={rootPath}
        repoState="Merge"
        onAbortSuccess={onAbortSuccess}
      />
    );

    expect(screen.getByText(/合并冲突中/)).toBeDefined();

    const abortBtn = screen.getByText("中止合并 (Abort Merge)");
    fireEvent.click(abortBtn);

    await waitFor(() => {
      expect(host.abortMergeOrRebase).toHaveBeenCalledWith(rootPath);
      expect(onAbortSuccess).toHaveBeenCalled();
    });
  });
});
