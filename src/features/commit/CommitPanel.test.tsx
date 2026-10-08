import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CommitPanel } from "./CommitPanel";
import * as host from "../../lib/host";

vi.mock("../../lib/host", () => ({
  checkCommitIdentity: vi.fn(),
  inspectAmend: vi.fn(),
  createCommit: vi.fn(),
  getAiKeyStatus: vi.fn(),
  generateAiCommitMessage: vi.fn(),
}));

describe("CommitPanel component", () => {
  const rootPath = "/test/repo";
  const defaultOnCommitSuccess = vi.fn();
  const defaultOnOpenSettings = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("AT-06a: handles commit with staged files and saves draft until commit succeeds", async () => {
    vi.mocked(host.inspectAmend).mockResolvedValue({
      can_amend: true,
      disabled_reason: null,
      head_message: "chore: init",
      is_pushed: false,
      pushed_remote_branches: [],
    });
    vi.mocked(host.checkCommitIdentity).mockResolvedValue({
      name: "Bob",
      email: "bob@example.com",
    });
    vi.mocked(host.createCommit).mockResolvedValue({
      oid: "12345678",
      short_oid: "1234567",
      summary: "feat: add feature",
    });

    render(
      <CommitPanel
        rootPath={rootPath}
        stagedCount={2}
        onCommitSuccess={defaultOnCommitSuccess}
        onOpenSettings={defaultOnOpenSettings}
      />
    );

    const textarea = screen.getByPlaceholderText(
      /提交信息 \(首行标题/
    ) as HTMLTextAreaElement;

    // Type message
    fireEvent.change(textarea, { target: { value: "feat: add feature" } });
    expect(localStorage.getItem(`tongyun_commit_draft_${rootPath}`)).toBe(
      "feat: add feature"
    );

    // Click commit
    const commitBtn = screen.getByRole("button", { name: "提交 (2)" });
    fireEvent.click(commitBtn);

    await waitFor(() => {
      expect(host.checkCommitIdentity).toHaveBeenCalledWith(rootPath);
      expect(host.createCommit).toHaveBeenCalledWith(
        rootPath,
        "feat: add feature",
        false
      );
      expect(defaultOnCommitSuccess).toHaveBeenCalled();
    });

    expect(textarea.value).toBe("");
    expect(localStorage.getItem(`tongyun_commit_draft_${rootPath}`)).toBeNull();
  });

  it("AT-06b: keeps commit message and displays error on hook failure", async () => {
    vi.mocked(host.inspectAmend).mockResolvedValue({
      can_amend: true,
      disabled_reason: null,
      head_message: "chore: init",
      is_pushed: false,
      pushed_remote_branches: [],
    });
    vi.mocked(host.checkCommitIdentity).mockResolvedValue({
      name: "Bob",
      email: "bob@example.com",
    });
    vi.mocked(host.createCommit).mockRejectedValue(
      new Error("pre-commit hook failed: lint errors found")
    );

    render(
      <CommitPanel
        rootPath={rootPath}
        stagedCount={1}
        onCommitSuccess={defaultOnCommitSuccess}
        onOpenSettings={defaultOnOpenSettings}
      />
    );

    const textarea = screen.getByPlaceholderText(
      /提交信息 \(首行标题/
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "fix: broken code" } });

    const commitBtn = screen.getByRole("button", { name: "提交 (1)" });
    fireEvent.click(commitBtn);

    await waitFor(() => {
      expect(screen.getByText(/pre-commit hook failed/)).toBeDefined();
    });

    // Content in textarea must not be wiped
    expect(textarea.value).toBe("fix: broken code");
    expect(defaultOnCommitSuccess).not.toHaveBeenCalled();
  });

  it("AT-06e: shows IdentityModal when user identity is unconfigured", async () => {
    vi.mocked(host.inspectAmend).mockResolvedValue({
      can_amend: false,
      disabled_reason: "初始空仓库",
      head_message: null,
      is_pushed: false,
      pushed_remote_branches: [],
    });
    vi.mocked(host.checkCommitIdentity).mockResolvedValue(null);

    render(
      <CommitPanel
        rootPath={rootPath}
        stagedCount={1}
        onCommitSuccess={defaultOnCommitSuccess}
        onOpenSettings={defaultOnOpenSettings}
      />
    );

    const textarea = screen.getByPlaceholderText(/提交信息 \(首行标题/);
    fireEvent.change(textarea, { target: { value: "feat: initial" } });

    const commitBtn = screen.getByRole("button", { name: "提交 (1)" });
    fireEvent.click(commitBtn);

    await waitFor(() => {
      expect(screen.getByText("未配置 Git 提交者身份")).toBeDefined();
      expect(screen.getByText(/git config --global user.name/)).toBeDefined();
    });

    expect(host.createCommit).not.toHaveBeenCalled();
  });

  it("AT-06f & AT-06k: toggles amend to load HEAD message and restores draft upon unchecking", async () => {
    vi.mocked(host.inspectAmend).mockResolvedValue({
      can_amend: true,
      disabled_reason: null,
      head_message: "fix: previous head commit\n\nbody message",
      is_pushed: false,
      pushed_remote_branches: [],
    });

    render(
      <CommitPanel
        rootPath={rootPath}
        stagedCount={1}
        onCommitSuccess={defaultOnCommitSuccess}
        onOpenSettings={defaultOnOpenSettings}
      />
    );

    const textarea = (await screen.findByPlaceholderText(
      /提交信息 \(首行标题/
    )) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "wip draft message" } });

    const amendCheckbox = screen.getByLabelText("修改上一次提交");

    // Check amend
    fireEvent.click(amendCheckbox);
    expect(textarea.value).toBe("fix: previous head commit\n\nbody message");
    expect(screen.getByRole("button", { name: "修改提交" })).toBeDefined();

    // Uncheck amend (AT-06k)
    fireEvent.click(amendCheckbox);
    expect(textarea.value).toBe("wip draft message");
    expect(screen.getByRole("button", { name: "提交 (1)" })).toBeDefined();
  });

  it("AT-06g: allows amending commit message even when stagedCount is 0", async () => {
    vi.mocked(host.inspectAmend).mockResolvedValue({
      can_amend: true,
      disabled_reason: null,
      head_message: "docs: typo",
      is_pushed: false,
      pushed_remote_branches: [],
    });
    vi.mocked(host.checkCommitIdentity).mockResolvedValue({
      name: "Bob",
      email: "bob@example.com",
    });
    vi.mocked(host.createCommit).mockResolvedValue({
      oid: "99999",
      short_oid: "99999",
      summary: "docs: typo fixed",
    });

    render(
      <CommitPanel
        rootPath={rootPath}
        stagedCount={0}
        onCommitSuccess={defaultOnCommitSuccess}
        onOpenSettings={defaultOnOpenSettings}
      />
    );

    const amendCheckbox = await screen.findByLabelText("修改上一次提交");
    fireEvent.click(amendCheckbox);

    const textarea = screen.getByPlaceholderText(
      /提交信息 \(首行标题/
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "docs: typo fixed" } });

    const commitBtn = screen.getByRole("button", { name: "修改提交" });
    expect(commitBtn.getAttribute("disabled")).toBeNull();

    fireEvent.click(commitBtn);

    await waitFor(() => {
      expect(host.createCommit).toHaveBeenCalledWith(
        rootPath,
        "docs: typo fixed",
        true
      );
    });
  });

  it("AT-06h: prompts warning modal when amending a pushed commit", async () => {
    vi.mocked(host.inspectAmend).mockResolvedValue({
      can_amend: true,
      disabled_reason: null,
      head_message: "feat: already pushed",
      is_pushed: true,
      pushed_remote_branches: ["origin/main"],
    });
    vi.mocked(host.checkCommitIdentity).mockResolvedValue({
      name: "Bob",
      email: "bob@example.com",
    });
    vi.mocked(host.createCommit).mockResolvedValue({
      oid: "pushed_amended",
      short_oid: "pushed",
      summary: "feat: amended pushed",
    });

    render(
      <CommitPanel
        rootPath={rootPath}
        stagedCount={1}
        onCommitSuccess={defaultOnCommitSuccess}
        onOpenSettings={defaultOnOpenSettings}
      />
    );

    const amendCheckbox = await screen.findByLabelText(/修改上一次提交/);
    fireEvent.click(amendCheckbox);

    const commitBtn = screen.getByRole("button", { name: "修改提交" });
    fireEvent.click(commitBtn);

    // Warning modal should open
    expect(await screen.findByText("修改已推送提交警告")).toBeDefined();
    expect(screen.getByText(/• origin\/main/)).toBeDefined();

    // Cancel first
    const cancelBtn = screen.getByRole("button", { name: "取消" });
    fireEvent.click(cancelBtn);
    expect(host.createCommit).not.toHaveBeenCalled();

    // Click again and confirm
    fireEvent.click(commitBtn);
    const confirmBtn = await screen.findByRole("button", {
      name: "仍然修改提交",
    });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(host.createCommit).toHaveBeenCalledWith(
        rootPath,
        "feat: already pushed",
        true
      );
    });
  });

  it("AT-07c: prompts settings when AI key is missing", async () => {
    vi.mocked(host.inspectAmend).mockResolvedValue({
      can_amend: false,
      disabled_reason: null,
      head_message: null,
      is_pushed: false,
      pushed_remote_branches: [],
    });
    vi.mocked(host.getAiKeyStatus).mockResolvedValue({
      kie: false,
      openai: false,
      ollama: false,
      keyring_available: true,
    });

    render(
      <CommitPanel
        rootPath={rootPath}
        stagedCount={1}
        onCommitSuccess={defaultOnCommitSuccess}
        onOpenSettings={defaultOnOpenSettings}
      />
    );

    const aiBtn = screen.getByRole("button", { name: "AI 生成" });
    fireEvent.click(aiBtn);

    await waitFor(() => {
      expect(screen.getByText("未配置 KIE 接口 key，请在设置中配置")).toBeDefined();
    });

    // Click "去设置"
    const settingsLink = screen.getByRole("button", { name: "去设置" });
    fireEvent.click(settingsLink);
    expect(defaultOnOpenSettings).toHaveBeenCalled();
  });

  it("AT-07f: shows consent modal on first AI usage and executes upon consent", async () => {
    vi.mocked(host.inspectAmend).mockResolvedValue({
      can_amend: false,
      disabled_reason: null,
      head_message: null,
      is_pushed: false,
      pushed_remote_branches: [],
    });
    vi.mocked(host.getAiKeyStatus).mockResolvedValue({
      kie: true,
      openai: false,
      ollama: false,
      keyring_available: true,
    });
    vi.mocked(host.generateAiCommitMessage).mockResolvedValue(
      "feat: ai generated commit summary"
    );

    render(
      <CommitPanel
        rootPath={rootPath}
        stagedCount={1}
        onCommitSuccess={defaultOnCommitSuccess}
        onOpenSettings={defaultOnOpenSettings}
      />
    );

    const aiBtn = screen.getByRole("button", { name: "AI 生成" });
    fireEvent.click(aiBtn);

    // Consent modal opens
    expect(await screen.findByText("AI 生成提交信息授权")).toBeDefined();
    expect(screen.getByText("同意并生成")).toBeDefined();

    // Confirm
    fireEvent.click(screen.getByRole("button", { name: "同意并生成" }));

    await waitFor(() => {
      expect(host.generateAiCommitMessage).toHaveBeenCalled();
    });

    const textarea = screen.getByPlaceholderText(
      /提交信息 \(首行标题/
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("feat: ai generated commit summary");
  });
});
