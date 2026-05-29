export type RiskLevel = "critical" | "high" | "medium" | "low";

export interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  rawUrl?: string;
}

export interface PullRequestContext {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  author: string;
  baseRef: string;
  headRef: string;
  baseSha: string;
  headSha: string;
  commits: string[];
  files: ChangedFile[];
}

export interface ReviewPolicy {
  ignorePaths: string[];
  maxInlineComments?: number;
  minInlineConfidence?: number;
  maxDiffChars?: number;
  reviewInstructions?: string[];
}

export interface ReviewOptions {
  mode: "report" | "inline" | "all";
  maxInlineComments: number;
  minInlineConfidence: number;
  maxDiffChars: number;
  policy: ReviewPolicy;
}

export interface RiskFinding {
  title: string;
  severity: RiskLevel;
  confidence: number;
  file: string;
  line?: number | null;
  evidence: string;
  impact: string;
  recommendation: string;
}

export interface InlineSuggestion {
  file: string;
  line: number;
  severity: RiskLevel;
  confidence: number;
  body: string;
}

export interface ReviewReport {
  summary: string;
  changeType: string;
  riskLevel: RiskLevel;
  keyChanges: string[];
  riskFindings: RiskFinding[];
  reviewSuggestions: string[];
  testSuggestions: string[];
  inlineSuggestions: InlineSuggestion[];
}

export interface DiffIndex {
  addedLinesByFile: Map<string, Set<number>>;
}

export interface AnalysisResult {
  report: ReviewReport;
  durationMs: number;
  skippedFiles: string[];
  scannedFiles: number;
  options: ReviewOptions;
}
