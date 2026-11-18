// Checks a built site: required files, page metadata, leftovers of GitHub-specific markup,
// internal links and anchors, sitemap coverage.
//
// Usage: node scripts/check-site.mjs <site dir>

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as cheerio from 'cheerio';

const REQUIRED_FILES = [
  'index.html',
  '404.html',
  'robots.txt',
  'sitemap.xml',
  'favicon.ico',
  'assets/logo.png',
  'assets/social.png',
  'assets/github-markdown.css',
  'assets/site.css',
];

// Markup that must not survive post-processing.
const FORBIDDEN = [
  ['user-content-', 'GitHub id prefix'],
  ['camo.githubusercontent.com', 'camo image proxy URL'],
  ['highlight-source-mermaid', 'unrendered Mermaid block'],
  ['data-diagram=', 'unfilled diagram placeholder'],
  ['markdown-heading', 'GitHub heading wrapper'],
];

const MAX_DESCRIPTION = 160;

async function listFiles(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name))])),
  );
  return files.flat().map((f) => f.split(path.sep).join('/'));
}

/** Maps a site path to the file that serves it, or null. */
function resolveSitePath(files, sitePath) {
  const clean = sitePath.replace(/^\//, '');
  if (clean === '' || clean.endsWith('/')) return files.has(`${clean}index.html`) ? `${clean}index.html` : null;
  if (files.has(clean)) return clean;
  if (files.has(`${clean}/index.html`)) return `${clean}/index.html`;
  return null;
}

/**
 * @param {string} siteDir
 * @returns {Promise<string[]>} Problems found; empty when the site is valid.
 */
export async function checkSite(siteDir) {
  const errors = [];
  const files = new Set(await listFiles(siteDir));
  for (const file of REQUIRED_FILES) {
    if (!files.has(file)) errors.push(`missing ${file}`);
  }

  const htmlFiles = [...files].filter((f) => f.endsWith('.html'));
  const docs = new Map();
  for (const file of htmlFiles) {
    const html = await fs.readFile(path.join(siteDir, file), 'utf8');
    docs.set(file, { html, $: cheerio.load(html) });
  }
  const ids = (file) => new Set(docs.get(file).$('[id]').map((_, el) => docs.get(file).$(el).attr('id')).get());

  for (const [file, { html, $ }] of docs) {
    const at = (message) => errors.push(`${file}: ${message}`);
    const meta = (selector) => $(selector).attr('content')?.trim();

    if (!$('html').attr('lang')) at('missing <html lang>');
    if (!$('title').text().trim()) at('missing <title>');
    const description = meta('meta[name="description"]');
    if (!description) at('missing meta description');
    else if (description.length > MAX_DESCRIPTION) at(`meta description is ${description.length} characters`);
    for (const property of ['og:title', 'og:description', 'og:url', 'og:image']) {
      if (!meta(`meta[property="${property}"]`)) at(`missing ${property}`);
    }
    if (!meta('meta[name="twitter:card"]')) at('missing twitter:card');
    const noindex = meta('meta[name="robots"]')?.includes('noindex');
    if (!noindex && !$('link[rel="canonical"]').attr('href')) at('missing canonical link');
    if ($('h1').length !== 1) at(`expected one h1, found ${$('h1').length}`);

    for (const [needle, label] of FORBIDDEN) {
      if (html.includes(needle)) at(`contains ${label} (${needle})`);
    }

    const image = meta('meta[property="og:image"]');
    if (image && !resolveSitePath(files, new URL(image).pathname)) at(`og:image ${image} does not exist`);

    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        JSON.parse($(el).text());
      } catch (error) {
        at(`invalid JSON-LD: ${error.message}`);
      }
    });

    const own = ids(file);
    $('a[href], link[href], img[src], script[src]').each((_, el) => {
      const ref = $(el).attr('href') ?? $(el).attr('src');
      if (ref.startsWith('#')) {
        if (ref.length > 1 && !own.has(decodeURIComponent(ref.slice(1)))) at(`broken anchor ${ref}`);
        return;
      }
      if (!ref.startsWith('/') || ref.startsWith('//')) return;
      const [pathname, fragment] = ref.split('#');
      const target = resolveSitePath(files, pathname);
      if (!target) at(`broken link ${ref}`);
      else if (fragment && target.endsWith('.html') && !ids(target).has(decodeURIComponent(fragment))) {
        at(`broken anchor ${ref}`);
      }
    });
  }

  if (files.has('sitemap.xml')) {
    const sitemap = await fs.readFile(path.join(siteDir, 'sitemap.xml'), 'utf8');
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    const listed = new Set();
    for (const loc of locs) {
      const target = resolveSitePath(files, loc);
      if (!target) errors.push(`sitemap.xml: ${loc} does not exist`);
      else listed.add(target);
    }
    for (const file of htmlFiles) {
      if (file !== '404.html' && !listed.has(file)) errors.push(`sitemap.xml: ${file} is not listed`);
    }
  }
  if (files.has('robots.txt')) {
    const robots = await fs.readFile(path.join(siteDir, 'robots.txt'), 'utf8');
    if (!/^Sitemap: \S+\/sitemap\.xml$/m.test(robots)) errors.push('robots.txt: missing Sitemap line');
  }

  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/check-site.mjs <site dir>');
    process.exit(2);
  }
  const errors = await checkSite(dir);
  if (errors.length) {
    for (const error of errors) console.error(`error: ${error}`);
    console.error(`${errors.length} problem(s) found`);
    process.exit(1);
  }
  console.log(`${dir}: all checks passed`);
}
