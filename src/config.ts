import { defineConfig } from '@playwright/test';
import type { PlaywrightTestConfig } from '@playwright/test';

/**
 * The per-project Playwright config, in one place.
 *
 * `bin/e2e` runs the tests with the cwd set to tests/e2e/ and injects the
 * resolved site URL as E2E_BASE_URL, so a project's playwright.config.ts needs
 * nothing host-specific. Keeping that contract here means a change to how the
 * runner passes the URL is one package release rather than an edit in every
 * project repo.
 *
 * `overrides` is merged shallowly, except `use`, which is merged one level
 * deeper so a project can add options without losing baseURL.
 */
export function defineE2EConfig(overrides: PlaywrightTestConfig = {}): PlaywrightTestConfig {
  const { use, ...rest } = overrides;

  return defineConfig({
    testDir: '.',
    ...rest,
    use: {
      baseURL: process.env.E2E_BASE_URL,
      ...use,
    },
  });
}
