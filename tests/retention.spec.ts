import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { DEFAULT_KEEP_RUNS, pruneOldRuns } from '../dist/internal/retention';
import globalSetup from '../dist/internal/retention';

// Pure-logic tests against a scratch directory of fake run dirs — never the
// real test-results/, so a bug here cannot delete real results.

function makeRunDirs(root: string, names: string[]): void {
  for (const name of names) {
    fs.mkdirSync(path.join(root, name));
  }
}

function withScratchDir(run: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-am-e2e-retention-'));
  try {
    run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const RUN_IDS = [
  '20260101-000000',
  '20260102-000000',
  '20260103-000000',
  '20260104-000000',
  '20260105-000000',
];

test('DEFAULT_KEEP_RUNS is 3', () => {
  expect(DEFAULT_KEEP_RUNS).toBe(3);
});

test('keeps exactly the newest N by name and deletes the rest', () => {
  withScratchDir((dir) => {
    makeRunDirs(dir, RUN_IDS);
    const currentRunId = RUN_IDS[RUN_IDS.length - 1];

    const removed = pruneOldRuns(dir, currentRunId, 3);

    expect(removed).toBe(2);
    const remaining = fs.readdirSync(dir).sort();
    expect(remaining).toEqual(RUN_IDS.slice(-3));
  });
});

test('counts the current run against the budget when its directory does not exist yet', () => {
  withScratchDir((dir) => {
    // The real ordering: globalSetup prunes before Playwright's reporters and
    // outputDir create test-results/<currentRunId>/, so only the previous runs
    // are on disk. The current run still has to fit inside keepRuns.
    const previousRuns = RUN_IDS.slice(0, 4);
    makeRunDirs(dir, previousRuns);
    const currentRunId = '20260106-000000';

    const removed = pruneOldRuns(dir, currentRunId, 3);

    expect(removed).toBe(2);
    const remaining = fs.readdirSync(dir).sort();
    expect(remaining).toEqual(previousRuns.slice(-2));
    // Two survivors plus the run about to be written = keepRuns, not keepRuns + 1.
    expect(remaining.length + 1).toBe(3);
  });
});

test('default keep count (no explicit N) matches DEFAULT_KEEP_RUNS via the globalSetup entry point', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-am-e2e-retention-'));
  try {
    makeRunDirs(dir, RUN_IDS);
    const currentRunId = RUN_IDS[RUN_IDS.length - 1];

    const previousDir = process.env.E2E_TEST_RESULTS_DIR;
    const previousRunId = process.env.E2E_RUN_ID;
    const previousKeep = process.env.E2E_KEEP_RUNS;
    delete process.env.E2E_KEEP_RUNS;
    process.env.E2E_TEST_RESULTS_DIR = dir;
    process.env.E2E_RUN_ID = currentRunId;

    try {
      await globalSetup();
    } finally {
      if (previousDir === undefined) {
        delete process.env.E2E_TEST_RESULTS_DIR;
      } else {
        process.env.E2E_TEST_RESULTS_DIR = previousDir;
      }
      if (previousRunId === undefined) {
        delete process.env.E2E_RUN_ID;
      } else {
        process.env.E2E_RUN_ID = previousRunId;
      }
      if (previousKeep === undefined) {
        delete process.env.E2E_KEEP_RUNS;
      } else {
        process.env.E2E_KEEP_RUNS = previousKeep;
      }
    }

    const remaining = fs.readdirSync(dir).sort();
    expect(remaining).toEqual(RUN_IDS.slice(-DEFAULT_KEEP_RUNS));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('E2E_KEEP_RUNS overrides the default', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-am-e2e-retention-'));
  try {
    makeRunDirs(dir, RUN_IDS);
    const currentRunId = RUN_IDS[RUN_IDS.length - 1];

    const previousDir = process.env.E2E_TEST_RESULTS_DIR;
    const previousRunId = process.env.E2E_RUN_ID;
    const previousKeep = process.env.E2E_KEEP_RUNS;
    process.env.E2E_TEST_RESULTS_DIR = dir;
    process.env.E2E_RUN_ID = currentRunId;
    process.env.E2E_KEEP_RUNS = '2';

    try {
      await globalSetup();
    } finally {
      if (previousDir === undefined) {
        delete process.env.E2E_TEST_RESULTS_DIR;
      } else {
        process.env.E2E_TEST_RESULTS_DIR = previousDir;
      }
      if (previousRunId === undefined) {
        delete process.env.E2E_RUN_ID;
      } else {
        process.env.E2E_RUN_ID = previousRunId;
      }
      if (previousKeep === undefined) {
        delete process.env.E2E_KEEP_RUNS;
      } else {
        process.env.E2E_KEEP_RUNS = previousKeep;
      }
    }

    const remaining = fs.readdirSync(dir).sort();
    expect(remaining).toEqual(RUN_IDS.slice(-2));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('never deletes the current run, even if it were not the lexicographic max', () => {
  withScratchDir((dir) => {
    makeRunDirs(dir, RUN_IDS);
    // Pretend the "current" run is actually the oldest name, an edge case
    // that should never happen in practice (clocks move forward) but the
    // guardrail must hold regardless.
    const currentRunId = RUN_IDS[0];

    pruneOldRuns(dir, currentRunId, 1);

    const remaining = fs.readdirSync(dir).sort();
    expect(remaining).toContain(currentRunId);
  });
});

test('ignores entries that do not match the run-id pattern, and never deletes them', () => {
  withScratchDir((dir) => {
    makeRunDirs(dir, RUN_IDS);
    fs.mkdirSync(path.join(dir, 'not-a-run-dir'));
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'keep me');

    pruneOldRuns(dir, RUN_IDS[RUN_IDS.length - 1], 1);

    const remaining = fs.readdirSync(dir).sort();
    expect(remaining).toContain('not-a-run-dir');
    expect(remaining).toContain('notes.txt');
  });
});

test('never follows a symlink even if its name matches the run-id pattern', () => {
  withScratchDir((dir) => {
    makeRunDirs(dir, RUN_IDS.slice(0, 1));
    const realTarget = path.join(dir, 'real-target');
    fs.mkdirSync(realTarget);
    fs.writeFileSync(path.join(realTarget, 'sentinel.txt'), 'do not delete me');

    const symlinkRunId = '20260101-999999';
    fs.symlinkSync(realTarget, path.join(dir, symlinkRunId), 'dir');

    pruneOldRuns(dir, RUN_IDS[0], 1);

    // The symlink itself may or may not be pruned as a directory entry name,
    // but its target must never be touched.
    expect(fs.existsSync(path.join(realTarget, 'sentinel.txt'))).toBe(true);
  });
});

test('a missing test-results directory prunes nothing and does not throw', () => {
  withScratchDir((dir) => {
    const missing = path.join(dir, 'does-not-exist');
    expect(pruneOldRuns(missing, RUN_IDS[0], 3)).toBe(0);
  });
});
