import { defineConfig } from '@playwright/test';

// Companion to playwright.config.ts: runs only the registration-only specs,
// and only ever with --list.
export default defineConfig({
  testDir: '.',
  testMatch: 'registration.spec.ts',
});
