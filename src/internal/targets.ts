import fs from 'node:fs';
import path from 'node:path';

/**
 * The per-project targets file: `tests/e2e/e2e.targets.json`.
 *
 * It answers a question the runner cannot: which base URLs make up this
 * project, per environment. A dev/staging URL can be derived from
 * `.webconfig.env`, but the extra sites of a multisite cannot, and a
 * production URL cannot be guessed at all.
 *
 * Top-level keys ARE environment tag names — `dev`, `staging`, `sla`,
 * `production`, or anything a project invents — so a new environment needs no
 * change to `bin/e2e`. A leading `@` on a key is accepted and ignored, since
 * the tag is written `@dev` in the specs themselves.
 *
 *   {
 *     "dev": [
 *       { "url": "https://site-nl.abovodevsites.nl/" },
 *       { "url": ["https://site-com.abovodevsites.nl/",
 *                 "https://site-be.abovodevsites.nl/"],
 *         "tags": "@custom-multisite" }
 *     ],
 *     "production": [
 *       { "url": "https://site.nl/" },
 *       { "url": "https://site.com/", "tags": ["@custom-multisite"] }
 *     ]
 *   }
 *
 * A target's `url` may be a string or an array (the same tags applied to
 * several sites), and may be omitted entirely to mean "the URL the runner
 * resolved". `tags` may be a string or an array; a leading `@` is optional.
 * A bare string is shorthand for `{ "url": "<string>" }`.
 *
 * `project` names the target, and is spelled exactly as the flag that selects
 * it: `{ "project": "com" }` is run alone with `--project=com`. Reuse the same
 * value for the same site in every environment — omitted, it is derived from
 * the host instead, which makes it depend on the URLs.
 */

export const TARGETS_FILENAME = 'e2e.targets.json';

/** One resolved target: exactly one base URL, with the tags it selects. */
export interface ResolvedTarget {
  /** Playwright project name — unique within the run. */
  name: string;
  /** Base URL, always with a trailing slash. */
  baseURL: string;
  /** Full tag names (`@custom-x`), empty when the target is untagged. */
  tags: string[];
}

interface RawTarget {
  url?: string | string[];
  tags?: string | string[];
  /** Playwright project name — deliberately spelled as the flag selects it. */
  project?: string;
}

const asArray = <T>(value: T | T[] | undefined): T[] => {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

/** Tags are written `@dev` in specs, so accept a key either way. */
const stripLeadingAt = (value: string): string => value.replace(/^@/, '');

/** `goto('./x')` resolves against baseURL, and a slash-less base drops its last segment. */
const withTrailingSlash = (url: string): string => (url.endsWith('/') ? url : `${url}/`);

/**
 * Reads and validates the targets file, returning `undefined` when there is
 * none — the signal to keep the runner's existing single-URL behaviour.
 *
 * Throws on a malformed file rather than falling back silently: a typo in the
 * env key or a misspelled `url` would otherwise look like a passing run that
 * quietly tested one URL instead of four.
 */
export function readTargetsFile(dir: string): Record<string, unknown> | undefined {
  const file = path.join(dir, TARGETS_FILENAME);

  let contents: string;
  try {
    contents = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    throw new Error(`${TARGETS_FILENAME}: not valid JSON — ${(error as Error).message}`);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `${TARGETS_FILENAME}: expected an object keyed by environment tag ` +
        `(e.g. { "dev": [...], "production": [...] }).`,
    );
  }

  return parsed as Record<string, unknown>;
}

/**
 * Names a single target the same way a declared one is named, so a run that
 * falls back to the resolved URL still reports which site it hit instead of
 * showing a blank label.
 */
export function deriveTargetName(url: string): string {
  try {
    return nameTargets([new URL(url)])[0] ?? '';
  } catch {
    return '';
  }
}

/** Looks up an env's targets, tolerating both `dev` and `@dev` as the key. */
function selectEnvEntry(file: Record<string, unknown>, envTag: string): unknown {
  const wanted = stripLeadingAt(envTag).toLowerCase();

  for (const [key, value] of Object.entries(file)) {
    if (stripLeadingAt(key).toLowerCase() === wanted) {
      return value;
    }
  }

  return undefined;
}

/**
 * Names a target that declared no `project` after the shortest suffix of its
 * host that is unique among the run's targets, so dev sites under one apex read as `site-nl` /
 * `site-com` while production hosts that share a first label still separate
 * as `site.nl` / `site.com`. A non-root path is appended, because one host
 * can appear twice under different language prefixes.
 */
function nameTargets(urls: URL[]): string[] {
  const labels = urls.map((url) => {
    const parts = url.hostname.split('.');
    // A leading "www" names nothing — www.site.nl would become "www". Drop it,
    // unless it is the whole hostname.
    return parts[0] === 'www' && parts.length > 1 ? parts.slice(1) : parts;
  });
  const depth = Math.max(...labels.map((parts) => parts.length));

  let hostNames = labels.map((parts) => parts[0] ?? '');
  for (let take = 1; take <= depth; take++) {
    const candidate = labels.map((parts) => parts.slice(0, take).join('.'));
    hostNames = candidate;
    if (new Set(candidate).size === urls.length) {
      break;
    }
  }

  const withPaths = hostNames.map((host, index) => {
    const pathname = urls[index]!.pathname.replace(/^\/|\/$/g, '');
    return pathname === '' ? host : `${host}/${pathname}`;
  });

  // Two targets can still collide on identical URL + different tags.
  const seen = new Map<string, number>();
  return withPaths.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name}#${count + 1}`;
  });
}

