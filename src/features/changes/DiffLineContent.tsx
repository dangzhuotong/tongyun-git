import React, { memo } from "react";
import type { HighlightToken } from "./highlighter";
import type { TextRange } from "./intraLineDiff";

interface DiffLineContentProps {
  tokens?: HighlightToken[];
  content: string;
  intraLineRanges?: TextRange[];
  isAdd?: boolean;
  isDel?: boolean;
}

export const DiffLineContent = memo(function DiffLineContent({
  tokens,
  content,
  intraLineRanges = [],
  isAdd,
  isDel,
}: DiffLineContentProps) {
  const effectiveTokens: HighlightToken[] =
    tokens && tokens.length > 0 ? tokens : [{ content }];

  if (intraLineRanges.length === 0) {
    return (
      <span className="whitespace-pre pl-1 pr-4">
        {effectiveTokens.map((tok, idx) => (
          <span
            key={idx}
            style={tok.color ? { color: tok.color } : undefined}
          >
            {tok.content}
          </span>
        ))}
      </span>
    );
  }

  const strongBgClass = isAdd
    ? "bg-[var(--color-diff-add-strong)] rounded-[2px]"
    : isDel
    ? "bg-[var(--color-diff-del-strong)] rounded-[2px]"
    : "";

  let charOffset = 0;
  const elements: React.ReactNode[] = [];

  effectiveTokens.forEach((tok, tokIdx) => {
    const tokStart = charOffset;
    const tokEnd = charOffset + tok.content.length;
    charOffset = tokEnd;

    // Find any ranges that overlap with this token
    const overlapping = intraLineRanges.filter(
      (r) => Math.max(tokStart, r.start) < Math.min(tokEnd, r.end)
    );

    if (overlapping.length === 0) {
      elements.push(
        <span
          key={`tok-${tokIdx}`}
          style={tok.color ? { color: tok.color } : undefined}
        >
          {tok.content}
        </span>
      );
      return;
    }

    const totalLocalLen = tok.content.length;
    const cutPoints = new Set<number>([0, totalLocalLen]);
    overlapping.forEach((r) => {
      const relStart = Math.max(0, r.start - tokStart);
      const relEnd = Math.min(totalLocalLen, r.end - tokStart);
      cutPoints.add(relStart);
      cutPoints.add(relEnd);
    });

    const sortedCuts = Array.from(cutPoints).sort((a, b) => a - b);

    for (let c = 0; c < sortedCuts.length - 1; c++) {
      const p1 = sortedCuts[c];
      const p2 = sortedCuts[c + 1];
      if (p1 === p2) continue;

      const sliceText = tok.content.slice(p1, p2);
      const absSliceStart = tokStart + p1;
      const absSliceEnd = tokStart + p2;

      const isInside = intraLineRanges.some(
        (r) => r.start <= absSliceStart && absSliceEnd <= r.end
      );

      elements.push(
        <span
          key={`tok-${tokIdx}-${c}`}
          style={tok.color ? { color: tok.color } : undefined}
          className={isInside ? strongBgClass : undefined}
        >
          {sliceText}
        </span>
      );
    }
  });

  return (
    <span className="whitespace-pre pl-1 pr-4">
      {elements}
    </span>
  );
});
