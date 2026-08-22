/**
 * Astro is configured to emit flat files, so the home page builds to
 * /index.html and every other page to e.g. /docs/errors.html. Firebase serves
 * those with cleanUrls, meaning the URL a visitor sees has no extension and the
 * home page is "/". Canonical tags and nav highlighting have to match what the
 * visitor sees, not what the build emitted.
 */
export function canonicalPath(pathname: string): string {
  let path = pathname.replace(/\.html$/, '');
  path = path.replace(/\/index$/, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path || '/';
}
