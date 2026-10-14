import { describe, it, expect } from "vitest";
import { computeGraphTopology } from "./graphTopology";
import type { LogCommit } from "../../lib/host";

function makeCommit(
  oid: string,
  parents: string[],
  summary = ""
): LogCommit {
  return {
    oid,
    short_oid: oid.slice(0, 7),
    parents,
    summary: summary || oid,
    message: summary || oid,
    author_name: "Dev",
    author_email: "dev@example.com",
    timestamp: 1700000000,
    refs: [],
    col: 0,
    edges: [],
  };
}

describe("computeGraphTopology", () => {
  it("handles empty commit list", () => {
    expect(computeGraphTopology([])).toEqual([]);
  });

  it("calculates continuous straight line for linear commits", () => {
    const commits = [
      makeCommit("c3", ["c2"]),
      makeCommit("c2", ["c1"]),
      makeCommit("c1", []),
    ];

    const topo = computeGraphTopology(commits);
    expect(topo.length).toBe(3);

    // Row 0: c3 (HEAD)
    expect(topo[0].col).toBe(0);
    expect(topo[0].incomingCols).toEqual([]);
    expect(topo[0].outgoingCols).toEqual([0]);
    expect(topo[0].passingLanes).toEqual([]);

    // Row 1: c2
    expect(topo[1].col).toBe(0);
    expect(topo[1].incomingCols).toEqual([0]);
    expect(topo[1].outgoingCols).toEqual([0]);
    expect(topo[1].passingLanes).toEqual([]);

    // Row 2: c1 (Root)
    expect(topo[2].col).toBe(0);
    expect(topo[2].incomingCols).toEqual([0]);
    expect(topo[2].outgoingCols).toEqual([]);
    expect(topo[2].passingLanes).toEqual([]);
  });

  it("calculates fork, merge, and passing lanes correctly (reproducing merge flow)", () => {
    // History topology (from top to bottom / newest to oldest):
    // c_head: dev latest, parent: c_merge
    // c_merge: merge origin/dev into dev, parents: [c_dev, c_feat]
    // c_dev: on dev branch, parent: c_base
    // c_feat: on origin/dev branch, parent: c_base
    // c_base: common ancestor, parents: []
    const commits = [
      makeCommit("c_head", ["c_merge"]),
      makeCommit("c_merge", ["c_dev", "c_feat"], "Merge remote-tracking branch 'origin/dev' into dev"),
      makeCommit("c_dev", ["c_base"], "fix(arranging): fix bug on dev"),
      makeCommit("c_feat", ["c_base"], "feat(plan): feature from origin/dev"),
      makeCommit("c_base", [], "chore: initial commit"),
    ];

    const topo = computeGraphTopology(commits);
    expect(topo.length).toBe(5);

    // Row 0: c_head
    expect(topo[0].col).toBe(0);
    expect(topo[0].outgoingCols).toEqual([0]);

    // Row 1: c_merge (Merge commit!)
    // Incoming from c_head (col 0)
    // Outgoing to c_dev (col 0) and c_feat (col 1)
    expect(topo[1].col).toBe(0);
    expect(topo[1].incomingCols).toEqual([0]);
    expect(topo[1].outgoingCols).toEqual([0, 1]);
    expect(topo[1].passingLanes).toEqual([]);

    // Row 2: c_dev (on col 0)
    // col 1 (carrying c_feat) MUST PASS THROUGH this row!
    expect(topo[2].col).toBe(0);
    expect(topo[2].incomingCols).toEqual([0]);
    expect(topo[2].passingLanes).toEqual([1]); // <--- Crucial! Passing lane!
    expect(topo[2].outgoingCols).toEqual([0]);

    // Row 3: c_feat (on col 1)
    // It should receive incoming connection on col 1.
    // And its parent is c_base (col 0), which is also the parent of c_dev!
    expect(topo[3].col).toBe(1);
    expect(topo[3].incomingCols).toEqual([1]);
    expect(topo[3].passingLanes).toEqual([0]); // col 0 passing through
    expect(topo[3].outgoingCols).toEqual([0]); // joins into col 0

    // Row 4: c_base (Root)
    // Received incoming from col 0
    expect(topo[4].col).toBe(0);
    expect(topo[4].incomingCols).toEqual([0]);
    expect(topo[4].outgoingCols).toEqual([]);
    expect(topo[4].passingLanes).toEqual([]);
  });
});
