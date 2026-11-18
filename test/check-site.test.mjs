import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { checkSite } from '../scripts/check-site.mjs';
import { renderPage, renderRobots, renderSitemap } from '../src/page.mjs';

const siteUrl = 'https://example.github.io/';
const nav = [
  { path: '/', title: 'Example' },
  { path: '/security/', title: 'Security' },
];
const page = (sitePath, body, extra = {}) =>
  renderPage({ siteUrl, siteName: 'Example', path: sitePath, title: 'T', description: 'D', body, nav, githubUrl: 'https://github.com/e', ...extra });

let dir;

async function write(file, data) {
  await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true });
  await fs.writeFile(path.join(dir, file), data);
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'site-check-'));
  for (const asset of ['favicon.ico', 'assets/logo.png', 'assets/social.png', 'assets/github-markdown.css', 'assets/site.css']) {
    await write(asset, 'x');
  }
  await write('index.html', page('/', '<h1 id="top">Home</h1><p><a href="/security/#scope">Scope</a> <a href="#top">Top</a></p>', { home: true }));
  await write('security/index.html', page('/security/', '<h1>Security</h1><h2 id="scope">Scope</h2>'));
  await write('404.html', page('/404.html', '<h1>Not found</h1>', { noindex: true }));
  await write('sitemap.xml', renderSitemap([{ loc: siteUrl }, { loc: `${siteUrl}security/` }]));
  await write('robots.txt', renderRobots(siteUrl));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('checkSite', () => {
  it('accepts a valid site', async () => {
    assert.deepEqual(await checkSite(dir), []);
  });

  it('reports missing files', async () => {
    await fs.rm(path.join(dir, 'favicon.ico'));
    const errors = await checkSite(dir);
    assert.ok(errors.includes('missing favicon.ico'), errors.join('\n'));
    assert.ok(errors.includes('index.html: broken link /favicon.ico'), errors.join('\n'));
  });

  it('reports broken links and anchors', async () => {
    await write('index.html', page('/', '<h1>Home</h1><a href="/nope/">x</a><a href="/security/#nope">y</a><a href="#gone">z</a>', { home: true }));
    const errors = await checkSite(dir);
    assert.ok(errors.includes('index.html: broken link /nope/'), errors.join('\n'));
    assert.ok(errors.includes('index.html: broken anchor /security/#nope'), errors.join('\n'));
    assert.ok(errors.includes('index.html: broken anchor #gone'), errors.join('\n'));
  });

  it('reports GitHub-specific leftovers', async () => {
    await write(
      'security/index.html',
      page('/security/', '<h1 id="user-content-x">S</h1><img src="https://camo.githubusercontent.com/a"><div class="highlight-source-mermaid"></div>'),
    );
    const errors = (await checkSite(dir)).join('\n');
    assert.match(errors, /GitHub id prefix/);
    assert.match(errors, /camo image proxy URL/);
    assert.match(errors, /unrendered Mermaid block/);
  });

  it('reports missing metadata and heading problems', async () => {
    await write('security/index.html', '<!doctype html><html><head><title>S</title></head><body><h1>A</h1><h1>B</h1></body></html>');
    const errors = (await checkSite(dir)).join('\n');
    assert.match(errors, /missing <html lang>/);
    assert.match(errors, /missing meta description/);
    assert.match(errors, /missing og:image/);
    assert.match(errors, /missing canonical link/);
    assert.match(errors, /expected one h1, found 2/);
  });

  it('reports pages missing from the sitemap and sitemap entries without pages', async () => {
    await write('sitemap.xml', renderSitemap([{ loc: siteUrl }, { loc: `${siteUrl}gone/` }]));
    const errors = await checkSite(dir);
    assert.ok(errors.includes('sitemap.xml: /gone/ does not exist'), errors.join('\n'));
    assert.ok(errors.includes('sitemap.xml: security/index.html is not listed'), errors.join('\n'));
  });
});
