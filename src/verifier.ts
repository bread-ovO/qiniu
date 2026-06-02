import type { FileSnapshot } from "./types.js";

const SAFE_COMMAND_PREFIXES = ["npm ", "pnpm ", "yarn ", "npx "];
const DANGEROUS_COMMAND_PATTERNS = [/\brm\s+-rf\b/, /\|\s*(ba)?sh\b/, /&&\s*sudo\b/, /\bsudo\b/, />\s*\/dev\//];
const PREFERRED_NPM_SCRIPTS = ["test", "typecheck", "lint", "build"];

export function inferVerificationCommands(
  snapshots: FileSnapshot[],
  suggestedCommands: string[] = []
): string[] {
  const commands: string[] = [];

  for (const command of suggestedCommands) {
    addSafeCommand(commands, command);
  }

  const packageJson = snapshots.find((snapshot) => snapshot.path === "package.json");
  if (!packageJson) {
    return commands.slice(0, 6);
  }

  const scripts = parsePackageScripts(packageJson.content);
  for (const script of PREFERRED_NPM_SCRIPTS) {
    if (scripts.has(script)) {
      addSafeCommand(commands, script === "test" ? "npm test" : `npm run ${script}`);
    }
  }

  return commands.slice(0, 6);
}

function parsePackageScripts(content: string): Set<string> {
  try {
    const parsed = JSON.parse(content) as { scripts?: Record<string, unknown> };
    return new Set(Object.entries(parsed.scripts ?? {}).filter(([, value]) => typeof value === "string").map(([key]) => key));
  } catch {
    return new Set();
  }
}

function addSafeCommand(commands: string[], command: string): void {
  const normalized = command.trim();
  if (!normalized || commands.includes(normalized) || !isSafeVerificationCommand(normalized)) {
    return;
  }

  commands.push(normalized);
}

function isSafeVerificationCommand(command: string): boolean {
  return SAFE_COMMAND_PREFIXES.some((prefix) => command.startsWith(prefix)) &&
    !DANGEROUS_COMMAND_PATTERNS.some((pattern) => pattern.test(command));
}
