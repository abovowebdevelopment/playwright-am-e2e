import path from 'node:path';
import { test as base, expect } from '@playwright/test';

/**
 * Playwright's `test`, with one change: a relative `path` passed to
 * page.screenshot() lands in <outputDir>/screenshots/ instead of the process
 * cwd (tests/e2e/, where the spec files live and where stray screenshots would
 * dirty `git status`).
 *
 * Import `test` and `expect` from this package instead of from
 * '@playwright/test'. Screenshot filenames must be unique per test — the
 * directory is shared, so two tests writing the same name overwrite each other.
 */
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const takeScreenshot = page.screenshot.bind(page);
    const screenshotDir = path.join(testInfo.project.outputDir, 'screenshots');

    page.screenshot = (options = {}) => {
      if (typeof options.path === 'string' && !path.isAbsolute(options.path)) {
        options = { ...options, path: path.join(screenshotDir, options.path) };
      }
      return takeScreenshot(options);
    };

    await use(page);
  },
});

export { expect };
export type { BrowserContext, Locator, Page, Response } from '@playwright/test';
