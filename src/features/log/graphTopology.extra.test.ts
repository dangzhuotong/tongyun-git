import { describe, it, expect } from "vitest";
import {
  computeGraphTopology,
  LANE_COLORS,
  COL_WIDTH,
  ROW_HEIGHT,
  RADIUS,
} from "./graphTopology";
import type { LogCommit } from "../../lib/host";

function makeCommit(oid: string, parents: string[]): LogCommit {
  return {
    oid,
    short_oid: oid.slice(0, 7),
    parents,
    summary: oid,
    message: oid,
    author_name: "Dev",
    author_email: "dev@example.com",
    timestamp: 1700000000,
    refs: [],
    col: 0,
    edges: [],
  };
}

describe("graph topology constants", () => {
  it("exposes layout metrics and a cycling palette of hex lane colors", () => {
    expect(COL_WIDTH).toBe(14);
    expect(ROW_HEIGHT).toBe(28);
    expect(RADIUS).toBe(4);
    expect(LANE_COLORS).toHaveLength(8);
    for (const color of LANE_COLORS) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(new Set(LANE_COLORS).size).toBe(LANE_COLORS.length);
    expect(LANE_COLORS[8 % LANE_COLORS.length]).toBe(LANE_COLORS[0]);
  });
});

describe("computeGraphTopology extra cases", () => {
  it("leads out to an off-screen parent without holding the lane open", () => {
    const topo = computeGraphTopology([makeCommit("a", ["outside"])]);
    expect(topo).toEqual([
      { col: 0, passingLanes: [], incomingCols: [], outgoingCols: [0], maxCol: 0 },
    ]);
  });

  it("holds a straight lane for an in-view parent", () => {
    const topo = computeGraphTopology([makeCommit("a", ["b"]), makeCommit("b", [])]);
    expect(topo).toEqual([
      { col: 0, passingLanes: [], incomingCols: [], outgoingCols: [0], maxCol: 0 },
      { col: 0, passingLanes: [], incomingCols: [0], outgoingCols: [], maxCol: 0 },
    ]);
  });

  it("allocates one lane per parent for an octopus merge", () => {
    const topo = computeGraphTopology([
      makeCommit("m", ["p1", "p2", "p3"]),
      makeCommit("p1", []),
      makeCommit("p2", []),
      makeCommit("p3", []),
    ]);
    expect(topo[0]).toEqual({
      col: 0,
      passingLanes: [],
      incomingCols: [],
      outgoingCols: [0, 1, 2],
      maxCol: 2,
    });
    expect(topo[1]).toEqual({
      col: 0,
      passingLanes: [1, 2],
      incomingCols: [0],
      outgoingCols: [],
      maxCol: 2,
    });
    expect(topo[2]).toEqual({
      col: 1,
      passingLanes: [2],
      incomingCols: [1],
      outgoingCols: [],
      maxCol: 2,
    });
    expect(topo[3]).toEqual({
      col: 2,
      passingLanes: [],
      incomingCols: [2],
      outgoingCols: [],
      maxCol: 2,
    });
  });

  it("reuses a column freed by an earlier commit while other lanes stay active", () => {
    const topo = computeGraphTopology([
      makeCommit("a", ["b", "c"]),
      makeCommit("b", []),
      makeCommit("d", ["e"]),
      makeCommit("c", []),
      makeCommit("e", []),
    ]);
    expect(topo.map((r) => [r.col, r.incomingCols, r.passingLanes, r.outgoingCols, r.maxCol])).toEqual([
      [0, [], [], [0, 1], 1],
      [0, [0], [1], [], 1],
      [0, [], [1], [0], 1],
      [1, [1], [0], [], 1],
      [0, [0], [], [], 0],
    ]);
  });

  it("does not mutate the commit list it is given", () => {
    const commits = [
      makeCommit("a", ["b", "c"]),
      makeCommit("b", []),
      makeCommit("c", []),
    ];
    const before = JSON.stringify(commits);
    computeGraphTopology(commits);
    expect(JSON.stringify(commits)).toBe(before);
  });
});
