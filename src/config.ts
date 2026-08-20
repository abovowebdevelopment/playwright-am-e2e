import path from 'node:path';
import { defineConfig } from '@playwright/test';
import type { PlaywrightTestConfig, ReporterDescription } from '@playwright/test';
import { resolveRunId } from './internal/run-id';
import { readTargetsFile, resolveTargets, targetSelection } from './internal/targets';

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
 *
 * TEST SELECTION AND TARGETS
 * --------------------------
 * This helper owns test selection. It emits one Playwright *project* per
 * target, each with its own `use.baseURL` and its own `grep`/`grepInvert`
 * built from `E2E_ENV_TAG` — so `bin/e2e` passes no `--grep` at all.
 *
 * Targets come from `e2e.targets.json` next to this config (see
 * `./internal/targets`), which declares a project's sites per environment: the
 * extra sites of a multisite, and the production URLs, which cannot be derived
 * from `.webconfig.env`. Every target of the current environment then runs in
 * a single run — one report, one exit code, in parallel — instead of one
 * `e2e` invocation per URL.
 *
 * Without that file, without an entry for the current environment, or with
 * `E2E_TARGETS=off` (which `bin/e2e` sets for an explicit `--url`), there is
 * exactly one target: the resolved base URL, running `@<env>|@all` minus every
 * `@custom-*` test.
 *
 * A caller that passes its own `projects` keeps them untouched — declaring
 * projects by hand opts out of this entirely, and then owns selection too.
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

  const baseURL = process.env.E2E_BASE_URL;
  const projects = rest.projects ?? resolveProjects(baseURL, use);
  announceTargets(projects);

  return defineConfig({
    // Specs live in specs/, so the directory listing keeps config
    // (package.json, playwright.config.ts, e2e.targets.json) apart from the
    // tests instead of interleaving them alphabetically. `bin/e2e` checks the
    // directory exists and explains the move if it does not.
    testDir: 'specs',
    ...rest,
    projects,
    globalSetup: globalSetup ?? require.resolve('./internal/retention'),
    outputDir: outputDir ?? path.join(runDir, 'artifacts'),
    reporter: reporter ?? defaultReporters,
    use: {
      baseURL,
      ...use,
    },
  });
}

/**
 * Prints which URL each target is pointed at, so the `[name]` prefixes in the
 * run and `--list` output can be read without opening the targets file.
 *
 * Printed from here rather than from `globalSetup` because `--list` skips
 * global setup, and from the main process only: this config module is loaded
 * again in every worker, which would otherwise repeat the banner. A single
 * unnamed target is skipped — `bin/e2e` already prints that URL on its own.
 */
function announceTargets(projects: PlaywrightTestConfig['projects']): void {
  if (process.env.TEST_WORKER_INDEX !== undefined || !projects) {
    return;
  }

  const selected = selectedProjectNames();
  const urlOf = (project: (typeof projects)[number]) =>
    (project.use as { baseURL?: string } | undefined)?.baseURL;

  // A single unnamed target: the URL alone. No arrow — it would point out of
  // nothing, since there is no label on the left of it.
  if (projects.length === 1 && (projects[0]!.name ?? '') === '') {
    const url = urlOf(projects[0]!);
    if (url) {
      console.log(colour(`  ${url}`, GREEN));
    }
    return;
  }

  const named = projects.filter((project) => (project.name ?? '') !== '');
  if (named.length === 0) {
    return;
  }

  const width = Math.max(...named.map((project) => (project.name ?? '').length));

  for (const project of named) {
    const name = project.name ?? '';
    const url = urlOf(project) ?? '(no base URL)';
    const tags = (project.metadata as { targetTags?: string[] } | undefined)?.targetTags ?? [];
    const willRun = selected === undefined || selected.has(name);

    const line =
      `  ${name.padEnd(width)}  →  ${url}` +
      (tags.length > 0 ? `   ${tags.join(' ')}` : '') +
      (willRun ? '' : '   (skipped)');

    console.log(willRun ? colour(line, GREEN) : colour(line, DIM));
  }
}

const GREEN = '32';
const DIM = '2';
const RED = '31';

