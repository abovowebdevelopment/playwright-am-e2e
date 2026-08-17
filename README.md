# @abovomaxlead/playwright-am-e2e

Shared Playwright end-to-end base tests for Abovo websites. One place to fix a
smoke test that every site runs.

## Why registrar functions and not spec files

Playwright neither transpiles TypeScript nor discovers spec files inside
`node_modules`. A package therefore cannot ship tests that the runner picks up
on its own. Instead it exports functions that *register* tests, and each
project keeps a tiny spec file that calls the ones it wants.

## Install

In a project's `tests/e2e/package.json`:

```json
{
  "private": true,
  "dependencies": {
    "@abovomaxlead/playwright-am-e2e": "git+https://github.com/abovowebdevelopment/playwright-am-e2e#semver:^1.0.0"
  },
  "devDependencies": {
    "@playwright/test": "1.50.0"
  }
}
```

Keep `@playwright/test` pinned **exactly** to the version in the
`am-dev-playwright` image tag: `bin/e2e` compares the two and warns on drift,
and an exact pin is also what stops `npm update` from moving Playwright.

Tags must be three-part (`v1.0.0`). `#semver:` matches only valid semver tags —
a two-part tag such as `1.0` matches nothing and silently falls back to `main`.

## Usage

`tests/e2e/base.spec.ts`:

```ts
import { testHomepageLoads } from '@abovomaxlead/playwright-am-e2e/global';
import { testThemeAssetsLoad } from '@abovomaxlead/playwright-am-e2e/abovo-basis';

testHomepageLoads();
testThemeAssetsLoad();
```

`tests/e2e/playwright.config.ts`:

```ts
import { defineE2EConfig } from '@abovomaxlead/playwright-am-e2e/config';

export default defineE2EConfig();
```

Project-specific tests import the harness rather than `@playwright/test`, which
gets them the screenshot-path fixture:

```ts
import { expect, test } from '@abovomaxlead/playwright-am-e2e';
```

## Entry points

| Specifier | Contents |
| --- | --- |
| `@abovomaxlead/playwright-am-e2e` | `test`, `expect`, and the `Page`, `Response`, `Locator`, `BrowserContext` types |
| `@abovomaxlead/playwright-am-e2e/config` | `defineE2EConfig()` |
| `@abovomaxlead/playwright-am-e2e/global` | `testHomepageLoads()` — platform-agnostic |
| `@abovomaxlead/playwright-am-e2e/abovo-basis` | `testThemeAssetsLoad()`, `ABOVO_BASIS_THEME_ASSETS` |

Anything not listed is internal and may change in a patch release.

## Options

Every registrar takes one optional options object, and every one accepts
`tags` (default `['@all']`). Tags go through Playwright's `tag` option, so
`bin/e2e`'s `--grep "@<env>|@all"` selects them without cluttering titles.

```ts
testHomepageLoads({ path: './nl/', tags: ['@dev', '@staging'] });

testThemeAssetsLoad({
  assets: [
    ...ABOVO_BASIS_THEME_ASSETS,
    {
      label: 'critical css',
      filename: 'critical.css',
      domSelector: 'link[rel="stylesheet"][href]',
      urlAttribute: 'href',
    },
  ],
});
```

Navigate with relative paths only — `'./'`, `'./contact'`, never `'/contact'`.
Playwright resolves `goto()` against `baseURL` with the `URL()` constructor, so
a leading slash escapes a path-prefixed base URL such as `https://site/fr/`.

## Filtering base tests

Playwright attributes a test's location to the file where `test()` was called,
which for these suites is the package's compiled code — not your
`base.spec.ts`. So a filename filter does not match them:

```bash
e2e -- base.spec.ts          # no tests found
e2e -- --grep "homepage"     # works — filter by title or tag
```

Your own spec files are unaffected: their tests are registered in your file, so
they filter by filename normally. `bin/e2e`'s own `--grep "@<env>|@all"`
selection works on both, because tags and titles are matched, not paths.

## Updating

`bin/e2e` runs `npm update` before every test run, so a new in-range tag is
picked up automatically with no action in the project. A project that must not
move pins an exact ref instead — `#v1.2.3` — which `npm update` leaves alone.

## Development

The repo has no node service of its own; run everything in the shared
Playwright container:

```bash
pw() { docker exec -i --user "$(id -u):$(id -g)" -e HOME="$HOME" \
  -w /home/developer/projects/playwright-am-e2e am-dev-playwright "$@"; }

pw npm install
pw npm run typecheck
pw env E2E_BASE_URL=https://dentalclinics-nl.abovodevsites.nl/ npm test
```

The package's own tests import from `dist/`, so they exercise the artifact that
ships rather than the sources. `npm test` builds first.

## Releasing

SemVer is the contract every site depends on:

- **patch** — a base test fixed
- **minor** — a suite or option added
- **major** — a registrar renamed or removed, or its default behaviour changed

A bad tag reaches every site on its next `e2e` run, so:

1. `pw env E2E_BASE_URL=<a real abovo-basis dev site> npm test` — must pass.
2. `pw npm pack --dry-run` — must list `dist/`, must not list `src/`.
3. Bump `version` in `package.json`, add a `CHANGELOG.md` entry, commit.
4. `git tag vX.Y.Z && git push origin main --tags`.
