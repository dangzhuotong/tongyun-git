/**
 * Replace one conflict hunk in the worktree text with the chosen side.
 * Marker detection matches Git: exactly seven marker characters, then end or whitespace.
 * Longer lookalikes (`========`, `<<<<<<<<`) are file content.
 */
export function isGitConflictMarker(line: string, token: string): boolean {
  const normalized = line.endsWith("\r") ? line.slice(0, -1) : line;
  if (!normalized.startsWith(token)) return false;
  const rest = normalized.slice(token.length);
  return rest.length === 0 || rest[0] === " " || rest[0] === "\t";
}

export function hasUnresolvedConflictMarkers(content: string): boolean {
  return content.split("\n").some(
    (line) =>
      isGitConflictMarker(line, "<<<<<<<") ||
      isGitConflictMarker(line, "|||||||") ||
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
  let inConflict = false;
  let inTargetHunk = false;
  let hunkCount = 0;
  const newLines: string[] = [];

  for (const line of lines) {
    // Same rule as Rust `parse_conflict_hunks`: an opening marker only starts
    // a hunk. Inside a hunk, `<<<<<<<` is file content and does not increment.
    if (!inConflict && isGitConflictMarker(line, "<<<<<<<")) {
      if (hunkCount === hunkIndex) {
        inTargetHunk = true;
        if (replacement) {
          newLines.push(replacement);
        }
      } else {
        newLines.push(line);
      }
      hunkCount++;
      inConflict = true;
      continue;
    }
    if (inConflict && isGitConflictMarker(line, ">>>>>>>")) {
      inConflict = false;
      if (inTargetHunk) {
        inTargetHunk = false;
      } else {
        newLines.push(line);
      }
      continue;
    }
    if (!inTargetHunk) {
      newLines.push(line);
    }
  }

  return newLines.join("\n");
}