/**
 * Reports a configuration problem and ends the process.
 *
 * `process.exit` rather than `throw`: this runs while Playwright is requiring
 * the config, so a throw is rendered as a Node module-load stack trace with the
 * useful line buried at the top of it.
 */
function fail(message: string): never {
  const [first, ...rest] = message.split('\n');
  console.error(colour(`\n❌ ${first}`, RED));
  for (const line of rest) {
    console.error(colour(`   ${line}`, RED));
  }
  console.error('');
  process.exit(1);
}

/** Colour only when the terminal (or bin/e2e's FORCE_COLOR) asks for it. */
function colour(text: string, code: string): string {
  const wanted =
    !process.env.NO_COLOR && (process.env.FORCE_COLOR !== undefined || process.stdout.isTTY);
  return wanted ? `\u001b[${code}m${text}\u001b[0m` : text;
}

/**
 * The project names Playwright was asked to run, or `undefined` when it was
 * not filtered — read from argv because the banner is printed while the config
 * is still being built, before Playwright has resolved anything.
 *
 * Handles both `--project=nl` and the variadic `--project nl be` form.
 */
function selectedProjectNames(): Set<string> | undefined {
  const argv = process.argv;
  const names = new Set<string>();

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;

    if (arg.startsWith('--project=')) {
      names.add(arg.slice('--project='.length));
      continue;
    }

    if (arg === '--project') {
      // Variadic: consume values until the next flag.
      for (let next = index + 1; next < argv.length && !argv[next]!.startsWith('-'); next++) {
        names.add(argv[next]!);
      }
    }
  }

  return names.size > 0 ? names : undefined;
}

/**
 * Builds one Playwright project per target.
 *
 * Always returns at least one project: selection lives here, so returning
 * nothing would run every test in the suite, unfiltered, against one URL.
 *
 * The single-target fallback is left *unnamed* so its screenshots land
 * directly in `<run>/screenshots/`; a multi-target run names its projects and
 * the screenshot fixture gives each one a subdirectory.
 */
function resolveProjects(
  baseURL: string | undefined,
  use: PlaywrightTestConfig['use'],
): PlaywrightTestConfig['projects'] {
  const envTag = process.env.E2E_ENV_TAG ?? process.env.AM_DEV_INFRA_ENV;
  if (envTag === undefined || envTag === '') {
    throw new Error(
      `Cannot select tests: neither E2E_ENV_TAG nor AM_DEV_INFRA_ENV is set, so ` +
        `the environment tag to grep for is unknown. Run the tests with \`e2e\`, ` +
        `which sets them, or set E2E_ENV_TAG (e.g. "dev") yourself.`,
    );
  }

  // An explicit --url is an escape hatch and must not be replaced by the
  // declared targets; bin/e2e signals that with E2E_TARGETS=off.
  //
  // Config problems are reported and the process ended here, rather than thrown:
  // a throw out of a config module makes Playwright print ~30 lines of Node
  // require() stack, which buries the one line that says what to fix. The pure
  // functions still throw (that is what the package's tests assert on); this is
  // the boundary that turns a throw into a legible message.
  let file: Record<string, unknown> | undefined;
  let targets: ReturnType<typeof resolveTargets>;
  try {
    file = process.env.E2E_TARGETS === 'off' ? undefined : readTargetsFile(process.cwd());
    targets = file ? resolveTargets(file, envTag, baseURL) : undefined;
  } catch (error) {
    fail((error as Error).message);
  }

  // The lone fallback target stays unnamed on purpose: a single site needs no
  // label, and inventing one would prefix every line with [name] and push
  // screenshots into a subdirectory for no benefit. Its URL is still announced
  // (see announceTargets), which is the part that matters.
  const resolved = targets ?? [{ name: '', baseURL: baseURL ?? '', tags: [] }];

  return resolved.map((target) => ({
    name: target.name,
    ...targetSelection(target, envTag),
    // Kept for the banner and for reports: the tags are encoded in grepInvert
    // as a negative lookahead, which is not something to read back out.
    metadata: { targetTags: target.tags },
    use: { ...use, baseURL: target.baseURL === '' ? baseURL : target.baseURL },
  }));
}
