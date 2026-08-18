import { expect, test } from '../../index';
import { matchesAssetUrl } from '../../internal/asset-url';
import { loadPage } from '../../internal/page-load';

export type ThemeAsset = {
  /** Human-readable name used in the test title, e.g. 'theme stylesheet'. */
  label: string;
  /** Filename to look for, e.g. 'theme-styles.css'. */
  filename: string;
  /** Selector for the elements that may reference it. */
  domSelector: string;
  /** Attribute on those elements that carries the URL. */
  urlAttribute: string;
};

/** The assets every abovo-basis child theme is expected to ship. */
export const ABOVO_BASIS_THEME_ASSETS: readonly ThemeAsset[] = [
  {
    label: 'theme stylesheet',
    filename: 'theme-styles.css',
    domSelector: 'link[rel="stylesheet"][href]',
    urlAttribute: 'href',
  },
  {
    label: 'theme script',
    filename: 'theme-scripts.js',
    domSelector: 'script[src]',
    urlAttribute: 'src',
  },
];

export type ThemeAssetsOptions = {
  /** Assets to check. Default ABOVO_BASIS_THEME_ASSETS. */
  assets?: readonly ThemeAsset[];
  /** Relative path to load. Default './'. */
  path?: string;
  /** Environment tags the tests may run on. Default ['@all']. */
  tags?: string[];
};

/**
 * Each theme asset is referenced in the rendered HTML and actually loaded.
 *
 * Both halves matter: a reference with no request means the browser never
 * fetched it, and a request with no reference means something other than the
 * theme pulled it in.
 */
export function testThemeAssetsLoad(options: ThemeAssetsOptions = {}): void {
  const { assets = ABOVO_BASIS_THEME_ASSETS, path = './', tags = ['@all'] } = options;

  for (const asset of assets) {
    test(`${asset.label} ${asset.filename} loads`, { tag: tags }, async ({ page }) => {
      const { responses } = await loadPage(page, path);
      const pageUrl = page.url();

      // The asset must be referenced in the rendered HTML...
      const referencedUrls = await page.locator(asset.domSelector).evaluateAll(
        (elements, attribute) => elements.map((element) => element.getAttribute(attribute as string) ?? ''),
        asset.urlAttribute,
      );
      const referenced = referencedUrls.filter((url) => url && matchesAssetUrl(url, asset.filename, pageUrl));
      expect(
        referenced,
        `no ${asset.domSelector} referencing ${asset.filename} found in the DOM`,
      ).not.toHaveLength(0);

      // ...and it must actually have loaded during navigation.
      const assetResponses = responses.filter((response) =>
        matchesAssetUrl(response.url(), asset.filename, pageUrl),
      );
      expect(assetResponses, `${asset.filename} was referenced but never requested`).not.toHaveLength(0);
      for (const response of assetResponses) {
        expect(response.ok(), `${response.url()} returned HTTP ${response.status()}`).toBe(true);
      }
    });
  }
}
