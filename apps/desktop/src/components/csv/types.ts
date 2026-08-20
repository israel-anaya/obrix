import type { ReactNode } from "react";

export type CsvPolicy = "partial" | "strict";
export type CsvMode = "import" | "export";

export interface CsvColumn {
  name: string;
  required: boolean;
}

export interface CsvIssue {
  message: string;
  group?: string;
}

export interface CsvPreview {
  ready: number;
  skipped: number;
  issues: CsvIssue[];
  warnings: string[];
  /** If set, cannot continue (missing columns, empty file, etc.). */
  fatal?: string;
  /** Already-parsed data that `run` reuses. */
  payload?: unknown;
}

export interface CsvProgress {
  current: number;
  total: number | null;
  message: string;
}

export interface CsvResult {
  created: number;
  updated: number;
  skipped: number;
  issues: CsvIssue[];
  warnings: string[];
  /** Path of the file written (export or report). */
  path?: string;
}

export interface CsvExecutionContext {
  content: string;
  path: string | null;
  preview: CsvPreview;
  extra: Record<string, unknown>;
}

export interface CsvExtraFieldsProps {
  extra: Record<string, unknown>;
  setExtra: (patch: Record<string, unknown>) => void;
  preview: CsvPreview;
}

export interface CsvAdapter {
  title: string;
  mode: CsvMode;
  columns: CsvColumn[];
  policy: CsvPolicy;
  template?: () => string;
  defaultFile?: string;
  runningMessage?: string;
  confirmLabel?: string;
  /** Import: reads the file and builds row counts / errors. */
  preview?: (content: string) => CsvPreview | Promise<CsvPreview>;
  /** Export: counts with no input file. */
  previewExport?: () => CsvPreview | Promise<CsvPreview>;
  extraFields?: (props: CsvExtraFieldsProps) => ReactNode;
  /** `null` if the extras are ready; otherwise a message to disable Continue. */
  extraReady?: (extra: Record<string, unknown>, preview: CsvPreview) => string | null;
  run: (
    ctx: CsvExecutionContext,
    onProgress: (p: CsvProgress) => void,
  ) => Promise<CsvResult>;
}

export function emptyResult(): CsvResult {
  return { created: 0, updated: 0, skipped: 0, issues: [], warnings: [] };
}

export function issuesFromTexts(texts: string[], group?: string): CsvIssue[] {
  return texts.map((message) => (group ? { message, group } : { message }));
}

/** The user closed the destination picker — not a failure, goes back to review. */
export class CsvCancelled extends Error {
  constructor() {
    super("cancelled");
    this.name = "CsvCancelled";
  }
}
