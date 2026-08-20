import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  readTargetsFile,
  resolveTargets,
  targetSelection,
  TARGETS_FILENAME,
} from '../dist/internal/targets';

// Pure-logic tests: no page, no network.

const DEV_URL = 'https://site-nl.abovodevsites.nl/';
const COM_URL = 'https://site-com.abovodevsites.nl/';
const BE_URL = 'https://site-be.abovodevsites.nl/';

/** Writes a targets file into a throwaway directory and returns that directory. */
function withTargetsFile(contents: unknown | string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-e2e-targets-'));
  const body = typeof contents === 'string' ? contents : JSON.stringify(contents);
  fs.writeFileSync(path.join(dir, TARGETS_FILENAME), body, 'utf8');
  return dir;
}

test('a missing file reads as undefined, not an error', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-e2e-empty-'));
  expect(readTargetsFile(dir)).toBeUndefined();
});

test('malformed JSON throws instead of silently falling back', () => {
  const dir = withTargetsFile('{ "dev": [ }');
  expect(() => readTargetsFile(dir)).toThrow(/not valid JSON/);
});

test('a top-level array is rejected', () => {
  const dir = withTargetsFile([DEV_URL]);
  expect(() => readTargetsFile(dir)).toThrow(/keyed by environment tag/);
});

test('an env with no entry resolves to undefined, keeping default behaviour', () => {
  const file = { dev: [{ url: DEV_URL }] };
  expect(resolveTargets(file, 'staging', undefined)).toBeUndefined();
});

test('an empty target list resolves to undefined', () => {
  expect(resolveTargets({ dev: [] }, 'dev', undefined)).toBeUndefined();
});

test('the env key may be written with or without a leading @', () => {
  const file = { '@dev': [{ url: DEV_URL }] };
  expect(resolveTargets(file, 'dev', undefined)).toHaveLength(1);
  expect(resolveTargets({ dev: [{ url: DEV_URL }] }, '@dev', undefined)).toHaveLength(1);
});

test('one url with several tags keeps all of them', () => {
  const file = { dev: [{ url: COM_URL, tags: ['@custom-a', 'custom-b'] }] };
  const targets = resolveTargets(file, 'dev', undefined)!;

  expect(targets).toHaveLength(1);
  // A leading @ is optional in the file.
  expect(targets[0]!.tags).toEqual(['@custom-a', '@custom-b']);
});

test('an array of urls fans one tag out over each of them', () => {
  const file = { dev: [{ url: [COM_URL, BE_URL], tags: '@custom-multisite' }] };
  const targets = resolveTargets(file, 'dev', undefined)!;

  expect(targets.map((target) => target.baseURL)).toEqual([COM_URL, BE_URL]);
  expect(targets.every((target) => target.tags[0] === '@custom-multisite')).toBe(true);
});

test('a bare string is shorthand for a url-only target', () => {
  const targets = resolveTargets({ dev: [DEV_URL] }, 'dev', undefined)!;

  expect(targets[0]!.baseURL).toBe(DEV_URL);
  expect(targets[0]!.tags).toEqual([]);
});

test('an omitted url falls back to the runner-resolved URL', () => {
  const targets = resolveTargets({ dev: [{ tags: '@custom-a' }] }, 'dev', DEV_URL)!;
  expect(targets[0]!.baseURL).toBe(DEV_URL);
});

test('an omitted url with no fallback is an error, not a silent skip', () => {
  expect(() => resolveTargets({ dev: [{ tags: '@custom-a' }] }, 'dev', undefined)).toThrow(
    /omits "url"/,
  );
});

test('a missing trailing slash is added, so relative goto() keeps the path', () => {
  const targets = resolveTargets({ dev: ['https://site.nl/fr'] }, 'dev', undefined)!;
  expect(targets[0]!.baseURL).toBe('https://site.nl/fr/');
});

test('an unparseable url is an error', () => {
  expect(() => resolveTargets({ dev: ['not a url'] }, 'dev', undefined)).toThrow(/not a valid URL/);
});

test('an empty tag is an error', () => {
  expect(() => resolveTargets({ dev: [{ url: DEV_URL, tags: '  ' }] }, 'dev', undefined)).toThrow(
    /non-empty string/,
  );
});

test('names use the shortest unique host label for dev sites under one apex', () => {
  const file = { dev: [DEV_URL, COM_URL, BE_URL] };
  const targets = resolveTargets(file, 'dev', undefined)!;

  expect(targets.map((target) => target.name)).toEqual(['site-nl', 'site-com', 'site-be']);
});

test('names fall back to more labels when first labels collide', () => {
  const file = { production: ['https://site.nl/', 'https://site.com/'] };
  const targets = resolveTargets(file, 'production', undefined)!;

  expect(targets.map((target) => target.name)).toEqual(['site.nl', 'site.com']);
});

