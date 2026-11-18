// Builds the site from a checkout of the source repository.
//
// Usage: node src/build.mjs --source <dir> [--out _site]
//
// Environment:
//   GITHUB_TOKEN              Optional token for the GitHub Markdown API (raises rate limits).
//   SITE_URL                  Overrides the public site URL, e.g. for a preview deployment.
//   GOOGLE_SITE_VERIFICATION  Optional Google Search Console verification token.
//   BING_SITE_VERIFICATION    Optional Bing Webmaster Tools verification token.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { launchBrowser, renderDiagram, renderSocialImage } from './browser.mjs';
import { renderMarkdown } from './github.mjs';
import { pngToIco } from './ico.mjs';
import { organizationJsonLd, renderPage, renderRobots, renderSitemap, SOCIAL_IMAGE } from './page.mjs';
import { createLinkResolver, SITE, sourceUrls } from './site.mjs';
import { fillDiagrams, transform } from './transform.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const { values: args } = parseArgs({
  options: {
    source: { type: 'string' },
    out: { type: 'string', default: '_site' },
  },
});
if (!args.source) {
  console.error('Usage: node src/build.mjs --source <checkout of bimeron/.github> [--out _site]');
  process.exit(2);
}

const sourceDir = path.resolve(args.source);
const outDir = path.resolve(args.out);
const siteUrl = new URL(process.env.SITE_URL || SITE.url).href;
const githubUrl = `https://github.com/${SITE.org}`;
const { blobBase, rawBase } = sourceUrls(SITE);
const resolveLink = createLinkResolver(SITE);

/** Date of the last commit that touched a file, or null if the source is not a git checkout. */
function lastModified(file) {
  try {
    const date = execFileSync('git', ['-C', sourceDir, 'log', '-1', '--format=%cs', '--', file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return date || null;
  } catch {
    return null;
  }
}

async function writeFile(sitePath, data) {
  const file = path.join(outDir, ...sitePath.split('/').filter(Boolean));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
}

const outFile = (sitePath) => (sitePath.endsWith('/') ? `${sitePath}index.html` : sitePath);

async function main() {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  // Render and post-process every page.
  const pages = [];
  for (const page of SITE.pages) {
    const markdown = await fs.readFile(path.join(sourceDir, page.source), 'utf8');
    const html = await renderMarkdown(markdown, { token: process.env.GITHUB_TOKEN });
    const result = transform(html, { docPath: page.source, resolveLink, blobBase, rawBase });
    if (!result.title) throw new Error(`${page.source} has no h1 heading`);
    if (!result.description) throw new Error(`${page.source} has no paragraph for the description`);
    pages.push({ ...page, ...result, lastmod: lastModified(page.source) });
    console.log(`rendered ${page.source} -> ${page.path}`);
  }
  const home = pages.find((p) => p.path === '/');
  const siteName = home.title;
  const logoAsset = SITE.assets.find((a) => a.path === '/assets/logo.png');
  const logo = await fs.readFile(path.join(sourceDir, logoAsset.source));

  // Browser work: diagrams and the social image.
  const browser = await launchBrowser();
  try {
    for (const [index, page] of pages.entries()) {
      const svgs = [];
      for (const [n, source] of page.diagrams.entries()) {
        svgs.push(await renderDiagram(browser, source, `diagram-${index}-${n}`));
      }
      fillDiagrams(page.$, svgs);
      if (svgs.length) console.log(`rendered ${svgs.length} diagram(s) for ${page.path}`);
    }
    const social = await renderSocialImage(browser, {
      title: siteName,
      description: home.description,
      host: new URL(siteUrl).host,
      logo,
    });
    await writeFile(SOCIAL_IMAGE.path, social);
  } finally {
    await browser.close();
  }

  // Static assets.
  for (const asset of SITE.assets) {
    await writeFile(asset.path, await fs.readFile(path.join(sourceDir, asset.source)));
  }
  await writeFile('/favicon.ico', pngToIco(logo));
  await writeFile(
    '/assets/github-markdown.css',
    await fs.readFile(path.join(ROOT, 'node_modules/github-markdown-css/github-markdown.css')),
  );
  await writeFile('/assets/site.css', await fs.readFile(path.join(ROOT, 'src/site.css')));

  // Pages.
  const nav = pages.filter((p) => p.path !== '/').map((p) => ({ path: p.path, title: p.title }));
  nav.unshift({ path: '/', title: siteName });
  for (const page of pages) {
    const isHome = page.path === '/';
    const html = renderPage({
      siteUrl,
      siteName,
      path: page.path,
      title: page.title,
      description: page.description,
      body: page.$.html(),
      nav,
      githubUrl,
      source: { url: new URL(page.source, blobBase).href, label: `${SITE.sourceRepo}/${page.source}` },
      home: isHome,
      jsonLd: isHome ? organizationJsonLd({ siteUrl, siteName, description: page.description, githubUrl }) : null,
      verification: {
        google: process.env.GOOGLE_SITE_VERIFICATION,
        bing: process.env.BING_SITE_VERIFICATION,
      },
    });
    await writeFile(outFile(page.path), html);
  }

  await writeFile(
    '/404.html',
    renderPage({
      siteUrl,
      siteName,
      path: '/404.html',
      title: 'Page not found',
      description: home.description,
      body: '<h1>Page not found</h1>\n<p>This page does not exist. Go to the <a href="/">home page</a>.</p>',
      nav,
      githubUrl,
      noindex: true,
    }),
  );

  await writeFile(
    '/sitemap.xml',
    renderSitemap(pages.map((p) => ({ loc: new URL(p.path, siteUrl).href, lastmod: p.lastmod }))),
  );
  await writeFile('/robots.txt', renderRobots(siteUrl));
  console.log(`site written to ${path.relative(process.cwd(), outDir) || '.'}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
