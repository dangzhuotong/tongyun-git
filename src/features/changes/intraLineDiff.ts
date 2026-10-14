export interface TextRange {
  start: number;
  end: number;
}

export interface IntraLineDiffResult {
  oldRanges: TextRange[];
  newRanges: TextRange[];
}

/**
 * Tokenize a line into words, numbers, punctuation and whitespace.
 * Supports Unicode/CJK characters.
 */
function tokenizeLine(text: string): string[] {
  const tokenRegex =
    /(\s+|[a-zA-Z0-9_]+|[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]|[^\s\w])/gu;
  return text.match(tokenRegex) || [];
}

/**
 * Compute word/segment level diff between an old line (deletion) and a new line (addition).
 * Returns precise character ranges of the changed regions for both lines.
 */
export function computeIntraLineDiff(
  oldStr: string,
  newStr: string
): IntraLineDiffResult {
  if (oldStr === newStr) {
    return { oldRanges: [], newRanges: [] };
  }

  // Guard against excessively long lines (e.g. minified code) to preserve interactive 60fps performance
  if (oldStr.length > 800 || newStr.length > 800) {
    return {
      oldRanges: oldStr.length > 0 ? [{ start: 0, end: oldStr.length }] : [],
      newRanges: newStr.length > 0 ? [{ start: 0, end: newStr.length }] : [],
    };
  }

  const oldTokens = tokenizeLine(oldStr);
  const newTokens = tokenizeLine(newStr);

  const m = oldTokens.length;
  const n = newTokens.length;

  if (m === 0 && n === 0) {
    return { oldRanges: [], newRanges: [] };
  }
  if (m === 0) {
    return { oldRanges: [], newRanges: [{ start: 0, end: newStr.length }] };
  }
  if (n === 0) {
    return { oldRanges: [{ start: 0, end: oldStr.length }], newRanges: [] };
  }

  // Dynamic programming LCS table
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (oldTokens[i] === newTokens[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack to find matched (unchanged) tokens
  let i = m;
  let j = n;
  const oldMatched = new Uint8Array(m);
  const newMatched = new Uint8Array(n);

  while (i > 0 && j > 0) {
    if (oldTokens[i - 1] === newTokens[j - 1]) {
      oldMatched[i - 1] = 1;
      newMatched[j - 1] = 1;
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  function extractRanges(tokens: string[], matched: Uint8Array): TextRange[] {
    const ranges: TextRange[] = [];
    let pos = 0;
    let rangeStart = -1;

    for (let idx = 0; idx < tokens.length; idx++) {
      const tok = tokens[idx];
      const len = tok.length;
      if (!matched[idx]) {
        if (rangeStart === -1) {
          rangeStart = pos;
        }
      } else {
        if (rangeStart !== -1) {
          ranges.push({ start: rangeStart, end: pos });
          rangeStart = -1;
        }
      }
      pos += len;
    }

    if (rangeStart !== -1) {
      ranges.push({ start: rangeStart, end: pos });
    }

    return ranges;
  }

  return {
    oldRanges: extractRanges(oldTokens, oldMatched),
    newRanges: extractRanges(newTokens, newMatched),
  };
}