test('a non-root path is part of the name, so language prefixes separate', () => {
  const file = { production: ['https://site.be/nl/', 'https://site.be/fr/'] };
  const targets = resolveTargets(file, 'production', undefined)!;

  expect(targets.map((target) => target.name)).toEqual(['site.be/nl', 'site.be/fr']);
});

test('an identical url twice still gets unique names', () => {
  const file = {
    dev: [
      { url: DEV_URL, tags: '@custom-a' },
      { url: DEV_URL, tags: '@custom-b' },
    ],
  };
  const targets = resolveTargets(file, 'dev', undefined)!;

  expect(new Set(targets.map((target) => target.name)).size).toBe(2);
});

test('a leading www is not the name', () => {
  const file = { production: ['https://www.dentalclinics.nl/'] };
  expect(resolveTargets(file, 'production', undefined)![0]!.name).toBe('dentalclinics');
});

test('dropping www still separates hosts that differ later', () => {
  const file = { production: ['https://www.site.nl/', 'https://www.site.be/'] };
  const names = resolveTargets(file, 'production', undefined)!.map((target) => target.name);

  expect(names).toEqual(['site.nl', 'site.be']);
});

test('an explicit "project" wins over the generated name', () => {
  const file = { dev: [{ url: DEV_URL, project: 'primary' }] };
  expect(resolveTargets(file, 'dev', undefined)![0]!.name).toBe('primary');
});

test('a "project" name on a multi-url target is rejected, not silently duplicated', () => {
  // Playwright project names must be unique, and one name across two sites
  // would make "which site failed?" unanswerable from the output.
  const file = { dev: [{ url: [DEV_URL, COM_URL], project: 'sites' }] };

  expect(() => resolveTargets(file, 'dev', undefined)).toThrow(/can only label one/);
});

/** Would this title run on this target? grep must match, grepInvert must not. */
function runsOn(selection: { grep: RegExp; grepInvert: RegExp }, title: string): boolean {
  return selection.grep.test(title) && !selection.grepInvert.test(title);
}

test('an untagged target runs the env suite and holds back @custom-* tests', () => {
  const selection = targetSelection({ name: 'nl', baseURL: DEV_URL, tags: [] }, 'dev');

  expect(runsOn(selection, 'homepage loads @all')).toBe(true);
  expect(runsOn(selection, 'a test @dev')).toBe(true);
  expect(runsOn(selection, 'a test @staging')).toBe(false);
  expect(runsOn(selection, 'a test @dev @custom-anything')).toBe(false);
});

test('a tagged target runs the env suite AND its own custom tests', () => {
  const selection = targetSelection(
    { name: 'com', baseURL: COM_URL, tags: ['@custom-multisite'] },
    'dev',
  );

  // The normal suite is not sacrificed to the tag — this is the whole point.
  expect(runsOn(selection, 'homepage loads @all')).toBe(true);
  // Its own custom tests come through.
  expect(runsOn(selection, 'a test @dev @custom-multisite')).toBe(true);
  // Another target's custom tests do not.
  expect(runsOn(selection, 'a test @dev @custom-checkout')).toBe(false);
  // The env tag keeps filtering.
  expect(runsOn(selection, 'a test @staging @custom-multisite')).toBe(false);
});

test('several tags on one target are all admitted', () => {
  const selection = targetSelection(
    { name: 'com', baseURL: COM_URL, tags: ['@custom-a', '@custom-b'] },
    'dev',
  );

  expect(runsOn(selection, 'a test @dev @custom-a')).toBe(true);
  expect(runsOn(selection, 'a test @dev @custom-b')).toBe(true);
  expect(runsOn(selection, 'a test @dev @custom-c')).toBe(false);
});

test('a tag is not a prefix match for a longer tag', () => {
  const selection = targetSelection({ name: 'nl', baseURL: DEV_URL, tags: ['@custom-nl'] }, 'dev');

  expect(runsOn(selection, 'a test @dev @custom-nl')).toBe(true);
  // @custom-nl-shop belongs to a different target and must not leak in.
  expect(runsOn(selection, 'a test @dev @custom-nl-shop')).toBe(false);
});

test('a test carrying two custom tags runs if the target asked for either', () => {
  const selection = targetSelection({ name: 'com', baseURL: COM_URL, tags: ['@custom-a'] }, 'dev');

  expect(runsOn(selection, 'a test @dev @custom-a')).toBe(true);
  // grepInvert matches on the OTHER tag, so this stays out — documented, and
  // the reason a test should carry one site tag, not several.
  expect(runsOn(selection, 'a test @dev @custom-a @custom-b')).toBe(false);
});

test('a regex metacharacter in a tag is escaped, not treated as a pattern', () => {
  const selection = targetSelection(
    { name: 'com', baseURL: COM_URL, tags: ['@custom-a.b'] },
    'dev',
  );

  expect(runsOn(selection, 'a test @dev @custom-a.b')).toBe(true);
  expect(runsOn(selection, 'a test @dev @custom-axb')).toBe(false);
});
