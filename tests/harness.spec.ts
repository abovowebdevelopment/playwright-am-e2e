import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../dist/index';

test('a relative screenshot path lands in the run output directory', async ({ page }, testInfo) => {
  await page.goto('about:blank');
  await page.screenshot({ path: 'harness-relative.jpg' });

  const expected = path.join(testInfo.project.outputDir, 'screenshots', 'harness-relative.jpg');
  expect(fs.existsSync(expected), `expected a screenshot at ${expected}`).toBe(true);
});

test('an absolute screenshot path is left alone', async ({ page }, testInfo) => {
  const target = path.join(testInfo.outputDir, 'harness-absolute.jpg');

  await page.goto('about:blank');
  await page.screenshot({ path: target });

  expect(fs.existsSync(target), `expected a screenshot at ${target}`).toBe(true);
});
