/**
 * True when `url` points at a file called `filename`.
 *
 * Two deliberate choices, both load-bearing:
 *
 * - Matching is against the URL *path* only, so cache-busting query strings
 *   (?ver=abc123) are ignored and a filename that appears only in a query
 *   string does not count as a match.
 * - Matching is on the filename rather than the full dist/ path, because
 *   optimizers such as FlyingPress rewrite asset URLs to e.g.
 *   wp-content/cache/flying-press/bb1083f6.theme-styles.css but keep the
 *   filename. The leading [/.] means only a path separator or a hash prefix
 *   may precede it, so /dist/other-theme-styles.css does not match
 *   theme-styles.css.
 *
 * `base` resolves relative URLs and is normally the current page URL.
 */
export function matchesAssetUrl(url: string, filename: string, base: string): boolean {
  const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return new RegExp(`[/.]${escaped}$`).test(new URL(url, base).pathname);
}
