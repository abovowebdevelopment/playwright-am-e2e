import path from 'node:path';
import { test as base, expect } from '@playwright/test';
import { resolveScreenshotPath } from './internal/screenshot-path';

/**
 * Playwright's `test`, with one change: `page.screenshot({ path })` is
 * sandboxed into the current run directory instead of writing wherever the
 * caller points it.
 *
 * - a relative path lands in `<run>/screenshots/<path>`
 * - a path with a leading slash is anchored at the run directory's root:
 *   `/sub/b.jpg` -> `<run>/sub/b.jpg`
 * - a path that would escape the run directory (e.g. via `..`) throws,
 *   rather than writing outside it
 *
 * The run directory is `<outputDir>/..` — `defineE2EConfig()` sets
 * `outputDir` to `<run>/artifacts`, so its parent is always the run root,
 * regardless of how the run id was resolved.
 *
 * Import `test` and `expect` from this package instead of from
 * '@playwright/test'. Screenshot filenames must be unique per test — the
 * `screenshots/` directory is shared across a run, so two tests writing the
 * same relative name overwrite each other.
 */
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const takeScreenshot = page.screenshot.bind(page);
    const runDir = path.dirname(testInfo.project.outputDir);

    page.screenshot = (options = {}) => {
      if (typeof options.path === 'string') {
        options = { ...options, path: resolveScreenshotPath(options.path, runDir) };
      }
      return takeScreenshot(options);
    };

    await use(page);
  },
});

export { expect };
export type { BrowserContext, Locator, Page, Response } from '@playwright/test';
