import { describe, it, expect } from "vitest";
import {
  computeGraphTopology,
  LANE_COLORS,
  COL_WIDTH,
  ROW_HEIGHT,
  RADIUS,
} from "./graphTopology";
import { cleanRefBadges } from "./LogView";
import type { LogCommit, RefBadge } from "../../lib/host";

function makeCommit(oid: string, parents: string[], summary = ""): LogCommit {
  return {
    oid,
    short_oid: oid.slice(0, 7),
    parents,
    summary: summary || oid,
    message: summary || oid,
    author_name: "Author",
    author_email: "author@example.com",
    timestamp: 1700000000,
    refs: [],
    col: 0,
    edges: [],
  };
}

describe("logGraphUtils - graphTopology constants and topology computation", () => {
  it("defines standard layout dimensions and lane colors", () => {
    expect(COL_WIDTH).toBe(14);
    expect(ROW_HEIGHT).toBe(28);
    expect(RADIUS).toBe(4);
    expect(LANE_COLORS.length).toBe(8);
    expect(new Set(LANE_COLORS).size).toBe(8);
  });

  it("handles octopus merge with 3 parents correctly", () => {
    const commits = [
      makeCommit("c_octo", ["c_p0", "c_p1", "c_p2"]),
      makeCommit("c_p0", ["c_base"]),
      makeCommit("c_p1", ["c_base"]),
      makeCommit("c_p2", ["c_base"]),
      makeCommit("c_base", []),
    ];

    const topo = computeGraphTopology(commits);
    expect(topo).toHaveLength(5);

    // Row 0: Octopus merge
    expect(topo[0].col).toBe(0);
    expect(topo[0].incomingCols).toEqual([]);
    expect(topo[0].outgoingCols).toEqual([0, 1, 2]);
    expect(topo[0].maxCol).toBe(2);

    // Row 1: c_p0 (col 0)
    expect(topo[1].col).toBe(0);
    expect(topo[1].incomingCols).toEqual([0]);
    expect(topo[1].passingLanes).toEqual([1, 2]);

    // Row 2: c_p1 (col 1)
    expect(topo[2].col).toBe(1);
    expect(topo[2].incomingCols).toEqual([1]);
    expect(topo[2].passingLanes).toEqual([0, 2]);

    // Row 3: c_p2 (col 2)
    expect(topo[3].col).toBe(2);
    expect(topo[3].incomingCols).toEqual([2]);
    expect(topo[3].passingLanes).toEqual([0]);
    expect(topo[3].outgoingCols).toEqual([0]);

    // Row 4: c_base (col 0)
    expect(topo[4].col).toBe(0);
    expect(topo[4].incomingCols).toEqual([0]);
    expect(topo[4].outgoingCols).toEqual([]);
    expect(topo[4].passingLanes).toEqual([]);
  });

  it("handles commits with external/unloaded parents gracefully", () => {
    // c_boundary's parent is not in this batch
    const commits = [
      makeCommit("c_top", ["c_boundary"]),
      makeCommit("c_boundary", ["c_unloaded_parent"]),
      makeCommit("c_other", []),
    ];

    const topo = computeGraphTopology(commits);
    expect(topo).toHaveLength(3);

    expect(topo[0].col).toBe(0);
    expect(topo[0].outgoingCols).toEqual([0]);

    expect(topo[1].col).toBe(0);
    expect(topo[1].incomingCols).toEqual([0]);
    // Outgoing indicator still points downwards to show continuation
    expect(topo[1].outgoingCols).toEqual([0]);

    // Because c_boundary terminates its tracked lane, c_other can reuse col 0
    expect(topo[2].col).toBe(0);
    expect(topo[2].incomingCols).toEqual([]);
    expect(topo[2].outgoingCols).toEqual([]);
  });
});

describe("logGraphUtils - cleanRefBadges", () => {
  it("returns empty array for empty or missing refs", () => {
    expect(cleanRefBadges([])).toEqual([]);
  });

  it("formats HEAD and local branches", () => {
    const refs: RefBadge[] = [
      { name: "HEAD", kind: "Head" },
      { name: "main", kind: "LocalBranch" },
    ];

    const cleaned = cleanRefBadges(refs);
    expect(cleaned).toEqual([
      { label: "HEAD", fullTitle: "HEAD 检出指针", kind: "Head" },
      { label: "main", fullTitle: "本地分支: main", kind: "LocalBranch" },
    ]);
  });

  it("suppresses redundant origin/branch when local branch with same name exists", () => {
    const refs: RefBadge[] = [
      { name: "dev", kind: "LocalBranch" },
      { name: "origin/dev", kind: "RemoteBranch" },
      { name: "origin/feature-only", kind: "RemoteBranch" },
    ];

    const cleaned = cleanRefBadges(refs);
    // origin/dev is filtered out because local dev exists
    expect(cleaned).toEqual([
      { label: "dev", fullTitle: "本地分支: dev", kind: "LocalBranch" },
      { label: "origin/feature-only", fullTitle: "远程分支: origin/feature-only", kind: "RemoteBranch" },
    ]);
  });

  it("keeps non-origin remote branches even if local branch matches name", () => {
    const refs: RefBadge[] = [
      { name: "main", kind: "LocalBranch" },
      { name: "upstream/main", kind: "RemoteBranch" },
    ];

    const cleaned = cleanRefBadges(refs);
    expect(cleaned).toEqual([
      { label: "main", fullTitle: "本地分支: main", kind: "LocalBranch" },
      { label: "upstream/main", fullTitle: "远程分支: upstream/main", kind: "RemoteBranch" },
    ]);
  });

  it("formats tags and other custom refs correctly", () => {
    const refs: RefBadge[] = [
      { name: "v1.0.0", kind: "Tag" },
      { name: "custom-ref", kind: "Other" as any },
    ];

    const cleaned = cleanRefBadges(refs);
    expect(cleaned).toEqual([
      { label: "v1.0.0", fullTitle: "标签: v1.0.0", kind: "Tag" },
      { label: "custom-ref", fullTitle: "custom-ref", kind: "Other" },
    ]);
  });
});
