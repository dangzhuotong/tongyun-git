import type { LogCommit } from "../../lib/host";

export const LANE_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#14b8a6", // teal
  "#f97316", // orange
];

export const COL_WIDTH = 14;
export const ROW_HEIGHT = 28;
export const RADIUS = 4;

export interface RowGraphInfo {
  /** Column index where the commit circle is placed */
  col: number;
  /** Active lanes passing vertically through this row */
  passingLanes: number[];
  /** Columns from the row above that connect into this commit node */
  incomingCols: number[];
  /** Columns into which this commit branches downwards to the row below */
  outgoingCols: number[];
  /** Maximum column index involved in this row */
  maxCol: number;
}

/**
 * Computes continuous, non-breaking graph lane topology for a chronological (descending) commit list.
 */
export function computeGraphTopology(commits: LogCommit[]): RowGraphInfo[] {
  if (commits.length === 0) {
    return [];
  }

  // Set of all commit OIDs present in the current view to distinguish known vs external/unloaded parents
  const knownOids = new Set(commits.map((c) => c.oid));

  // Tracks which commit OID is expected by each column from the preceding row
  const activeLanes: (string | null)[] = [];
  const result: RowGraphInfo[] = [];

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const oid = commit.oid;
    const parents = commit.parents;

    // 1. Find all incoming lanes that target this commit
    const matchingCols: number[] = [];
    for (let c = 0; c < activeLanes.length; c++) {
      if (activeLanes[c] === oid) {
        matchingCols.push(c);
      }
    }

    // 2. Determine this commit's column
    let col: number;
    if (matchingCols.length > 0) {
      // Inherit the first lane targeting this commit
      col = matchingCols[0];
    } else {
      // New branch head: find first free slot or allocate a new column
      const freeIndex = activeLanes.indexOf(null);
      if (freeIndex !== -1) {
        col = freeIndex;
      } else {
        col = activeLanes.length;
      }
    }

    // 3. Determine passing lanes (lanes active in this row that don't belong to this commit)
    const passingLanes: number[] = [];
    for (let c = 0; c < activeLanes.length; c++) {
      if (c !== col && activeLanes[c] !== null && activeLanes[c] !== oid) {
        passingLanes.push(c);
      }
    }

    // 4. Update active lanes and calculate outgoing connections
    // Clear converged lanes (other than the primary col)
    for (const c of matchingCols) {
      if (c !== col) {
        activeLanes[c] = null;
      }
    }

    const outgoingCols: number[] = [];

    if (parents.length === 0) {
      // Root commit: lane terminates here
      activeLanes[col] = null;
    } else {
      // First parent continues or branches
      const p0 = parents[0];
      const p0InView = knownOids.has(p0);

      // Check if p0 is already tracked in an existing lane
      const existingP0Col = activeLanes.indexOf(p0);

      if (existingP0Col !== -1) {
        outgoingCols.push(existingP0Col);
        if (existingP0Col !== col) {
          activeLanes[col] = null;
        }
      } else if (p0InView) {
        activeLanes[col] = p0;
        outgoingCols.push(col);
      } else {
        // Parent not in current batch/view: lead out to indicate continuation, but don't hold lane
        activeLanes[col] = null;
        outgoingCols.push(col);
      }

      // Subsequent parents (Merge commit: 2nd, 3rd parents)
      for (let pIdx = 1; pIdx < parents.length; pIdx++) {
        const pk = parents[pIdx];
        const pkInView = knownOids.has(pk);
        const existingPkCol = activeLanes.indexOf(pk);

        if (existingPkCol !== -1) {
          if (!outgoingCols.includes(existingPkCol)) {
            outgoingCols.push(existingPkCol);
          }
        } else if (pkInView) {
          // Allocate new lane for feature branch parent
          const freeSlot = activeLanes.indexOf(null);
          const newCol = freeSlot !== -1 ? freeSlot : activeLanes.length;
          activeLanes[newCol] = pk;
          outgoingCols.push(newCol);
        } else {
          // Parent not in view: allocate temporary outgoing indicator
          const freeSlot = activeLanes.indexOf(null);
          const newCol = freeSlot !== -1 ? freeSlot : activeLanes.length;
          outgoingCols.push(newCol);
        }
      }
    }

    // Clean trailing nulls in activeLanes
    while (activeLanes.length > 0 && activeLanes[activeLanes.length - 1] === null) {
      activeLanes.pop();
    }

    const maxCol = Math.max(
      col,
      ...passingLanes,
      ...matchingCols,
      ...outgoingCols,
      0
    );

    result.push({
      col,
      passingLanes,
      incomingCols: matchingCols,
      outgoingCols,
      maxCol,
    });
  }

  return result;
}
