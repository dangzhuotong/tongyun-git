import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { LogGraphLane } from "./LogGraphLane";

describe("LogGraphLane component", () => {
  it("renders node circle and pass-through lanes smoothly", () => {
    const { container } = render(
      <LogGraphLane
        col={1}
        edges={[{ from_col: 1, to_col: 1 }]}
        maxCol={2}
        inCols={[1]}
        outCols={[1]}
        passThroughCols={[0]}
      />
    );

    const svg = container.querySelector("svg");
    expect(svg).toBeDefined();

    // Check pass-through line on col 0
    const lines = container.querySelectorAll("line");
    expect(lines.length).toBeGreaterThanOrEqual(2); // pass-through + in-line + out-line
  });

  it("renders S-curve path when transitioning to another column", () => {
    const { container } = render(
      <LogGraphLane
        col={0}
        edges={[{ from_col: 0, to_col: 2 }]}
        maxCol={2}
        outCols={[2]}
      />
    );

    const path = container.querySelector("path");
    expect(path).toBeDefined();
    const d = path?.getAttribute("d");
    expect(d).toContain("C"); // Bezier curve command
  });

  it("renders distinctive double-ring marker for unpushed (outgoing) commits", () => {
    const { container } = render(
      <LogGraphLane
        col={0}
        edges={[]}
        maxCol={0}
        isOutgoing={true}
      />
    );

    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(2); // outer ring + inner dot
  });
});
