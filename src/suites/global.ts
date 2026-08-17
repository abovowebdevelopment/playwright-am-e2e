import { expect, test } from '../index';
import { loadPage } from '../internal/page-load';

export type HomepageOptions = {
  /** Relative path to treat as the homepage. Default './'. */
  path?: string;
  /** Environment tags the test may run on. Default ['@all']. */
  tags?: string[];
};

/**
 * The homepage responds with a 2xx and renders a body.
 *
 * Platform-agnostic: true of any site we host, not just WordPress.
 */
export function testHomepageLoads(options: HomepageOptions = {}): void {
  const { path = './', tags = ['@all'] } = options;

  test('homepage loads', { tag: tags }, async ({ page }) => {
    const { pageResponse } = await loadPage(page, path);

    expect(pageResponse, 'homepage should return a response').not.toBeNull();
    expect(pageResponse!.ok(), `homepage returned HTTP ${pageResponse!.status()}`).toBe(true);
    await expect(page.locator('body')).toBeAttached();
  });
}
