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

  it("accepts the second hunk when the first side contains an opening marker", () => {
    const content = [
      "<<<<<<< HEAD",
      "ours-a",
      "<<<<<<< inner",
      "still-a",
      "=======",
      "theirs-a",
      ">>>>>>> a",
      "<<<<<<< HEAD",
      "ours-b",
      "=======",
      "theirs-b",
      ">>>>>>> b",
      "tail",
    ].join("\n");

    const result = applyConflictHunk(content, 1, ["ours-b"]);

    expect(result).toBe(
      [
        "<<<<<<< HEAD",
        "ours-a",
        "<<<<<<< inner",
        "still-a",
        "=======",
        "theirs-a",
        ">>>>>>> a",
        "ours-b",
        "tail",
      ].join("\n"),
    );
  });

  it("accepts the first hunk and leaves the next hunk in place", () => {
    const content = [
      "<<<<<<< HEAD",
      "ours-a",
      "<<<<<<< inner",
      "still-a",
      "=======",
      "theirs-a",
      ">>>>>>> a",
      "<<<<<<< HEAD",
      "ours-b",
      "=======",
      "theirs-b",
      ">>>>>>> b",
    ].join("\n");

    const result = applyConflictHunk(content, 0, ["ours-a", "<<<<<<< inner", "still-a"]);

    expect(result).toBe(
      [
        "ours-a",
        "<<<<<<< inner",
        "still-a",
        "<<<<<<< HEAD",
        "ours-b",
        "=======",
        "theirs-b",
        ">>>>>>> b",
      ].join("\n"),
    );
  });

  it("treats a diff3 base marker as unresolved and ignores a longer one", () => {
    expect(hasUnresolvedConflictMarkers("<<<<<<< HEAD\n||||||| base\n=======\n>>>>>>> branch")).toBe(
      true,
    );
    expect(hasUnresolvedConflictMarkers("keep\n||||||||\n")).toBe(false);
  });

  it("treats markers with a trailing carriage return as conflict markers", () => {
    const content = [
      "<<<<<<< HEAD\r",
      "ours\r",
      "||||||| base\r",
      "ancestor\r",
      "=======\r",
      "theirs\r",
      ">>>>>>> branch\r",
      "after\r",
    ].join("\n");

    expect(hasUnresolvedConflictMarkers(content)).toBe(true);
    expect(hasUnresolvedConflictMarkers("<<<<<<<\r")).toBe(true);
    expect(hasUnresolvedConflictMarkers("|||||||\r")).toBe(true);
    expect(applyConflictHunk(content, 0, ["ours"])).toBe("ours\nafter\r");
  });
});
