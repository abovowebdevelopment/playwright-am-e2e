import path from 'node:path';

/**
 * Resolves a `page.screenshot({ path })` argument against the run directory,
 * sandboxing it so nothing can write outside `<run>/`:
 *
 * - a relative path lands in `<run>/screenshots/<path>`, or in
 *   `<run>/screenshots/<project>/<path>` when a project name is given (a
 *   multi-target run, where every target replays the same tests)
 * - a path with a leading slash is treated as anchored at the run
 *   directory's root, i.e. `/sub/b.jpg` -> `<run>/sub/b.jpg`, and is NOT
 *   qualified by project: it is an explicit choice of location
 *
 * This deliberately changes pre-1.1.0 behaviour, where an absolute path was
 * left alone and written wherever it pointed.
 *
 * `..` segments are rejected rather than silently normalised away: the
 * result is resolved and checked to still be inside the target base
 * (`<run>/screenshots` for a relative path, `<run>` for a leading-slash
 * path); if it would land outside, this throws instead of writing anywhere.
 */
export function resolveScreenshotPath(
  requestedPath: string,
  runDir: string,
  projectName = '',
): string {
  const isRootAnchored = requestedPath.startsWith('/') || requestedPath.startsWith('\\');
  // A project name can carry a "/" (a path-prefixed target such as site.nl/fr),
  // which is fine as a nested directory but must not escape the sandbox — the
  // check below resolves against `base` and rejects anything outside it.
  const base = isRootAnchored
    ? runDir
    : path.join(runDir, 'screenshots', projectName);
  const relative = isRootAnchored ? requestedPath.slice(1) : requestedPath;

  const resolved = path.normalize(path.join(base, relative));
  const baseWithSep = base.endsWith(path.sep) ? base : base + path.sep;

  if (resolved !== base && !resolved.startsWith(baseWithSep)) {
    throw new Error(
      `page.screenshot(): path "${requestedPath}" escapes the run directory ` +
        `(resolved to ${resolved}, which is outside ${base}). Use a relative path ` +
        `(goes to <run>/screenshots/) or a leading-slash path anchored at the run root ` +
        `(<run>/), with no ".." segments that walk back out.`,
    );
  }

  return resolved;
}
