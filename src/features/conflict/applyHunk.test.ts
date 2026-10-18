import { describe, expect, it } from "vitest";
import { applyConflictHunk, hasUnresolvedConflictMarkers } from "./applyHunk";

describe("applyConflictHunk", () => {
  it("does not duplicate a longer angle-bracket line inside the accepted side", () => {
    const content = [
      "<<<<<<< HEAD",
      "<<<<<<<< still ours",
      "ours",
      "=======",
      "theirs",
      ">>>>>>> branch",
      "after",
    ].join("\n");

    const result = applyConflictHunk(content, 0, ["<<<<<<<< still ours", "ours"]);

    expect(result).toBe("<<<<<<<< still ours\nours\nafter");
  });

  it("does not treat a longer equals rule as an unresolved conflict marker", () => {
    expect(hasUnresolvedConflictMarkers("title\n========\n")).toBe(false);
    expect(hasUnresolvedConflictMarkers("<<<<<<< HEAD\n=======\n>>>>>>> branch")).toBe(true);
  });
});
