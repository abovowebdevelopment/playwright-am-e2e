import path from 'node:path';

/**
 * Resolves a `page.screenshot({ path })` argument against the run directory,
 * sandboxing it so nothing can write outside `<run>/`:
 *
 * - a relative path lands in `<run>/screenshots/<path>`
 * - a path with a leading slash is treated as anchored at the run
 *   directory's root, i.e. `/sub/b.jpg` -> `<run>/sub/b.jpg`
 *
 * This deliberately changes pre-1.1.0 behaviour, where an absolute path was
 * left alone and written wherever it pointed.
 *
 * `..` segments are rejected rather than silently normalised away: the
 * result is resolved and checked to still be inside the target base
 * (`<run>/screenshots` for a relative path, `<run>` for a leading-slash
 * path); if it would land outside, this throws instead of writing anywhere.
 */
export function resolveScreenshotPath(requestedPath: string, runDir: string): string {
  const isRootAnchored = requestedPath.startsWith('/') || requestedPath.startsWith('\\');
  const base = isRootAnchored ? runDir : path.join(runDir, 'screenshots');
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
