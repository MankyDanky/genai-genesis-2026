import { diffLines } from "diff";

export interface DiffLine {
  type: "added" | "removed" | "context";
  html: string;
  oldLineNum: number | null;
  newLineNum: number | null;
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
  let oldLineNum = 1;
  let newLineNum = 1;

  for (const change of changes) {
    const count = change.count ?? 0;

    if (change.added) {
      for (let i = 0; i < count; i++) {
        result.push({
          type: "added",
          html: newHighlighted[newIdx++] ?? "",
          oldLineNum: null,
          newLineNum: newLineNum++,
        });
      }
    } else if (change.removed) {
      for (let i = 0; i < count; i++) {
        result.push({
          type: "removed",
          html: oldHighlighted[oldIdx++] ?? "",
          oldLineNum: oldLineNum++,
          newLineNum: null,
        });
      }
    } else {
      for (let i = 0; i < count; i++) {
        result.push({
          type: "context",
          html: oldHighlighted[oldIdx++] ?? "",
          oldLineNum: oldLineNum++,
          newLineNum: newLineNum++,
        });
        newIdx++;
      }
    }
  }

  return result;
}
