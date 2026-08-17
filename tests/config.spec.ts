import { expect, test } from '@playwright/test';
import { defineE2EConfig } from '../dist/config';

// Pure-logic tests: no page, no network. Imported from '@playwright/test'
// rather than from the package, because nothing here needs the page fixture.

test('baseURL comes from E2E_BASE_URL', () => {
  expect(defineE2EConfig().use?.baseURL).toBe(process.env.E2E_BASE_URL);
});

test('testDir defaults to the config directory', () => {
  expect(defineE2EConfig().testDir).toBe('.');
});

test('top-level overrides win', () => {
  expect(defineE2EConfig({ timeout: 1234 }).timeout).toBe(1234);
});

test('use overrides merge instead of replacing baseURL', () => {
  const config = defineE2EConfig({ use: { actionTimeout: 99 } });

  expect(config.use?.actionTimeout).toBe(99);
  expect(config.use?.baseURL).toBe(process.env.E2E_BASE_URL);
});

test('an explicit baseURL override beats the environment', () => {
  const config = defineE2EConfig({ use: { baseURL: 'https://override.example/' } });

  expect(config.use?.baseURL).toBe('https://override.example/');
});
