import { defineConfig } from '@playwright/test';

// The package's own tests. Deliberately NOT using defineE2EConfig() from
// src/config.ts — these tests verify that helper, so depending on it here
// would make the test circular.
export default defineConfig({
  testDir: '.',
  use: { baseURL: process.env.E2E_BASE_URL },
});
