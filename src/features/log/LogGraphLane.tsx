import type { GraphEdge } from "../../lib/host";

interface LogGraphLaneProps {
  col: number;
  edges: GraphEdge[];
  maxCol: number;
  inCols?: number[];
  outCols?: number[];
  passThroughCols?: number[];
  isOutgoing?: boolean;
  isSelected?: boolean;
}

const LANE_COLORS = [
  "#3B82F6", // 经典蓝
  "#10B981", // 翡翠绿
  "#F59E0B", // 琥珀黄
  "#8B5CF6", // 优雅紫
  "#EC4899", // 玫瑰粉
  "#06B6D4", // 湖水青
  "#F97316", // 活力橙
  "#6366F1", // 靛蓝
];

const COL_WIDTH = 14;
const ROW_HEIGHT = 28;
const RADIUS = 4.5;

export function LogGraphLane({
  col,
  edges,
  maxCol,
  inCols,
  outCols,
  passThroughCols,
  isOutgoing = false,
  isSelected = false,
}: LogGraphLaneProps) {
  const effectiveMaxCol = Math.max(
    maxCol,
    col,
    ...(inCols ?? []),
    ...(outCols ?? []),
    ...(passThroughCols ?? [])
  );
  const width = Math.max(1, effectiveMaxCol + 1) * COL_WIDTH + 8;
  const centerY = ROW_HEIGHT / 2;
  const nodeX = col * COL_WIDTH + COL_WIDTH / 2;
  const nodeColor = LANE_COLORS[col % LANE_COLORS.length];

  // Resolve target columns from props or fallback to edges
  const resolvedOutCols =
    outCols && outCols.length > 0
      ? outCols
      : edges.length > 0
      ? edges.map((e) => e.to_col)
      : [col];

  const resolvedInCols = inCols && inCols.length > 0 ? inCols : [col];
  const resolvedPassThroughCols = passThroughCols ?? [];

  return (
    <svg
      width={width}
      height={ROW_HEIGHT}
      className="shrink-0 overflow-visible"
      style={{ minWidth: `${width}px` }}
    >
      {/* 1. Pass-through Lanes (Continuous straight lines through this row) */}
      {resolvedPassThroughCols.map((pCol) => {
        if (pCol === col) return null;
        const pX = pCol * COL_WIDTH + COL_WIDTH / 2;
        const color = LANE_COLORS[pCol % LANE_COLORS.length];
        return (
          <line
            key={`pass-${pCol}`}
            x1={pX}
            y1={0}
            x2={pX}
            y2={ROW_HEIGHT}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
        );
      })}

      {/* 2. In-edges (Connecting from previous row top to this commit node) */}
      {resolvedInCols.map((inCol, idx) => {
        const fromX = inCol * COL_WIDTH + COL_WIDTH / 2;
        const color = LANE_COLORS[inCol % LANE_COLORS.length];

        if (inCol === col) {
          // Direct straight vertical in-line
          return (
            <line
              key={`in-${idx}`}
              x1={fromX}
              y1={0}
              x2={nodeX}
              y2={centerY}
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
            />
          );
        }

        // Smooth curve coming in from another lane
        const dy = centerY;
        return (
          <path
            key={`in-curve-${idx}`}
            d={`M ${fromX} 0 C ${fromX} ${dy * 0.5}, ${nodeX} ${dy * 0.5}, ${nodeX} ${centerY}`}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
        );
      })}

      {/* 3. Out-edges (Connecting from this commit node to bottom/next row) */}
      {resolvedOutCols.map((toCol, idx) => {
        const toX = toCol * COL_WIDTH + COL_WIDTH / 2;
        const color = LANE_COLORS[col % LANE_COLORS.length];

        if (toCol === col) {
          // Direct straight line downwards
          return (
            <line
              key={`out-${idx}`}
              x1={nodeX}
              y1={centerY}
              x2={toX}
              y2={ROW_HEIGHT}
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
            />
          );
        }

        // Smooth S-curve to target lane
        const dy = ROW_HEIGHT - centerY;
        const cp1Y = centerY + dy * 0.5;
        const cp2Y = ROW_HEIGHT - dy * 0.5;
        return (
          <path
            key={`out-curve-${idx}`}
            d={`M ${nodeX} ${centerY} C ${nodeX} ${cp1Y}, ${toX} ${cp2Y}, ${toX} ${ROW_HEIGHT}`}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
        );
      })}

      {/* 4. Selection Halo / Glow */}
      {isSelected && (
        <circle
          cx={nodeX}
          cy={centerY}
          r={RADIUS + 3}
          fill={nodeColor}
          opacity={0.25}
        />
      )}

      {/* 5. Commit Node Circle */}
      {isOutgoing ? (
        // Outgoing (Unpushed) Node: Hollow ring with high-contrast dot
        <g>
          <circle
            cx={nodeX}
            cy={centerY}
            r={RADIUS + 0.5}
            fill="var(--color-surface)"
            stroke={nodeColor}
            strokeWidth={2}
          />
          <circle
            cx={nodeX}
            cy={centerY}
            r={RADIUS - 2}
            fill={nodeColor}
          />
        </g>
      ) : (
        // Normal Node Circle
        <circle
          cx={nodeX}
          cy={centerY}
          r={RADIUS}
          fill={nodeColor}
          stroke="var(--color-surface)"
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
}
