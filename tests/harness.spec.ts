import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../dist/index';

test('a relative screenshot path lands in <run>/screenshots/', async ({ page }, testInfo) => {
  await page.goto('about:blank');
  await page.screenshot({ path: 'harness-relative.jpg' });

  const runDir = path.dirname(testInfo.project.outputDir);
  const expected = path.join(runDir, 'screenshots', 'harness-relative.jpg');
  expect(fs.existsSync(expected), `expected a screenshot at ${expected}`).toBe(true);
});

test('a leading-slash path is anchored at the run directory root', async ({ page }, testInfo) => {
  await page.goto('about:blank');
  await page.screenshot({ path: '/harness-sub/harness-root-anchored.jpg' });

  const runDir = path.dirname(testInfo.project.outputDir);
  const expected = path.join(runDir, 'harness-sub', 'harness-root-anchored.jpg');
  expect(fs.existsSync(expected), `expected a screenshot at ${expected}`).toBe(true);
});

test('a ".." escape attempt is rejected rather than writing outside the run directory', async ({
  page,
}) => {
  await page.goto('about:blank');

  await expect(async () => {
    await page.screenshot({ path: '../../../../../tmp/harness-escape.jpg' });
  }).rejects.toThrow(/escapes the run directory/);

  expect(fs.existsSync('/tmp/harness-escape.jpg')).toBe(false);
});

test('a leading-slash ".." escape attempt is also rejected', async ({ page }) => {
  await page.goto('about:blank');

  await expect(async () => {
    await page.screenshot({ path: '/../../../../tmp/harness-escape-2.jpg' });
  }).rejects.toThrow(/escapes the run directory/);

  expect(fs.existsSync('/tmp/harness-escape-2.jpg')).toBe(false);
});
