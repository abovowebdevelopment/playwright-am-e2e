# Changelog

## v1.0.0 — 2026-08-17

Initial release. Extracted from the hand-copied `tests/e2e/base.spec.ts` and
`tests/e2e/fixtures.ts` that every project carried.

### Added

- `@abovomaxlead/playwright-am-e2e` — `test` with the screenshot-path fixture,
  `expect`, and the `Page`, `Response`, `Locator`, `BrowserContext` types.
- `@abovomaxlead/playwright-am-e2e/config` — `defineE2EConfig()`.
- `@abovomaxlead/playwright-am-e2e/global` — `testHomepageLoads()`.
- `@abovomaxlead/playwright-am-e2e/abovo-basis` — `testThemeAssetsLoad()` and
  `ABOVO_BASIS_THEME_ASSETS`.
