import { defineConfig } from '@playwright/test';

// The package's own tests. Deliberately NOT using defineE2EConfig() from
// src/config.ts — these tests verify that helper, so depending on it here
// would make the test circular.
//
// outputDir is nested one level under test-results/ (rather than left at the
// default test-results/) so that harness.spec.ts's path.dirname(outputDir)
// lands back inside the gitignored test-results/ directory, mirroring the
// <run>/artifacts shape defineE2EConfig() produces, instead of scattering
// screenshots into the repo root.
export default defineConfig({
  testDir: '.',
  // Registration-only specs are listed, never run: they register tests for
  // assets that do not exist on any real site.
  testIgnore: 'registration.spec.ts',
  outputDir: 'test-results/self-test/artifacts',
  use: { baseURL: process.env.E2E_BASE_URL },
});
