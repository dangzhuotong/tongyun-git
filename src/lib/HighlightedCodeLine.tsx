import React, { useMemo } from "react";
import type Prism from "prismjs";
import { tokenizeCode } from "./syntax";

function renderPrismTokens(
  tokens: (string | Prism.Token)[],
  keyPrefix = "tok"
): React.ReactNode {
  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (typeof token === "string") {
      return <span key={key}>{token}</span>;
    }
    const tokenType = token.type;
    const content = Array.isArray(token.content)
      ? renderPrismTokens(token.content, `${key}-${tokenType}`)
      : typeof token.content === "object" && token.content !== null
      ? renderPrismTokens([token.content as Prism.Token], `${key}-${tokenType}`)
      : token.content;

    return (
      <span key={key} className={`token ${tokenType}`}>
        {content}
      </span>
    );
  });
}

export function HighlightedCodeLine({
  content,
  language,
}: {
  content: string;
  language: string | null;
}) {
  const rendered = useMemo(() => {
    const tokens = tokenizeCode(content, language);
    if (tokens.length === 0) {
      return null;
    }
    return renderPrismTokens(tokens);
  }, [content, language]);

  return <>{rendered}</>;
}
