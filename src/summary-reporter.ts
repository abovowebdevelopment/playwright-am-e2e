import fs from 'node:fs';
import path from 'node:path';
import type { FullConfig, FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

export type SummaryReporterOptions = {
  /** Where to write summary.json. Relative paths resolve against config.rootDir. */
  outputFile?: string;
};

type Counts = {
  passed: number;
  failed: number;
  skipped: number;
  interrupted: number;
};

/**
 * Compact, machine-readable run summary — pass/fail/skip counts, total
 * duration, the base URL, the environment tag, the start timestamp, and the
 * Playwright version. Nothing speculative beyond that.
 *
 * Registered by `defineE2EConfig()` at `./summary-reporter` (a dedicated
 * `exports` entry point) so Playwright, which resolves reporters by module
 * path, can require it from a consuming project's `node_modules`.
 */
export class SummaryReporter implements Reporter {
  private readonly outputFile: string;
  private config?: FullConfig;
  private startedAt = 0;
  private counts: Counts = { passed: 0, failed: 0, skipped: 0, interrupted: 0 };

  constructor(options: SummaryReporterOptions = {}) {
    this.outputFile = options.outputFile ?? 'summary.json';
  }

  onBegin(config: FullConfig): void {
    this.config = config;
    this.startedAt = Date.now();
  }

  onTestEnd(_test: TestCase, result: TestResult): void {
    switch (result.status) {
      case 'passed':
        this.counts.passed += 1;
        break;
      case 'timedOut':
      case 'failed':
        this.counts.failed += 1;
        break;
      case 'skipped':
        this.counts.skipped += 1;
        break;
      case 'interrupted':
        this.counts.interrupted += 1;
        break;
    }
  }

  async onEnd(result: FullResult): Promise<void> {
    const summary = {
      status: result.status,
      counts: { ...this.counts },
      durationMs: Date.now() - this.startedAt,
      baseURL: process.env.E2E_BASE_URL ?? null,
      environment: process.env.AM_DEV_INFRA_ENV ?? null,
      startedAt: new Date(this.startedAt).toISOString(),
      playwrightVersion: readPlaywrightVersion(),
    };

    const outputFile = this.resolveOutputFile();
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, `${JSON.stringify(summary, null, 2)}\n`);
  }

  private resolveOutputFile(): string {
    if (path.isAbsolute(this.outputFile)) {
      return this.outputFile;
    }

    const rootDir = this.config?.rootDir ?? process.cwd();
    return path.join(rootDir, this.outputFile);
  }
}

function readPlaywrightVersion(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require('@playwright/test/package.json') as { version: string };
  return pkg.version;
}

export default SummaryReporter;
