import path from 'node:path';
import { defineConfig } from '@playwright/test';
import type { PlaywrightTestConfig, ReporterDescription } from '@playwright/test';
import { resolveRunId } from './internal/run-id';

/**
 * The per-project Playwright config, in one place.
 *
 * `bin/e2e` runs the tests with the cwd set to tests/e2e/ and injects the
 * resolved site URL as E2E_BASE_URL, so a project's playwright.config.ts needs
 * nothing host-specific. Keeping that contract here means a change to how the
 * runner passes the URL is one package release rather than an edit in every
 * project repo.
 *
 * Every run gets its own directory, `test-results/<runId>/` (`runId` =
 * `E2E_RUN_ID`, or a generated fallback for standalone use — see
 * `./internal/run-id`), containing:
 *
 * - `artifacts/` — Playwright's `outputDir` (traces, videos, per-test dirs)
 * - `html-report/` — the HTML reporter, a *sibling* of `artifacts/`, because
 *   Playwright refuses an HTML report folder nested inside `outputDir`
 * - `screenshots/` — the screenshot fixture's relative-path target
 * - `results.json` — Playwright's JSON reporter output
 * - `summary.json` — a compact machine-readable summary (see
 *   `./summary-reporter`)
 *
 * Old run directories are pruned automatically, keeping the newest
 * `E2E_KEEP_RUNS` (default 3) by name — see
 * `./internal/retention`, wired in below as `globalSetup` so it runs once per
 * run, in the main process, never per worker.
 *
 * `overrides` is merged shallowly, except `use`, which is merged one level
 * deeper so a project can add options without losing baseURL. `outputDir`,
 * `reporter`, and `globalSetup` are full overrides when supplied — a caller
 * that sets one of them opts out of the corresponding default entirely.
 */
export function defineE2EConfig(overrides: PlaywrightTestConfig = {}): PlaywrightTestConfig {
  const { use, reporter, outputDir, globalSetup, ...rest } = overrides;

  const runId = resolveRunId();
  const testResultsDir = path.resolve(process.cwd(), 'test-results');
  const runDir = path.join(testResultsDir, runId);

  // Read by ./internal/retention's globalSetup, in this same main process.
  process.env.E2E_TEST_RESULTS_DIR = testResultsDir;

  const defaultReporters: ReporterDescription[] = [
    ['list'],
    ['json', { outputFile: path.join(runDir, 'results.json') }],
    ['html', { outputFolder: path.join(runDir, 'html-report'), open: 'never' }],
    [
      '@abovomaxlead/playwright-am-e2e/summary-reporter',
      { outputFile: path.join(runDir, 'summary.json') },
    ],
  ];

  return defineConfig({
    testDir: '.',
    ...rest,
    globalSetup: globalSetup ?? require.resolve('./internal/retention'),
    outputDir: outputDir ?? path.join(runDir, 'artifacts'),
    reporter: reporter ?? defaultReporters,
    use: {
      baseURL: process.env.E2E_BASE_URL,
      ...use,
    },
  });
}
