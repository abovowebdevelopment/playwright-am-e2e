import { expect, test } from '@playwright/test';
import { defineE2EConfig } from '../dist/config';

// Pure-logic tests: no page, no network. Imported from '@playwright/test'
// rather than from the package, because nothing here needs the page fixture.

const FROM_ENV = 'https://from-env.abovodevsites.nl/';

/**
 * Run `assertions` with E2E_BASE_URL set to a known value, then restore it.
 *
 * defineE2EConfig reads process.env at call time, so the assertions set a
 * literal rather than comparing against process.env. E2E_BASE_URL is unset
 * when the package tests itself, and `undefined === undefined` would pass even
 * if the helper ignored the variable entirely.
 */
function withBaseUrlEnv(value: string, assertions: () => void): void {
  const previous = process.env.E2E_BASE_URL;
  process.env.E2E_BASE_URL = value;

  try {
    assertions();
  } finally {
    if (previous === undefined) {
      delete process.env.E2E_BASE_URL;
    } else {
      process.env.E2E_BASE_URL = previous;
    }
  }
}

test('baseURL comes from E2E_BASE_URL', () => {
  withBaseUrlEnv(FROM_ENV, () => {
    expect(defineE2EConfig().use?.baseURL).toBe(FROM_ENV);
  });
});

test('testDir defaults to the config directory', () => {
  expect(defineE2EConfig().testDir).toBe('.');
});

test('top-level overrides win', () => {
  expect(defineE2EConfig({ timeout: 1234 }).timeout).toBe(1234);
});

test('use overrides merge instead of replacing baseURL', () => {
  withBaseUrlEnv(FROM_ENV, () => {
    const config = defineE2EConfig({ use: { actionTimeout: 99 } });

    expect(config.use?.actionTimeout).toBe(99);
    expect(config.use?.baseURL).toBe(FROM_ENV);
  });
});

test('an explicit baseURL override beats the environment', () => {
  withBaseUrlEnv(FROM_ENV, () => {
    const config = defineE2EConfig({ use: { baseURL: 'https://override.example/' } });

    expect(config.use?.baseURL).toBe('https://override.example/');
  });
});
