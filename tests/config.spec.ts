import fsSync from 'node:fs';
import osMod from 'node:os';
import pathMod from 'node:path';
import { expect, test } from '@playwright/test';
import { defineE2EConfig } from '../dist/config';

// Pure-logic tests: no page, no network. Imported from '@playwright/test'
// rather than from the package, because nothing here needs the page fixture.

const FROM_ENV = 'https://from-env.abovodevsites.nl/';

// Selection now lives in defineE2EConfig, so every call needs an environment
// tag. Set it once for the whole file; the targets cases below override it.
process.env.E2E_ENV_TAG ??= 'dev';

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

// --- targets file (1.3.0) ---------------------------------------------------

/**
 * defineE2EConfig reads the targets file from process.cwd(), so these tests
 * run from a throwaway directory. E2E_ENV_TAG and E2E_TARGETS are set per
 * case and restored afterwards.
 */
function withTargetsDir(
  file: unknown | undefined,
  env: Record<string, string | undefined>,
  assertions: () => void,
): void {
  const dir = fsSync.mkdtempSync(pathMod.join(osMod.tmpdir(), 'am-e2e-config-'));
  if (file !== undefined) {
    fsSync.writeFileSync(pathMod.join(dir, 'e2e.targets.json'), JSON.stringify(file), 'utf8');
  }

  const cwd = process.cwd();
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  process.chdir(dir);
  try {
    assertions();
  } finally {
    process.chdir(cwd);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('without a targets file there is one unnamed, filtered target', () => {
  withTargetsDir(undefined, { E2E_ENV_TAG: 'dev', E2E_TARGETS: undefined }, () => {
    const projects = defineE2EConfig().projects!;

    expect(projects).toHaveLength(1);
    expect(projects[0]!.name).toBe('');
    expect('a test @dev').toMatch(projects[0]!.grep as RegExp);
    expect('a test @staging').not.toMatch(projects[0]!.grep as RegExp);
    expect(projects[0]!.grepInvert).toBeDefined();
  });
});

test('a targets file emits one project per target, each with its own baseURL', () => {
  const file = {
    dev: [
      { url: 'https://site-nl.abovodevsites.nl/' },
      { url: ['https://site-com.abovodevsites.nl/', 'https://site-be.abovodevsites.nl/'],
        tags: '@custom-multisite' },
    ],
  };

  withTargetsDir(file, { E2E_ENV_TAG: 'dev', E2E_TARGETS: undefined }, () => {
    const projects = defineE2EConfig().projects!;

    expect(projects.map((project) => project.name)).toEqual(['site-nl', 'site-com', 'site-be']);
    expect(projects[1]!.use?.baseURL).toBe('https://site-com.abovodevsites.nl/');

    // Every target runs the env suite; grepInvert is what differs. The untagged
    // one bars all @custom-* tests, the tagged one only those it did not ask for.
    const runs = (index: number, title: string) =>
      (projects[index]!.grep as RegExp).test(title) &&
      !(projects[index]!.grepInvert as RegExp).test(title);

    expect(runs(0, 'homepage loads @all')).toBe(true);
    expect(runs(1, 'homepage loads @all')).toBe(true);
    expect(runs(0, 'splash @all @custom-multisite')).toBe(false);
    expect(runs(1, 'splash @all @custom-multisite')).toBe(true);
  });
});

test('an env absent from the file still gets one filtered project, not a free-for-all', () => {
  withTargetsDir({ production: ['https://site.nl/'] }, { E2E_ENV_TAG: 'dev', E2E_TARGETS: undefined }, () => {
    const projects = defineE2EConfig().projects!;

    expect(projects).toHaveLength(1);
    expect(projects[0]!.name).toBe('');
    expect('a test @dev').toMatch(projects[0]!.grep as RegExp);
    expect(projects[0]!.grepInvert).toBeDefined();
  });
});

test('E2E_TARGETS=off ignores the file, so an explicit --url wins', () => {
  withBaseUrlEnv(FROM_ENV, () => {
    withTargetsDir({ dev: ['https://site-nl.abovodevsites.nl/'] }, { E2E_ENV_TAG: 'dev', E2E_TARGETS: 'off' }, () => {
      const projects = defineE2EConfig().projects!;

      expect(projects).toHaveLength(1);
      expect(projects[0]!.use?.baseURL).toBe(FROM_ENV);
    });
  });
});

test('caller-supplied projects opt out of the targets file', () => {
  withTargetsDir({ dev: ['https://site-nl.abovodevsites.nl/'] }, { E2E_ENV_TAG: 'dev', E2E_TARGETS: undefined }, () => {
    const projects = defineE2EConfig({ projects: [{ name: 'mine' }] }).projects!;
    expect(projects.map((project) => project.name)).toEqual(['mine']);
  });
});

test('no resolvable environment is an error, not a silent unfiltered run', () => {
  withTargetsDir({ dev: ['https://site.nl/'] }, { E2E_ENV_TAG: undefined, AM_DEV_INFRA_ENV: undefined, E2E_TARGETS: undefined }, () => {
    expect(() => defineE2EConfig()).toThrow(/environment tag to grep for is unknown/);
  });
});

test('an env absent from the file keeps the declared envs out of the run', () => {
  withTargetsDir({ production: ['https://site.nl/'] }, { E2E_ENV_TAG: 'dev', E2E_TARGETS: undefined }, () => {
    const projects = defineE2EConfig().projects!;
    expect(projects.map((project) => project.use?.baseURL)).not.toContain('https://site.nl/');
  });
});
