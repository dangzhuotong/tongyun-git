/**
 * Replace one conflict hunk in the worktree text with the chosen side.
 * Marker detection matches Git: exactly seven marker characters, then end or whitespace.
 * Longer lookalikes (`========`, `<<<<<<<<`) are file content.
 */
export function isGitConflictMarker(line: string, token: string): boolean {
  if (!line.startsWith(token)) return false;
  const rest = line.slice(token.length);
  return rest.length === 0 || rest[0] === " " || rest[0] === "\t";
}

export function hasUnresolvedConflictMarkers(content: string): boolean {
  return content.split("\n").some(
    (line) =>
      isGitConflictMarker(line, "<<<<<<<") ||
      isGitConflictMarker(line, "=======") ||
      isGitConflictMarker(line, ">>>>>>>"),
  );
}

export function applyConflictHunk(
  content: string,
  hunkIndex: number,
  replacementLines: string[],
): string {
  const replacement = replacementLines.join("\n");
  const lines = content.split("\n");
  let inTargetHunk = false;
  let targetHunkCount = 0;
  const newLines: string[] = [];

  for (const line of lines) {
    // Once the chosen hunk is open, skip until its closer. Content that
    // looks like `<<<<<<<` is already inside `replacement`.
    if (inTargetHunk) {
      if (isGitConflictMarker(line, ">>>>>>>")) {
        inTargetHunk = false;
      }
      continue;
    }
    if (isGitConflictMarker(line, "<<<<<<<")) {
      if (targetHunkCount === hunkIndex) {
        inTargetHunk = true;
        if (replacement) {
          newLines.push(replacement);
        }
      } else {
        newLines.push(line);
      }
      targetHunkCount++;
    } else {
      newLines.push(line);
    }
  }

  return newLines.join("\n");
}
