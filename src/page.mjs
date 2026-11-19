// HTML page template. Page text comes from the rendered source files; this module only adds the
// document shell: head metadata, site header on inner pages, footer navigation.

export const SOCIAL_IMAGE = { path: '/assets/social.png', width: 1200, height: 630 };
const LOGO = '/assets/logo.png';

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Serializes JSON for an inline `<script>` element. */
export function inlineJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

/**
 * @param {object} options
 * @param {string} options.siteUrl Absolute site URL with a trailing slash.
 * @param {string} options.siteName
 * @param {string} options.path Site path of the page, e.g. `/security/`.
 * @param {string} options.title Page title (H1 of the source file).
 * @param {string} options.description
 * @param {string} options.body Page content HTML.
 * @param {{ path: string, title: string }[]} options.nav Footer navigation.
 * @param {string} options.githubUrl Organization URL on GitHub.
 * @param {boolean} [options.home] Home page: no site header, JSON-LD and verification tags.
 * @param {boolean} [options.noindex]
 * @param {object | null} [options.jsonLd]
 * @param {{ google?: string, bing?: string }} [options.verification]
 */
export function renderPage({
  siteUrl,
  siteName,
  path,
  title,
  description,
  body,
  nav,
  githubUrl,
  home = false,
  noindex = false,
  jsonLd = null,
  verification = {},
}) {
  const fullTitle = home ? siteName : `${title} · ${siteName}`;
  const canonical = new URL(path, siteUrl).href;
  const image = new URL(SOCIAL_IMAGE.path, siteUrl).href;
  const e = escapeHtml;

  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${e(fullTitle)}</title>`,
    `<meta name="description" content="${e(description)}">`,
    noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${e(canonical)}">`,
    '<meta name="color-scheme" content="light dark">',
    '<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">',
    '<meta name="theme-color" content="#0d1117" media="(prefers-color-scheme: dark)">',
    `<link rel="icon" href="/favicon.ico" sizes="any">`,
    `<link rel="icon" type="image/png" href="${LOGO}">`,
    `<link rel="apple-touch-icon" href="${LOGO}">`,
    '<link rel="stylesheet" href="/assets/github-markdown.css">',
    '<link rel="stylesheet" href="/assets/site.css">',
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${e(siteName)}">`,
    `<meta property="og:title" content="${e(fullTitle)}">`,
    `<meta property="og:description" content="${e(description)}">`,
    `<meta property="og:url" content="${e(canonical)}">`,
    `<meta property="og:image" content="${e(image)}">`,
    `<meta property="og:image:width" content="${SOCIAL_IMAGE.width}">`,
    `<meta property="og:image:height" content="${SOCIAL_IMAGE.height}">`,
    `<meta property="og:image:alt" content="${e(siteName)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${e(fullTitle)}">`,
    `<meta name="twitter:description" content="${e(description)}">`,
    `<meta name="twitter:image" content="${e(image)}">`,
  ];
  if (home && verification.google) {
    head.push(`<meta name="google-site-verification" content="${e(verification.google)}">`);
  }
  if (home && verification.bing) {
    head.push(`<meta name="msvalidate.01" content="${e(verification.bing)}">`);
  }
  if (jsonLd) head.push(`<script type="application/ld+json">${inlineJson(jsonLd)}</script>`);

  const header = home
    ? ''
    : `<header class="site-header"><a class="site-brand" href="/"><img src="${LOGO}" alt="" width="32" height="32"><span>${e(siteName)}</span></a></header>\n`;

  const navLinks = nav
    .map((item) => {
      const current = item.path === path ? ' aria-current="page"' : '';
      return `<a href="${e(item.path)}"${current}>${e(item.title)}</a>`;
    })
    .concat(`<a href="${e(githubUrl)}">GitHub</a>`)
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
${head.join('\n')}
</head>
<body>
<div class="page">
${header}<main class="markdown-body">
${body}
</main>
<footer class="site-footer">
<nav aria-label="Site">
${navLinks}
</nav>
</footer>
</div>
</body>
</html>
`;
}

/** JSON-LD for the home page, built from the organization profile. */
export function organizationJsonLd({ siteUrl, siteName, description, githubUrl }) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${siteUrl}#organization`,
        name: siteName,
        url: siteUrl,
        logo: new URL(LOGO, siteUrl).href,
        description,
        sameAs: [githubUrl],
      },
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}#website`,
        name: siteName,
        url: siteUrl,
        publisher: { '@id': `${siteUrl}#organization` },
      },
    ],
  };
}

/** Sitemap for the given absolute URLs. `lastmod` is optional (YYYY-MM-DD). */
export function renderSitemap(entries) {
  const urls = entries
    .map(({ loc, lastmod }) => {
      const mod = lastmod ? `<lastmod>${escapeHtml(lastmod)}</lastmod>` : '';
      return `  <url><loc>${escapeHtml(loc)}</loc>${mod}</url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export function renderRobots(siteUrl) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap.xml', siteUrl).href}\n`;
}
