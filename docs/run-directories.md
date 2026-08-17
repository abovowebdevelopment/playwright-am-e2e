# Run directories

Since v1.1.0, every `e2e` run gets its own directory under `test-results/`,
retained across runs, with machine-readable output. This matters because
`e2e` runs on dev, staging, and an SLA monitoring host, and is scriptable for
CI/n8n — a single overwritten `test-results/` gave no history to compare
against.

## Layout

```
tests/e2e/test-results/
  20260817-104213/            <- run dir, named after the run id
    artifacts/                <- Playwright's outputDir (traces, videos, per-test dirs)
    html-report/              <- HTML reporter (sibling of artifacts/, not inside)
    screenshots/               <- the screenshot fixture's relative-path target
    results.json               <- Playwright's JSON reporter output
    summary.json                <- compact machine-readable summary
  20260817-102960/
  ...
```

The run id format is `YYYYMMDD-HHMMSS` (UTC), so lexicographic sort equals
chronological sort — retention (below) sorts by name, not mtime, which is
more robust against clock skew or a copied directory changing its mtime.

## Where the run id comes from

`bin/e2e` (in `dev-infra`) generates the run id with `date -u
+%Y%m%d-%H%M%S` and passes it to Playwright as `E2E_RUN_ID`, then prints the
resulting run directory path so a human can find the artifacts.

`defineE2EConfig()` in `src/config.ts` reads `E2E_RUN_ID` and uses it
verbatim if present. For standalone use (`npx playwright test` without the
wrapper) there is no `E2E_RUN_ID` yet, so `src/internal/run-id.ts` generates
one and writes it back into `process.env` before returning.

**Why the config can't just generate the id itself, unconditionally:**
Playwright loads the config module once per process — the main
(orchestrator) process *and* every worker process. This was proven
empirically: a `Math.random()` planted at config module scope printed a
different value per worker in a single run. If `defineE2EConfig()`
unconditionally generated a fresh run id every time it was evaluated, a
single `e2e` run would scatter its output across one directory per worker
instead of one directory for the whole run.

The fallback avoids this by generating the id only once — the *first* time
`resolveRunId()` runs with no `E2E_RUN_ID` already set — and immediately
writing it into `process.env.E2E_RUN_ID`. Playwright's config module load in
the main process happens *before* it forks any worker processes (via
`child_process.fork`, which copies the parent's `process.env` at spawn time).
So by the time a worker process re-evaluates the config module and calls
`resolveRunId()` itself, `E2E_RUN_ID` is already set in its inherited
environment, and it returns that value immediately instead of generating its
own.

**This was verified**, not assumed: a throwaway two-worker Playwright config
using `defineE2EConfig()` with no `E2E_RUN_ID` set ran four tests spread
across two distinct worker processes (confirmed via `process.pid`), and every
test recorded the identical `E2E_RUN_ID` — proving the fallback holds
together under real multi-worker execution, not just in the main process.

## Retention

Old run directories are pruned automatically, once per run, keeping the
newest `E2E_KEEP_RUNS` run directories by name (default **3** — the HTML
report alone can be a few MB per run, so keeping more by default was judged
not worth the disk). Pruning happens in `src/internal/retention.ts`'s
`pruneOldRuns()`, invoked via Playwright's `globalSetup` — which, like the
config module, is guaranteed to run exactly once in the main process, before
any worker starts, never once per worker.

Safety guardrails (non-negotiable, and covered by tests that fail when
deliberately broken — see `tests/retention.spec.ts`):

- only ever deletes **direct children** of the resolved `test-results/`
  directory (a `path.dirname(target) !== testResultsDir` check right before
  every delete)
- only ever deletes entries whose **name matches the run-id pattern
  exactly** (`^\d{8}-\d{6}$`) — anything else (a stray file, a differently
  named directory) is left alone
- **never follows a symlink** — `fs.readdirSync(..., { withFileTypes: true
  })` reports a symlink's own dirent type rather than its target's, so a
  symlink (even one named like a run id and pointing at a directory) fails
  the `isDirectory()` check and is skipped; an `lstatSync` re-check
  immediately before each `rmSync` call is defense in depth
- **never deletes the current run**, even as a hypothetical edge case where
  it would not be the lexicographically newest name

`E2E_KEEP_RUNS` overrides the default; an unset, empty, non-numeric, or
non-positive value falls back to the default rather than disabling retention
or deleting everything.

## Screenshot sandbox

**Behaviour change from 1.0.x**, released as v1.1.0 (see the CHANGELOG for
the SemVer rationale). This package's `test` fixture wraps
`page.screenshot({ path })`:

- a **relative** path lands in `<run>/screenshots/<path>`
- a path with a **leading slash** is treated as anchored at the run
  directory's root: `/sub/b.jpg` -> `<run>/sub/b.jpg`
- nothing can write outside `<run>/`: the resolved path is normalised and
  checked to still be inside the target base (`<run>/screenshots` for a
  relative path, `<run>` for a leading-slash path); a `..` escape attempt
  throws a clear error instead of writing anywhere

Before 1.1.0, an absolute path was left alone and written wherever it
pointed — this was flagged as a footgun once run directories became
per-run and gitignored: an absolute path could just as easily point outside
`test-results/` entirely, defeating retention and leaving stray files.

The run directory is derived as `path.dirname(testInfo.project.outputDir)`
rather than recomputed independently, because `defineE2EConfig()` always
sets `outputDir` to `<run>/artifacts` — so its parent is the run root by
construction, regardless of cwd or how the run id was resolved.

## Why the HTML report lives next to `artifacts/`, not inside it

Playwright refuses to place its HTML reporter's output folder inside
`outputDir` — it errors with "the HTML reporter output folder clashes with
the tests output folder used for test-scoped artifacts". `defineE2EConfig()`
sets `outputDir` to `<run>/artifacts` and the HTML reporter's `outputFolder`
to `<run>/html-report`: siblings, not nested.

## `summary.json`

Written by `SummaryReporter` (`@abovomaxlead/playwright-am-e2e/summary-reporter`,
wired in automatically by `defineE2EConfig()`). Contents, deliberately
nothing beyond this:

```json
{
  "status": "passed",
  "counts": { "passed": 12, "failed": 0, "skipped": 1, "interrupted": 0 },
  "durationMs": 8421,
  "baseURL": "https://dentalclinics-nl.abovodevsites.nl/",
  "environment": "dev",
  "startedAt": "2026-08-17T10:42:13.123Z",
  "playwrightVersion": "1.62.1"
}
```

It is registered as a dedicated package entry point
(`./summary-reporter`, `src/summary-reporter.ts`) rather than kept internal,
because Playwright resolves reporters by module path/specifier — a reporter
passed as `['@abovomaxlead/playwright-am-e2e/summary-reporter', options]`
must be `require()`-able from the consuming project's own `node_modules`,
which an unexported internal module is not. `scripts/verify-exports.js`
covers this entry point the same way it covers every other public specifier.

## Overrides

`outputDir`, `reporter`, and `globalSetup` passed to `defineE2EConfig()` are
full overrides, not merged: a caller that supplies one of them opts out of
the corresponding default entirely (no run-scoped `outputDir`, no default
reporter set including the summary reporter, or no automatic retention,
respectively). This mirrors the existing `testDir` / top-level override
behaviour — everything except `use` (merged one level deep) is a full
replacement when supplied.
