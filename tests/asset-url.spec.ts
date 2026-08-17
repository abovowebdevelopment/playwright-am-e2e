import { expect, test } from '@playwright/test';
import { matchesAssetUrl } from '../dist/internal/asset-url';

const BASE = 'https://example.abovodevsites.nl/';

test('matches a plain theme dist path', () => {
  expect(matchesAssetUrl('/wp-content/themes/child/dist/theme-styles.css', 'theme-styles.css', BASE)).toBe(true);
});

test('matches a relative URL against the base', () => {
  expect(matchesAssetUrl('wp-content/themes/child/dist/theme-scripts.js', 'theme-scripts.js', BASE)).toBe(true);
});

test('ignores a cache-busting query string', () => {
  expect(matchesAssetUrl('/dist/theme-styles.css?ver=abc123', 'theme-styles.css', BASE)).toBe(true);
});

test('matches an optimizer-rewritten filename with a hash prefix', () => {
  // FlyingPress rewrites to wp-content/cache/flying-press/<hash>.theme-styles.css
  expect(matchesAssetUrl('/wp-content/cache/flying-press/bb1083f6.theme-styles.css', 'theme-styles.css', BASE)).toBe(true);
});

test('does not match a different file that merely ends with the name', () => {
  expect(matchesAssetUrl('/dist/other-theme-styles.css', 'theme-styles.css', BASE)).toBe(false);
});

test('does not match a source map for the asset', () => {
  expect(matchesAssetUrl('/dist/theme-styles.css.map', 'theme-styles.css', BASE)).toBe(false);
});

test('does not match the filename appearing only in the query string', () => {
  expect(matchesAssetUrl('/loader.js?file=theme-styles.css', 'theme-styles.css', BASE)).toBe(false);
});

test('treats the dot in the filename literally, not as "any character"', () => {
  // Without escaping, the `.` before css matches any character and this passes.
  expect(matchesAssetUrl('/dist/theme-stylesXcss', 'theme-styles.css', BASE)).toBe(false);
});
