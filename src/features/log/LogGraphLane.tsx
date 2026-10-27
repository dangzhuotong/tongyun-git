import type { GraphEdge } from "../../lib/host";
import {
  LANE_COLORS,
  COL_WIDTH,
  ROW_HEIGHT,
  RADIUS,
  type RowGraphInfo,
} from "./graphTopology";

export interface LogGraphLaneProps {
  col?: number;
  edges?: GraphEdge[];
  maxCol: number;
  rowInfo?: RowGraphInfo;
}

export function LogGraphLane({
  col = 0,
  edges = [],
  maxCol,
  rowInfo,
}: LogGraphLaneProps) {
  const effectiveMaxCol = rowInfo ? Math.max(maxCol, rowInfo.maxCol) : maxCol;
  const width = Math.max(1, effectiveMaxCol + 1) * COL_WIDTH + 8;
  const centerY = ROW_HEIGHT / 2; // 14

  const laneX = (c: number) => c * COL_WIDTH + COL_WIDTH / 2;

  if (rowInfo) {
    const nodeCol = rowInfo.col;
    const nodeX = laneX(nodeCol);
    const nodeColor = LANE_COLORS[nodeCol % LANE_COLORS.length];

    return (
      <svg
        width={width}
        height={ROW_HEIGHT}
        className="shrink-0 overflow-visible"
        style={{ minWidth: `${width}px` }}
      >
        {/* 1. Continuous Passing Lanes (vertical line across the entire row) */}
        {rowInfo.passingLanes.map((pCol) => {
          const x = laneX(pCol);
          const color = LANE_COLORS[pCol % LANE_COLORS.length];
          return (
            <line
              key={`pass-${pCol}`}
              x1={x}
              y1={0}
              x2={x}
              y2={ROW_HEIGHT}
              stroke={color}
              strokeWidth={2}
            />
          );
        })}

        {/* 2. Incoming lines from above (from y=0 down to node centerY=14) */}
        {rowInfo.incomingCols.map((inCol) => {
          const fromX = laneX(inCol);
          const color = LANE_COLORS[inCol % LANE_COLORS.length];

          if (inCol === nodeCol) {
            // Straight vertical line connecting into node from top
            return (
              <line
                key={`in-${inCol}`}
                x1={fromX}
                y1={0}
                x2={fromX}
                y2={centerY}
                stroke={color}
                strokeWidth={2}
              />
            );
          }

          // Smooth convergence curve from upper column into this node
          // Tangents are strictly vertical at both endpoints
          return (
            <path
              key={`in-${inCol}`}
              d={`M ${fromX} 0 C ${fromX} 7, ${nodeX} 7, ${nodeX} ${centerY}`}
              fill="none"
              stroke={color}
              strokeWidth={2}
            />
          );
        })}

        {/* 3. Outgoing lines downwards (from node centerY=14 down to y=ROW_HEIGHT) */}
        {rowInfo.outgoingCols.map((outCol) => {
          const toX = laneX(outCol);
          // Use destination lane color for divergent branch lines, nodeColor for continuation
          const color =
            outCol === nodeCol
              ? nodeColor
              : LANE_COLORS[outCol % LANE_COLORS.length];

          if (outCol === nodeCol) {
            // Straight vertical line downwards to next row
            return (
              <line
                key={`out-${outCol}`}
                x1={nodeX}
                y1={centerY}
                x2={nodeX}
                y2={ROW_HEIGHT}
                stroke={color}
                strokeWidth={2}
              />
            );
          }

          // Smooth branch/merge curve from node to lower column
          // Tangents are strictly vertical at both endpoints (no arches, no backward bends)
          return (
            <path
              key={`out-${outCol}`}
              d={`M ${nodeX} ${centerY} C ${nodeX} 21, ${toX} 21, ${toX} ${ROW_HEIGHT}`}
              fill="none"
              stroke={color}
              strokeWidth={2}
            />
          );
        })}

        {/* 4. Commit Node Circle */}
        <circle
          cx={nodeX}
          cy={centerY}
          r={RADIUS}
          fill={nodeColor}
          stroke="var(--color-surface)"
          strokeWidth={1.5}
        />
      </svg>
    );
  }

  // Fallback mode if rowInfo is not provided
  const nodeX = laneX(col);
  const nodeColor = LANE_COLORS[col % LANE_COLORS.length];

  return (
    <svg
      width={width}
      height={ROW_HEIGHT}
      className="shrink-0 overflow-visible"
      style={{ minWidth: `${width}px` }}
    >
      {/* Top entry into node */}
      <line
        x1={nodeX}
        y1={0}
        x2={nodeX}
        y2={centerY}
        stroke={nodeColor}
        strokeWidth={2}
      />

      {/* Downward edges */}
      {edges.map((edge, i) => {
        const fromX = laneX(edge.from_col);
        const toX = laneX(edge.to_col);
        const color =
          edge.from_col === edge.to_col
            ? nodeColor
            : LANE_COLORS[edge.to_col % LANE_COLORS.length];

        if (edge.from_col === edge.to_col) {
          return (
            <line
              key={i}
              x1={fromX}
              y1={centerY}
              x2={fromX}
              y2={ROW_HEIGHT}
              stroke={color}
              strokeWidth={2}
            />
          );
        }

        return (
          <path
            key={i}
            d={`M ${fromX} ${centerY} C ${fromX} 21, ${toX} 21, ${toX} ${ROW_HEIGHT}`}
            fill="none"
            stroke={color}
            strokeWidth={2}
          />
        );
      })}

      <circle
        cx={nodeX}
        cy={centerY}
        r={RADIUS}
        fill={nodeColor}
        stroke="var(--color-surface)"
        strokeWidth={1.5}
      />
    </svg>
  );
}
export { LANE_COLORS };
