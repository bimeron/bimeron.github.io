// Site configuration: which source files become pages and how links to them are mapped.

export const SITE = {
  url: 'https://bimeron.github.io/',
  org: 'bimeron',
  sourceRepo: 'bimeron/.github',
  sourceBranch: 'main',
  pages: [
    { source: 'profile/README.md', path: '/' },
    { source: 'CONTRIBUTING.md', path: '/contributing/' },
    { source: 'SECURITY.md', path: '/security/' },
    { source: 'SUPPORT.md', path: '/support/' },
  ],
  // Files from the source repository that are copied into the site and served locally.
  assets: [{ source: 'profile/bimeron.png', path: '/assets/logo.png' }],
};

/**
 * Builds the link resolver used by `transform`: links to source files the site renders become
 * site URLs, links to copied assets become local paths, everything else is left alone.
 * @param {typeof SITE} site
 * @returns {(target: URL) => string | null}
 */
export function createLinkResolver(site) {
  const pages = new Map(site.pages.map((p) => [p.source.toLowerCase(), p.path]));
  const assets = new Map(site.assets.map((a) => [a.source.toLowerCase(), a.path]));
  const blobPrefix = `/${site.sourceRepo}/blob/${site.sourceBranch}/`.toLowerCase();
  const rawPrefix = `/${site.sourceRepo}/${site.sourceBranch}/`.toLowerCase();

  return (target) => {
    const pathname = decodeURIComponent(target.pathname).toLowerCase();
    if (target.hostname === 'github.com' && pathname.startsWith(blobPrefix)) {
      const file = pathname.slice(blobPrefix.length);
      if (pages.has(file)) return pages.get(file) + target.hash;
      if (assets.has(file)) return assets.get(file);
    }
    if (target.hostname === 'raw.githubusercontent.com' && pathname.startsWith(rawPrefix)) {
      const file = pathname.slice(rawPrefix.length);
      if (assets.has(file)) return assets.get(file);
    }
    return null;
  };
}

/** GitHub URLs of the source repository at the configured branch. */
export function sourceUrls(site) {
  return {
    blobBase: `https://github.com/${site.sourceRepo}/blob/${site.sourceBranch}/`,
    rawBase: `https://raw.githubusercontent.com/${site.sourceRepo}/${site.sourceBranch}/`,
  };
}
