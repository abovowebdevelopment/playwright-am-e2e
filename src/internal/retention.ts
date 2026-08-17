import fs from 'node:fs';
import path from 'node:path';
import { RUN_ID_PATTERN } from './run-id';

export const DEFAULT_KEEP_RUNS = 3;

/**
 * Prunes old run directories under `test-results/`, keeping the newest
 * `keepRuns` by name (run ids sort lexicographically = chronologically, which
 * is more robust than relying on mtime).
 *
 * Safety guardrails, non-negotiable:
 * - only deletes direct children of `testResultsDir`
 * - only deletes entries whose name matches the run-id pattern exactly
 * - only deletes entries that are real directories, never symlinks
 *   (`fs.readdirSync(..., { withFileTypes: true })` reports a symlink's own
 *   type, not its target's, so a symlink-to-directory fails `isDirectory()`
 *   and is skipped; the `lstatSync` re-check below is defense in depth)
 * - never deletes `currentRunId`, even if it were somehow not the newest
 *
 * Returns the number of directories removed.
 */
export function pruneOldRuns(testResultsDir: string, currentRunId: string, keepRuns: number): number {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(testResultsDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 0;
    }
    throw error;
  }

  const runDirNames = entries
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && RUN_ID_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  // The current run counts against the budget even though its directory does
  // not exist yet: this runs as Playwright's globalSetup, before the reporters
  // and outputDir create `test-results/<currentRunId>/`. Without counting it,
  // the budget is spent entirely on previous runs and the current one then
  // adds itself on top, leaving `keepRuns + 1` directories after every run.
  const budgeted = runDirNames.includes(currentRunId)
    ? runDirNames
    : [...runDirNames, currentRunId].sort();

  const keepCount = Math.max(1, keepRuns);
  const toDelete = budgeted
    .slice(0, Math.max(0, budgeted.length - keepCount))
    .filter((name) => name !== currentRunId);

  for (const name of toDelete) {
    const target = path.join(testResultsDir, name);

    // Re-check right before deleting: direct child, name still matches the
    // pattern, still a real directory, not a symlink.
    if (path.dirname(target) !== testResultsDir || !RUN_ID_PATTERN.test(name)) {
      continue;
    }
    const stat = fs.lstatSync(target);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      continue;
    }

    fs.rmSync(target, { recursive: true, force: true });
  }

  if (toDelete.length > 0) {
    console.log(
      `[playwright-am-e2e] retention: removed ${toDelete.length} old run ` +
        `director${toDelete.length === 1 ? 'y' : 'ies'} under ${testResultsDir}, keeping ${keepCount}.`,
    );
  }

  return toDelete.length;
}

function resolveKeepRuns(): number {
  const raw = process.env.E2E_KEEP_RUNS;
  if (!raw) {
    return DEFAULT_KEEP_RUNS;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_KEEP_RUNS;
}

/**
 * Playwright `globalSetup` entry point. Runs exactly once per run, in the
 * main process, before any worker starts — never per worker.
 *
 * Reads `E2E_TEST_RESULTS_DIR` and `E2E_RUN_ID`, both written by
 * `defineE2EConfig()` earlier in this same process. Both are expected to be
 * set; if either is missing (a caller invoking this module directly rather
 * than through `defineE2EConfig()`), retention is skipped rather than
 * guessing at a directory to prune.
 */
export default async function globalSetup(): Promise<void> {
  const testResultsDir = process.env.E2E_TEST_RESULTS_DIR;
  const currentRunId = process.env.E2E_RUN_ID;

  if (!testResultsDir || !currentRunId) {
    return;
  }

  pruneOldRuns(testResultsDir, currentRunId, resolveKeepRuns());
}
