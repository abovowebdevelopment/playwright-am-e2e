import { ABOVO_BASIS_THEME_ASSETS, testThemeAssetsLoad } from '../dist/suites/abovo-basis';
import { expect, test } from '../dist/index';

// `test` comes from the package, not from '@playwright/test': the registrar
// below registers its tests on the package's extended instance, and mixing two
// instances in one file is asking for a "different test instance" error.

test('the default asset list covers the theme stylesheet and script', () => {
  expect(ABOVO_BASIS_THEME_ASSETS.map((asset) => asset.filename)).toEqual([
    'theme-styles.css',
    'theme-scripts.js',
  ]);
});

// Against a real abovo-basis site: registers one test per asset.
testThemeAssetsLoad();
