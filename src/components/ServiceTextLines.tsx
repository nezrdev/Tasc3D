import type { ReactNode } from "react";
type ServiceTextLinesProps = {
    lines: readonly string[];
    highlights: readonly string[];
};
function renderHighlights(text: string, highlights: readonly string[]) {
    if (highlights.length === 0)
        return text;
    const nodes: ReactNode[] = [];
    let cursor = 0;
    let key = 0;
    while (cursor < text.length) {
        let nextIndex = -1;
        let nextHighlight = "";
        highlights.forEach((highlight) => {
            const index = text.indexOf(highlight, cursor);
            if (index >= 0 && (nextIndex < 0 || index < nextIndex)) {
                nextIndex = index;
                nextHighlight = highlight;
            }
        });
        if (nextIndex < 0) {
            nodes.push(text.slice(cursor));
            break;
        }
        if (nextIndex > cursor)
            nodes.push(text.slice(cursor, nextIndex));
        nodes.push(<span className="services-story-accent" key={`${nextHighlight}-${key}`}>
        {nextHighlight}
      </span>);
        cursor = nextIndex + nextHighlight.length;
        key += 1;
    }
    return nodes;
}
export function ServiceTextLines({ lines, highlights, }: ServiceTextLinesProps) {
    return (<>
      {lines.map((line, index) => (<span className="services-story-line" key={line}>
          {renderHighlights(line, highlights)}
          {index < lines.length - 1 ? " " : null}
        </span>))}
    </>);
}
