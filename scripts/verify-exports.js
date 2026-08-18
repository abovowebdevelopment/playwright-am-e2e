#!/usr/bin/env node
'use strict';

/**
 * Proves the package's `exports` map actually resolves the way consumers
 * will resolve it.
 *
 * All 19 Playwright tests in this repo import by relative path straight into
 * `dist/`, which bypasses the `exports` map entirely. Nothing else in the
 * release gates (build, typecheck, the test suite, `npm pack --dry-run`)
 * resolves a specifier the way a consuming project's `node_modules` install
 * would. So a rename in `src/`, or a typo in the `exports` map, can slip
 * through every other gate and only blow up at collection time on every
 * site's next `e2e` run, with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
 *
 * This script:
 *   1. Builds the package so `dist/` is current.
 *   2. Packs a real tarball with `npm pack` (proves `files`/.npmignore ship
 *      what `exports` points at, not just what's on disk in this repo).
 *   3. Installs that tarball into a scratch project.
 *   4. Resolves each public entry point the way a consumer would, and checks
 *      the expected named exports are present.
 *   5. Confirms an internal module is NOT reachable through the map.
 */

const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PACKAGE_ROOT = path.join(__dirname, '..');
const PACKAGE_NAME = '@abovomaxlead/playwright-am-e2e';

const ENTRY_POINTS = [
  {
    specifier: PACKAGE_NAME,
    expectedExports: ['test', 'expect'],
  },
  {
    specifier: `${PACKAGE_NAME}/config`,
    expectedExports: ['defineE2EConfig'],
  },
  {
    specifier: `${PACKAGE_NAME}/global`,
    expectedExports: ['testHomepageLoads'],
  },
  {
    specifier: `${PACKAGE_NAME}/wordpress/abovo-basis`,
    expectedExports: ['testThemeAssetsLoad', 'ABOVO_BASIS_THEME_ASSETS'],
  },
  {
    specifier: `${PACKAGE_NAME}/summary-reporter`,
    expectedExports: ['default', 'SummaryReporter'],
  },
  {
    specifier: `${PACKAGE_NAME}/package.json`,
    expectedExports: ['version'],
  },
];

const INTERNAL_SPECIFIER = `${PACKAGE_NAME}/internal/asset-url`;

function log(message) {
  process.stdout.write(`${message}\n`);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
    ...options,
  });
}

function main() {
  const failures = [];
  let scratchDir;
  let packOutputDir;

  try {
    log('== verify:exports ==');

    log('1. Building (npm run build)...');
    run('npm', ['run', 'build'], { cwd: PACKAGE_ROOT });

    log('2. Packing a real tarball (npm pack)...');
    packOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-am-e2e-pack-'));
    const packOutput = run('npm', ['pack', '--pack-destination', packOutputDir], {
      cwd: PACKAGE_ROOT,
    });
    const tarballName = packOutput.trim().split('\n').pop().trim();
    const tarballPath = path.join(packOutputDir, tarballName);
    if (!fs.existsSync(tarballPath)) {
      throw new Error(`Expected tarball at ${tarballPath}, but it does not exist.`);
    }

    log('3. Installing the tarball into a scratch project...');
    scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-am-e2e-scratch-'));
    fs.writeFileSync(
      path.join(scratchDir, 'package.json'),
      JSON.stringify({ name: 'verify-exports-scratch', private: true, version: '0.0.0' }, null, 2),
    );
    run('npm', ['install', '--no-save', '--ignore-scripts', tarballPath], { cwd: scratchDir });

    log('4. Resolving each entry point as a consumer would...');
    // Resolve as if `require` were called from a file inside the scratch dir,
    // without ever copying this script into that directory.
    const scratchRequire = createRequire(path.join(scratchDir, 'noop.js'));

    for (const entry of ENTRY_POINTS) {
      try {
        const resolved = scratchRequire(entry.specifier);
        const missing = entry.expectedExports.filter((name) => !(name in resolved));
        if (missing.length > 0) {
          failures.push(
            `${entry.specifier}: resolved, but missing expected export(s): ${missing.join(', ')}`,
          );
          log(`  FAIL  ${entry.specifier} (missing: ${missing.join(', ')})`);
        } else {
          log(`  OK    ${entry.specifier} (${entry.expectedExports.join(', ')})`);
        }
      } catch (error) {
        failures.push(`${entry.specifier}: failed to resolve — ${error.message}`);
        log(`  FAIL  ${entry.specifier} (${error.message})`);
      }
    }

    log('5. Confirming the internal module is NOT reachable through the map...');
    try {
      scratchRequire(INTERNAL_SPECIFIER);
      failures.push(
        `${INTERNAL_SPECIFIER}: resolved successfully, but it must NOT be reachable — ` +
          `the internal surface has leaked and can no longer change without a major bump.`,
      );
      log(`  FAIL  ${INTERNAL_SPECIFIER} (resolved, but should not be reachable)`);
    } catch (error) {
      log(`  OK    ${INTERNAL_SPECIFIER} correctly unreachable (${error.code || error.message})`);
    }
  } finally {
    if (scratchDir) {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
    if (packOutputDir) {
      fs.rmSync(packOutputDir, { recursive: true, force: true });
    }
  }

  if (failures.length > 0) {
    log('');
    log(`verify:exports FAILED (${failures.length} problem(s)):`);
    for (const failure of failures) {
      log(`  - ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  log('');
  log('verify:exports PASSED — all entry points resolve correctly.');
}

main();
