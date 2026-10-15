import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AboutModal } from "./AboutModal";

describe("AboutModal", () => {
  it("does not render when isOpen is false", () => {
    const { container } = render(
      <AboutModal isOpen={false} onClose={vi.fn()} appInfo={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders app details and version when isOpen is true", () => {
    const mockAppInfo = {
      name: "tongyun-git",
      version: "0.1.0",
      identifier: "com.tongyun.git",
      git_version: "2.47.3",
      libgit2_version: "1.9.7",
    };

    render(
      <AboutModal isOpen={true} onClose={vi.fn()} appInfo={mockAppInfo} />
    );

    expect(screen.getByText("关于 橦云 Git")).toBeDefined();
    expect(screen.getByText("橦云 Git (tongyun-git)")).toBeDefined();
    expect(screen.getByText("v0.1.0")).toBeDefined();
    expect(screen.getByText("2.47.3")).toBeDefined();
    expect(screen.getByText("1.9.7")).toBeDefined();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<AboutModal isOpen={true} onClose={onClose} appInfo={null} />);

    const closeBtn = screen.getByTitle("关闭 (Esc)");
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
