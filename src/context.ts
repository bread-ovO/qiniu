import type { FileSnapshot } from "./types.js";

const TYPESCRIPT_EXTENSIONS = [".ts", ".tsx"];
const DEFAULT_RELATED_CONTEXT_CHARS = 20000;

export function inferRelatedContextPaths(changedPaths: string[]): string[] {
  const changed = new Set(changedPaths);
  const candidates: string[] = [];

  for (const path of changedPaths) {
    for (const candidate of inferCounterparts(path)) {
      if (!changed.has(candidate) && !candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }
  }

  return candidates;
}

function inferCounterparts(path: string): string[] {
  const extension = TYPESCRIPT_EXTENSIONS.find((entry) => path.endsWith(entry));
  if (!extension) {
    return [];
  }

  if (path.startsWith("src/")) {
    const withoutExtension = path.slice("src/".length, -extension.length);
    return [`test/${withoutExtension}.test${extension}`, `test/${withoutExtension}.spec${extension}`];
  }

  if (path.startsWith("test/")) {
    const withoutPrefix = path.slice("test/".length, -extension.length);
    const sourceBase = withoutPrefix.replace(/\.(test|spec)$/, "");
    return [`src/${sourceBase}${extension}`];
  }

  return [];
}

export function formatRelatedContextForModel(
  snapshots: FileSnapshot[] = [],
  maxChars = DEFAULT_RELATED_CONTEXT_CHARS
): string {
  let remaining = maxChars;
  const sections: string[] = [];

  for (const snapshot of snapshots) {
    if (remaining <= 0) {
      break;
    }

    const section = `--- ${snapshot.path}\n${snapshot.content}`;
    sections.push(section.slice(0, remaining));
    remaining -= section.length;
  }

  return sections.join("\n\n");
}
