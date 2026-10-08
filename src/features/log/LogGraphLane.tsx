import type { GraphEdge } from "../../lib/host";

interface LogGraphLaneProps {
  col: number;
  edges: GraphEdge[];
  maxCol: number;
}

const LANE_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#06b6d4", // cyan
];

const COL_WIDTH = 14;
const ROW_HEIGHT = 28;
const RADIUS = 4;

export function LogGraphLane({ col, edges, maxCol }: LogGraphLaneProps) {
  const width = Math.max(1, maxCol + 1) * COL_WIDTH + 8;
  const centerY = ROW_HEIGHT / 2;
  const nodeX = col * COL_WIDTH + COL_WIDTH / 2;
  const nodeColor = LANE_COLORS[col % LANE_COLORS.length];

  return (
    <svg
      width={width}
      height={ROW_HEIGHT}
      className="shrink-0 overflow-visible"
      style={{ minWidth: `${width}px` }}
    >
      {/* Edges from this row to target rows */}
      {edges.map((edge, i) => {
        const fromX = edge.from_col * COL_WIDTH + COL_WIDTH / 2;
        const toX = edge.to_col * COL_WIDTH + COL_WIDTH / 2;
        const color = LANE_COLORS[edge.from_col % LANE_COLORS.length];

        if (edge.from_col === edge.to_col) {
          // Straight vertical lane downwards
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

        // Curved line to parent in another column
        return (
          <path
            key={i}
            d={`M ${fromX} ${centerY} C ${fromX} ${ROW_HEIGHT}, ${toX} ${centerY}, ${toX} ${ROW_HEIGHT}`}
            fill="none"
            stroke={color}
            strokeWidth={2}
          />
        );
      })}

      {/* Commit Node Circle */}
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
