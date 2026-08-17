const RUN_ID_ENV = 'E2E_RUN_ID';

/** `YYYYMMDD-HHMMSS` — lexicographic sort equals chronological sort. */
export const RUN_ID_PATTERN = /^\d{8}-\d{6}$/;

/**
 * Resolves the run id for this process.
 *
 * `bin/e2e` generates one (`date -u +%Y%m%d-%H%M%S`) and passes it as
 * `E2E_RUN_ID`, because the config module is loaded once per process — the
 * main process *and* every worker — so generating the id here would scatter a
 * single run across several directories, one per worker.
 *
 * For standalone use (`npx playwright test` without the wrapper) there is no
 * `E2E_RUN_ID` yet. The fallback below generates one and writes it back into
 * `process.env` *in the main process, at config load*, before Playwright
 * forks any workers. Node's `child_process.fork` (which is how Playwright
 * spawns workers) copies the parent's `process.env` at spawn time, so every
 * worker inherits the value this function just set, re-reads it via this same
 * function, and returns early without generating its own. Verified against
 * this package's own 2-worker suite: a `Math.random()` planted at config
 * module scope prints two different values in one run (proving the config is
 * indeed reloaded per worker), while an env var set here on first read is
 * identical across all workers of the same run.
 */
export function resolveRunId(): string {
  const existing = process.env[RUN_ID_ENV];
  if (existing) {
    return existing;
  }

  const generated = generateRunId();
  process.env[RUN_ID_ENV] = generated;
  return generated;
}

function generateRunId(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');

  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`
  );
}
