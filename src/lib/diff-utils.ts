import { diffLines } from "diff";

export interface DiffLine {
  type: "added" | "removed" | "context";
  html: string;
  lineNum: number;
}

export function computeHighlightedDiff(
  oldStr: string,
  newStr: string,
  highlightFn: (code: string) => string
): DiffLine[] {
  const oldHighlighted = highlightFn(oldStr).split("\n");
  const newHighlighted = highlightFn(newStr).split("\n");

  const changes = diffLines(oldStr, newStr);
  const result: DiffLine[] = [];
  let oldIdx = 0;
  let newIdx = 0;
  let lineNum = 1;

  for (const change of changes) {
    const count = change.count ?? 0;

    if (change.added) {
      for (let i = 0; i < count; i++) {
        result.push({
          type: "added",
          html: newHighlighted[newIdx++] ?? "",
          lineNum: lineNum++,
        });
      }
    } else if (change.removed) {
      for (let i = 0; i < count; i++) {
        result.push({
          type: "removed",
          html: oldHighlighted[oldIdx++] ?? "",
          lineNum: lineNum++,
        });
      }
    } else {
      for (let i = 0; i < count; i++) {
        result.push({
          type: "context",
          html: oldHighlighted[oldIdx++] ?? "",
          lineNum: lineNum++,
        });
        newIdx++;
      }
    }
  }

  return result;
}