/**
 * Resolves the targets for one environment.
 *
 * Returns `undefined` when the file has no entry for this environment — the
 * caller then behaves exactly as it did before the file existed, which is the
 * point: a project only declares the environments it actually has extra sites
 * for.
 */
export function resolveTargets(
  file: Record<string, unknown>,
  envTag: string,
  fallbackURL: string | undefined,
): ResolvedTarget[] | undefined {
  const entry = selectEnvEntry(file, envTag);
  if (entry === undefined || entry === null) {
    return undefined;
  }

  const rawTargets = (Array.isArray(entry) ? entry : [entry]) as Array<RawTarget | string>;
  if (rawTargets.length === 0) {
    return undefined;
  }

  const flattened: Array<{ url: string; tags: string[]; project?: string }> = [];

  for (const raw of rawTargets) {
    const target: RawTarget = typeof raw === 'string' ? { url: raw } : raw;

    if (target === null || typeof target !== 'object') {
      throw new Error(
        `${TARGETS_FILENAME}: each target under "${envTag}" must be an object or a URL string.`,
      );
    }

    const urls = asArray(target.url);
    if (urls.length === 0) {
      if (fallbackURL === undefined) {
        throw new Error(
          `${TARGETS_FILENAME}: a target under "${envTag}" omits "url", which means ` +
            `"the URL the runner resolved" — but no base URL was provided. ` +
            `Give the target an explicit "url".`,
        );
      }
      urls.push(fallbackURL);
    }

    const tags = asArray(target.tags).map((tag) => {
      if (typeof tag !== 'string' || tag.trim() === '') {
        throw new Error(`${TARGETS_FILENAME}: a tag under "${envTag}" must be a non-empty string.`);
      }
      return `@${stripLeadingAt(tag.trim())}`;
    });

    // One name cannot label two sites: Playwright project names must be unique,
    // and "which site failed" would be unanswerable from the output.
    if (target.project !== undefined && urls.length > 1) {
      throw new Error(
        `${TARGETS_FILENAME}: the target named "${target.project}" under "${envTag}" lists ` +
          `${urls.length} urls, but a "project" name can only label one. Split it into ` +
          `one target per url, each with its own "project".`,
      );
    }

    for (const url of urls) {
      if (typeof url === 'string' && url.trim() === '') {
        // The shipped template carries an empty "url" for exactly this reason:
        // the URL of an environment like production cannot be derived, so it is
        // left blank to be filled in, and running that environment before it is
        // filled in has to say so plainly.
        throw new Error(
          `no URL is set for "${envTag}" — the "url" in ${TARGETS_FILENAME} is empty.\n` +
            `Fill in the ${envTag} URL (it cannot be derived), or remove the ` +
            `"${envTag}" block until you have it.`,
        );
      }
      if (typeof url !== 'string') {
        throw new Error(`${TARGETS_FILENAME}: a "url" under "${envTag}" must be a non-empty string.`);
      }
      flattened.push({ url: withTrailingSlash(url.trim()), tags, project: target.project });
    }
  }

  const parsedURLs = flattened.map(({ url }) => {
    try {
      return new URL(url);
    } catch {
      throw new Error(`${TARGETS_FILENAME}: "${url}" under "${envTag}" is not a valid URL.`);
    }
  });

  const generatedNames = nameTargets(parsedURLs);

  return flattened.map((target, index) => ({
    name: target.project ?? generatedNames[index]!,
    baseURL: target.url,
    tags: target.tags,
  }));
}

/**
 * Builds the per-target selection.
 *
 * Every target runs the environment's normal suite — `@<env>|@all` — because a
 * declared site is a real site: its homepage and assets deserve checking
 * whatever else it is for.
 *
 * On top of that, `@custom-*` tags decide *which* site a test belongs to. A
 * test carrying one runs only on the targets that ask for it, so the tag is
 * how a spec says "point me at the splash site", and `grepInvert` is what
 * keeps it off every other target:
 *
 * - a target with no tags excludes every `@custom-*` test (`/@custom-/`)
 * - a target with tags excludes only the `@custom-*` tests it did NOT ask for
 *   (`/@custom-(?!language-select(?![\w.-]))/`), so its own come through
 *
 * The environment tag keeps filtering either way: a test tagged `@dev` +
 * `@custom-x` still stays out of a staging run.
 */
export function targetSelection(target: ResolvedTarget, envTag: string): {
  grep: RegExp;
  grepInvert: RegExp;
} {
  const grep = new RegExp(`@${stripLeadingAt(envTag)}|@all`);

  if (target.tags.length === 0) {
    return { grep, grepInvert: /@custom-/ };
  }

  // Match the reserved prefix only when what follows is NOT one of this
  // target's own tags. The trailing (?![\w.-]) stops "@custom-nl" from being
  // treated as a match for a requested "@custom-nl-shop".
  const wanted = target.tags
    .map((tag) => stripLeadingAt(tag).replace(/^custom-/, ''))
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  return {
    grep,
    grepInvert: new RegExp(`@custom-(?!(?:${wanted.join('|')})(?![\\w.-]))`),
  };
}
