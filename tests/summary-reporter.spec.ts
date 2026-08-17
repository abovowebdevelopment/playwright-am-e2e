import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { SummaryReporter } from '../dist/summary-reporter';

// Drives the reporter directly through Playwright's Reporter interface calls
// (onBegin/onTestEnd/onEnd) rather than via a full test run, so the assertion
// is about summary.json's shape and counts, not about running Playwright
// inside Playwright.

function fakeConfig(rootDir: string): any {
  return { rootDir };
}

function fakeResult(status: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted'): any {
  return { status };
}

test('writes summary.json with correct counts, duration, and metadata', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-am-e2e-summary-'));
  const previousBaseUrl = process.env.E2E_BASE_URL;
  const previousEnv = process.env.AM_DEV_INFRA_ENV;
  process.env.E2E_BASE_URL = 'https://example.abovodevsites.nl/';
  process.env.AM_DEV_INFRA_ENV = 'dev';

  try {
    const reporter = new SummaryReporter({ outputFile: 'summary.json' });
    reporter.onBegin(fakeConfig(dir));

    reporter.onTestEnd(undefined as any, fakeResult('passed'));
    reporter.onTestEnd(undefined as any, fakeResult('passed'));
    reporter.onTestEnd(undefined as any, fakeResult('failed'));
    reporter.onTestEnd(undefined as any, fakeResult('timedOut'));
    reporter.onTestEnd(undefined as any, fakeResult('skipped'));

    await reporter.onEnd(fakeResult('failed'));

    const outputFile = path.join(dir, 'summary.json');
    expect(fs.existsSync(outputFile)).toBe(true);

    const summary = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    expect(summary.status).toBe('failed');
    expect(summary.counts).toEqual({ passed: 2, failed: 2, skipped: 1, interrupted: 0 });
    expect(summary.baseURL).toBe('https://example.abovodevsites.nl/');
    expect(summary.environment).toBe('dev');
    expect(typeof summary.durationMs).toBe('number');
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof summary.startedAt).toBe('string');
    expect(new Date(summary.startedAt).toString()).not.toBe('Invalid Date');
    expect(typeof summary.playwrightVersion).toBe('string');
    expect(summary.playwrightVersion.length).toBeGreaterThan(0);
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.E2E_BASE_URL;
    } else {
      process.env.E2E_BASE_URL = previousBaseUrl;
    }
    if (previousEnv === undefined) {
      delete process.env.AM_DEV_INFRA_ENV;
    } else {
      process.env.AM_DEV_INFRA_ENV = previousEnv;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an absolute outputFile is used as-is, not resolved against rootDir', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-am-e2e-summary-'));
  try {
    const outputFile = path.join(dir, 'nested', 'summary.json');
    const reporter = new SummaryReporter({ outputFile });
    reporter.onBegin(fakeConfig('/somewhere/else/entirely'));
    await reporter.onEnd(fakeResult('passed'));

    expect(fs.existsSync(outputFile)).toBe(true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
