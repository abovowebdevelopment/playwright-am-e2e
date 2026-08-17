import type { Page, Response } from '@playwright/test';

export type PageLoad = {
  /** The navigation response, or null when no navigation happened. */
  pageResponse: Response | null;
  /** Every response observed during the navigation, in arrival order. */
  responses: Response[];
};

/**
 * Navigate to `path` and collect every response seen along the way, so a test
 * can assert on subresources (stylesheets, scripts) as well as the document.
 *
 * `path` must be relative — './' for the homepage, './contact' for a page.
 * Playwright resolves goto() against baseURL with the URL() constructor, so a
 * leading slash would replace the whole base path and escape a path-prefixed
 * base URL such as https://site/fr/.
 */
export async function loadPage(page: Page, path: string): Promise<PageLoad> {
  const responses: Response[] = [];

  page.on('response', (response) => {
    responses.push(response);
  });

  const pageResponse = await page.goto(path, { waitUntil: 'load' });

  return { pageResponse, responses };
}
