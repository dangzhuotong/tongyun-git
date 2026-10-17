import { describe, it, expect } from "vitest";
import type { RefBadge } from "../../lib/host";
import { cleanRefBadges } from "./LogView";

const badge = (name: string, kind: RefBadge["kind"]): RefBadge => ({ name, kind });

describe("cleanRefBadges", () => {
  it("returns an empty list for no refs", () => {
    expect(cleanRefBadges([])).toEqual([]);
  });

  it("labels HEAD with a fixed badge", () => {
    expect(cleanRefBadges([badge("HEAD", "Head")])).toEqual([
      { label: "HEAD", fullTitle: "HEAD 检出指针", kind: "Head" },
    ]);
  });

  it("keeps local branch names and titles", () => {
    expect(cleanRefBadges([badge("main", "LocalBranch")])).toEqual([
      { label: "main", fullTitle: "本地分支: main", kind: "LocalBranch" },
    ]);
  });

  it("drops a remote branch that duplicates a local branch name", () => {
    const cleaned = cleanRefBadges([
      badge("main", "LocalBranch"),
      badge("origin/main", "RemoteBranch"),
    ]);
    expect(cleaned).toEqual([
      { label: "main", fullTitle: "本地分支: main", kind: "LocalBranch" },
    ]);
  });

  it("keeps a remote branch with no local counterpart", () => {
    expect(cleanRefBadges([badge("origin/dev", "RemoteBranch")])).toEqual([
      { label: "origin/dev", fullTitle: "远程分支: origin/dev", kind: "RemoteBranch" },
    ]);
  });

  it("only strips the leading origin/ prefix when comparing names", () => {
    const cleaned = cleanRefBadges([
      badge("dev", "LocalBranch"),
      badge("upstream/dev", "RemoteBranch"),
    ]);
    expect(cleaned.map((c) => c.label)).toEqual(["dev", "upstream/dev"]);
  });

  it("labels tags", () => {
    expect(cleanRefBadges([badge("v1.0.0", "Tag")])).toEqual([
      { label: "v1.0.0", fullTitle: "标签: v1.0.0", kind: "Tag" },
    ]);
  });

  it("falls back to the raw name for unknown kinds", () => {
    const other = { name: "refs/notes/x", kind: "Other" } as unknown as RefBadge;
    expect(cleanRefBadges([other])).toEqual([
      { label: "refs/notes/x", fullTitle: "refs/notes/x", kind: "Other" },
    ]);
  });

  it("filters regardless of ordering and preserves the remaining order", () => {
    const cleaned = cleanRefBadges([
      badge("origin/main", "RemoteBranch"),
      badge("HEAD", "Head"),
      badge("main", "LocalBranch"),
      badge("v2", "Tag"),
    ]);
    expect(cleaned.map((c) => c.label)).toEqual(["HEAD", "main", "v2"]);
  });
});
