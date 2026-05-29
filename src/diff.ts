import type { ChangedFile, DiffIndex, InlineSuggestion } from "./types.js";

const GENERATED_FILE_PATTERNS = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)coverage\//,
  /\.min\.(js|css)$/,
  /\.snap$/
];

export function shouldSkipFile(filename: string): boolean {
  return GENERATED_FILE_PATTERNS.some((pattern) => pattern.test(filename));
}

export function buildDiffIndex(files: ChangedFile[]): DiffIndex {
  const addedLinesByFile = new Map<string, Set<number>>();

  for (const file of files) {
    const addedLines = new Set<number>();
    const patch = file.patch ?? "";
    let newLine = 0;
    let oldLine = 0;

    for (const line of patch.split("\n")) {
      const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (hunk) {
        oldLine = Number.parseInt(hunk[1], 10);
        newLine = Number.parseInt(hunk[2], 10);
        continue;
      }

      if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("\\ No newline")) {
        continue;
      }

      if (line.startsWith("+")) {
        addedLines.add(newLine);
        newLine += 1;
        continue;
      }

      if (line.startsWith("-")) {
        oldLine += 1;
        continue;
      }

      oldLine += 1;
      newLine += 1;
    }

    addedLinesByFile.set(file.filename, addedLines);
  }

  return { addedLinesByFile };
}

export function filterInlineSuggestions(
  suggestions: InlineSuggestion[],
  diffIndex: DiffIndex,
  maxInlineComments: number
): InlineSuggestion[] {
  return suggestions
    .filter((suggestion) => suggestion.confidence >= 0.75)
    .filter((suggestion) => diffIndex.addedLinesByFile.get(suggestion.file)?.has(suggestion.line))
    .sort((a, b) => severityScore(b.severity) - severityScore(a.severity) || b.confidence - a.confidence)
    .slice(0, maxInlineComments);
}

export function formatDiffForModel(files: ChangedFile[], maxChars: number): { content: string; skippedFiles: string[] } {
  const skippedFiles: string[] = [];
  let remaining = maxChars;
  const sections: string[] = [];

  for (const file of files) {
    if (shouldSkipFile(file.filename) || !file.patch) {
      skippedFiles.push(file.filename);
      continue;
    }

    const header = [
      `File: ${file.filename}`,
      `Status: ${file.status}`,
      `Additions: ${file.additions}`,
      `Deletions: ${file.deletions}`
    ].join("\n");
    const block = `${header}\nPatch:\n${file.patch}`;

    if (remaining <= 0) {
      skippedFiles.push(file.filename);
      continue;
    }

    const originalRemaining = remaining;
    sections.push(block.slice(0, originalRemaining));
    remaining -= block.length;

    if (block.length > originalRemaining) {
      skippedFiles.push(file.filename);
    }
  }

  return { content: sections.join("\n\n---\n\n"), skippedFiles };
}

function severityScore(severity: InlineSuggestion["severity"]): number {
  switch (severity) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
  }
}
