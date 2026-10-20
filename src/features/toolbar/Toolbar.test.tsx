import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Toolbar } from "./Toolbar";
import type { RepoInfo } from "../../lib/host";

const mockRepo: RepoInfo = {
  name: "test-repo",
  root_path: "/Users/d/code/testdaily/test-repo",
  head: {
    branch: "main",
    oid: "abcdef123456",
    unborn: false,
    repo_state: "Clean",
  },
};

describe("Toolbar", () => {
  it("renders recent repos with project name and path in dropdown", () => {
    const onOpenRepo = vi.fn();
    const onOpenModalClick = vi.fn();

    render(
      <Toolbar
        currentRepo={mockRepo}
        recentRepos={[
          "/Users/d/code/testdaily/test-repo",
          "/Users/d/code/testdaily/03-lj-class/lj_student_manage_vue",
        ]}
        onOpenRepo={onOpenRepo}
        onOpenModalClick={onOpenModalClick}
        onRefresh={vi.fn()}
        isRefreshing={false}
        theme="light"
        onToggleTheme={vi.fn()}
        onOpenSettings={vi.fn()}
        gitAvailable={true}
      />
    );

    // Click the repo switcher dropdown button
    const repoBtn = screen.getByRole("button", { name: /test-repo/ });
    fireEvent.click(repoBtn);

    // Verify recent repo names and paths are rendered
    expect(screen.getByText("lj_student_manage_vue")).toBeDefined();
    expect(screen.getByText("/Users/d/code/testdaily/03-lj-class/lj_student_manage_vue")).toBeDefined();
    expect(screen.getByText("当前")).toBeDefined();

    // Click on the other repository
    fireEvent.click(screen.getByText("lj_student_manage_vue"));
    expect(onOpenRepo).toHaveBeenCalledWith("/Users/d/code/testdaily/03-lj-class/lj_student_manage_vue");
  });
});
