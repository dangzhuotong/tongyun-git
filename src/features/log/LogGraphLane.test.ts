import { createElement, type ComponentProps } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LANE_COLORS, COL_WIDTH, ROW_HEIGHT, RADIUS } from "./graphTopology";
import { LogGraphLane } from "./LogGraphLane";

type Props = ComponentProps<typeof LogGraphLane>;

function laneX(col: number): number {
  return col * COL_WIDTH + COL_WIDTH / 2;
}

function renderLane(props: Props) {
  const { container } = render(createElement(LogGraphLane, props));
  const svg = container.querySelector("svg");
  expect(svg).not.toBeNull();
  return {
    svg: svg as SVGSVGElement,
    lines: Array.from(svg!.querySelectorAll("line")),
    paths: Array.from(svg!.querySelectorAll("path")),
    circle: svg!.querySelector("circle"),
  };
}

function attr(el: Element, name: string): string | null {
  return el.getAttribute(name);
}

describe("LogGraphLane geometry", () => {
  it("places the fallback node on its column and sizes the row from maxCol", () => {
    const { svg, lines, paths, circle } = renderLane({ col: 2, maxCol: 3, edges: [] });
    const x = laneX(2);
    expect(attr(svg, "width")).toBe(String((3 + 1) * COL_WIDTH + 8));
    expect(attr(svg, "height")).toBe(String(ROW_HEIGHT));
    expect(svg.style.minWidth).toBe(`${(3 + 1) * COL_WIDTH + 8}px`);
    expect(paths).toHaveLength(0);
    expect(lines).toHaveLength(1);
    expect(attr(lines[0], "x1")).toBe(String(x));
    expect(attr(lines[0], "y1")).toBe("0");
    expect(attr(lines[0], "y2")).toBe(String(ROW_HEIGHT / 2));
    expect(attr(lines[0], "stroke")).toBe(LANE_COLORS[2]);
    expect(circle).not.toBeNull();
    expect(attr(circle!, "cx")).toBe(String(x));
    expect(attr(circle!, "cy")).toBe(String(ROW_HEIGHT / 2));
    expect(attr(circle!, "r")).toBe(String(RADIUS));
    expect(attr(circle!, "fill")).toBe(LANE_COLORS[2]);
  });

  it("draws a straight continuation when a fallback edge stays in one column", () => {
    const { lines, paths } = renderLane({
      col: 0,
      maxCol: 0,
      edges: [{ from_col: 0, to_col: 0 }],
    });
    expect(paths).toHaveLength(0);
    expect(lines).toHaveLength(2);
    const down = lines[1];
    expect(attr(down, "x1")).toBe(String(laneX(0)));
    expect(attr(down, "y1")).toBe(String(ROW_HEIGHT / 2));
    expect(attr(down, "x2")).toBe(String(laneX(0)));
    expect(attr(down, "y2")).toBe(String(ROW_HEIGHT));
    expect(attr(down, "stroke")).toBe(LANE_COLORS[0]);
  });

  it("draws a cubic branch when a fallback edge changes column", () => {
    const { paths } = renderLane({
      col: 0,
      maxCol: 1,
      edges: [{ from_col: 0, to_col: 1 }],
    });
    expect(paths).toHaveLength(1);
    expect(attr(paths[0], "d")).toBe(
      `M ${laneX(0)} ${ROW_HEIGHT / 2} C ${laneX(0)} 21, ${laneX(1)} 21, ${laneX(1)} ${ROW_HEIGHT}`,
    );
    expect(attr(paths[0], "stroke")).toBe(LANE_COLORS[1]);
    expect(attr(paths[0], "fill")).toBe("none");
  });

  it("wraps lane color and widens the row when the column index exceeds the palette", () => {
    const col = LANE_COLORS.length;
    const { svg, circle } = renderLane({ col, maxCol: col, edges: [] });
    expect(attr(circle!, "fill")).toBe(LANE_COLORS[0]);
    expect(attr(circle!, "cx")).toBe(String(laneX(col)));
    expect(attr(svg, "width")).toBe(String((col + 1) * COL_WIDTH + 8));
  });

  it("draws passing, incoming, and outgoing lanes from row topology", () => {
    const { svg, lines, paths, circle } = renderLane({
      maxCol: 0,
      rowInfo: {
        col: 0,
        passingLanes: [1],
        incomingCols: [0, 2],
        outgoingCols: [0, 1],
        maxCol: 2,
      },
    });
    expect(attr(svg, "width")).toBe(String((2 + 1) * COL_WIDTH + 8));
    expect(attr(circle!, "cx")).toBe(String(laneX(0)));
    expect(attr(circle!, "fill")).toBe(LANE_COLORS[0]);

    const lineDesc = lines.map((line) => ({
      x1: attr(line, "x1"),
      y1: attr(line, "y1"),
      x2: attr(line, "x2"),
      y2: attr(line, "y2"),
      stroke: attr(line, "stroke"),
    }));
    expect(lineDesc).toEqual([
      {
        x1: String(laneX(1)),
        y1: "0",
        x2: String(laneX(1)),
        y2: String(ROW_HEIGHT),
        stroke: LANE_COLORS[1],
      },
      {
        x1: String(laneX(0)),
        y1: "0",
        x2: String(laneX(0)),
        y2: String(ROW_HEIGHT / 2),
        stroke: LANE_COLORS[0],
      },
      {
        x1: String(laneX(0)),
        y1: String(ROW_HEIGHT / 2),
        x2: String(laneX(0)),
        y2: String(ROW_HEIGHT),
        stroke: LANE_COLORS[0],
      },
    ]);

    expect(paths.map((path) => attr(path, "d"))).toEqual([
      `M ${laneX(2)} 0 C ${laneX(2)} 7, ${laneX(0)} 7, ${laneX(0)} ${ROW_HEIGHT / 2}`,
      `M ${laneX(0)} ${ROW_HEIGHT / 2} C ${laneX(0)} 21, ${laneX(1)} 21, ${laneX(1)} ${ROW_HEIGHT}`,
    ]);
    expect(paths.map((path) => attr(path, "stroke"))).toEqual([LANE_COLORS[2], LANE_COLORS[1]]);
  });

  it("keeps the wider of the prop maxCol and the row maxCol", () => {
    const narrow = renderLane({
      maxCol: 5,
      rowInfo: { col: 0, passingLanes: [], incomingCols: [], outgoingCols: [], maxCol: 1 },
    });
    expect(attr(narrow.svg, "width")).toBe(String((5 + 1) * COL_WIDTH + 8));

    const wideRow = renderLane({
      maxCol: 1,
      rowInfo: { col: 0, passingLanes: [], incomingCols: [], outgoingCols: [], maxCol: 4 },
    });
    expect(attr(wideRow.svg, "width")).toBe(String((4 + 1) * COL_WIDTH + 8));
  });
});
