# Changelog

## v1.1.2 — 2026-08-17

### Fixed

- Retention kept `E2E_KEEP_RUNS + 1` run directories instead of
  `E2E_KEEP_RUNS`. `pruneOldRuns()` runs as Playwright's `globalSetup`, before
  the reporters and `outputDir` create `test-results/<runId>/`, so the run
  being started was invisible to the directory listing: the whole budget went
  to previous runs, and the current run then added itself on top. With the
  default of 3, every run ended with 4 directories on disk — while correctly
  reporting that it had pruned. `pruneOldRuns()` now counts `currentRunId`
  against the budget when the listing does not already contain it; behaviour
  is unchanged when the directory does exist. Every safety guardrail is
  untouched — direct children only, run-id names only, never a symlink, never
  the current run.

  The existing retention tests all pre-created the current run's directory,
  which is why they passed throughout; the new regression test reproduces the
  real ordering by leaving it off disk.

## v1.1.1 — 2026-08-17

### Changed

- A run now ends with a single plain line naming the results directory:
  `Test results: <path>`. It stands in for Playwright's own "To open last HTML
  report run: npx playwright show-report …" hint, which is wrong here on both
  counts — the path is relative to the container's working directory, and the
  host has no Playwright to run it with. `bin/e2e` suppresses that hint by not
  allocating a TTY (Playwright gates it on `process.stdin.isTTY`) while setting
  `FORCE_COLOR=1` so coloured output survives.

  The HTML report is a self-contained `index.html` with its data inlined, so it
  opens straight from the filesystem — no server, no `show-report`.

## v1.1.0 — 2026-08-17

### Added

- Per-run result directories: `test-results/<runId>/` (`runId` =
  `YYYYMMDD-HHMMSS`, from `E2E_RUN_ID` or a generated fallback for standalone
  use). Each run directory contains `artifacts/` (Playwright's `outputDir`),
  `html-report/` (a sibling, not nested — Playwright refuses an HTML report
  folder inside `outputDir`), `screenshots/`, `results.json` (Playwright's
  JSON reporter), and `summary.json` (see below).
- Automatic retention: old run directories are pruned on every run, keeping
  the newest `E2E_KEEP_RUNS` (default **3**) by name. Only direct children of
  `test-results/` whose name matches the run-id pattern are ever considered;
  symlinks are never followed; the current run is never deleted.
- `@abovomaxlead/playwright-am-e2e/summary-reporter` — a new entry point
  exporting `SummaryReporter`, a Playwright `Reporter` that writes a compact
  `summary.json`: pass/fail/skip counts, total duration in ms, the base URL,
  the environment tag, the run's start timestamp, and the Playwright version.
  `defineE2EConfig()` wires it in automatically.

### Changed

- **Behaviour change — screenshot paths are now sandboxed.** `page.screenshot({
  path })` (via this package's `test` fixture) now resolves against the run
  directory instead of the old `<outputDir>/screenshots/`: a relative path
  still lands in `<run>/screenshots/<path>`, but a path with a **leading
  slash is now anchored at the run directory's root** (`/sub/b.jpg` ->
  `<run>/sub/b.jpg`) instead of being left alone as an absolute path. A `..`
  escape attempt now throws instead of writing outside the run directory.
  This is a deliberate minor, not a major: every consumer of this package is
  in-house, none uses absolute screenshot paths today, and a major bump would
  force every project to move its `#semver:^1.0.0` pin — exactly the
  per-project chore this run-directory design exists to remove.

Full design notes: `docs/run-directories.md`.

## v1.0.1 — 2026-08-17

### Changed

- Clearer assertion message when the homepage returns no response.

## v1.0.0 — 2026-08-17

Initial release. Extracted from the hand-copied `tests/e2e/base.spec.ts` and
`tests/e2e/fixtures.ts` that every project carried.

### Added

- `@abovomaxlead/playwright-am-e2e` — `test` with the screenshot-path fixture,
  `expect`, and the `Page`, `Response`, `Locator`, `BrowserContext` types.
- `@abovomaxlead/playwright-am-e2e/config` — `defineE2EConfig()`.
- `@abovomaxlead/playwright-am-e2e/global` — `testHomepageLoads()`.
- `@abovomaxlead/playwright-am-e2e/abovo-basis` — `testThemeAssetsLoad()` and
  `ABOVO_BASIS_THEME_ASSETS`.
