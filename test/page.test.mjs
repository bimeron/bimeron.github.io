import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as cheerio from 'cheerio';

import { pngToIco } from '../src/ico.mjs';
import { inlineJson, organizationJsonLd, renderPage, renderRobots, renderSitemap } from '../src/page.mjs';
import { createLinkResolver, SITE } from '../src/site.mjs';

const base = {
  siteUrl: 'https://example.github.io/',
  siteName: 'Example & Co',
  description: 'A "quoted" description.',
  body: '<h1>Title</h1><p>Body</p>',
  nav: [
    { path: '/', title: 'Example & Co' },
    { path: '/security/', title: 'Security policy' },
  ],
  githubUrl: 'https://github.com/example',
};

describe('renderPage', () => {
  it('uses the site name as the home page title and adds verification tags', () => {
    const $ = cheerio.load(
      renderPage({ ...base, path: '/', title: 'Example & Co', home: true, verification: { google: 'g-token', bing: 'b-token' } }),
    );
    assert.equal($('title').text(), 'Example & Co');
    assert.equal($('meta[name="google-site-verification"]').attr('content'), 'g-token');
    assert.equal($('meta[name="msvalidate.01"]').attr('content'), 'b-token');
    assert.equal($('.site-header').length, 0);
  });

  it('omits verification tags when no token is configured', () => {
    const $ = cheerio.load(renderPage({ ...base, path: '/', title: 'Example & Co', home: true }));
    assert.equal($('meta[name="google-site-verification"]').length, 0);
    assert.equal($('meta[name="msvalidate.01"]').length, 0);
  });

  it('adds the site name to inner page titles and shows the header', () => {
    const $ = cheerio.load(renderPage({ ...base, path: '/security/', title: 'Security policy' }));
    assert.equal($('title').text(), 'Security policy · Example & Co');
    assert.equal($('.site-header a').attr('href'), '/');
    assert.equal($('footer a[aria-current="page"]').attr('href'), '/security/');
  });

  it('escapes metadata and sets absolute canonical and image URLs', () => {
    const html = renderPage({ ...base, path: '/security/', title: 'Security policy' });
    assert.match(html, /content="A &quot;quoted&quot; description\."/);
    const $ = cheerio.load(html);
    assert.equal($('link[rel="canonical"]').attr('href'), 'https://example.github.io/security/');
    assert.equal($('meta[property="og:image"]').attr('content'), 'https://example.github.io/assets/social.png');
    assert.equal($('meta[name="twitter:card"]').attr('content'), 'summary_large_image');
  });

  it('marks noindex pages and drops the canonical link', () => {
    const $ = cheerio.load(renderPage({ ...base, path: '/404.html', title: 'Page not found', noindex: true }));
    assert.equal($('meta[name="robots"]').attr('content'), 'noindex');
    assert.equal($('link[rel="canonical"]').length, 0);
  });

  it('embeds JSON-LD that cannot close the script element', () => {
    const jsonLd = organizationJsonLd({ ...base, description: '</script><b>' });
    const $ = cheerio.load(renderPage({ ...base, path: '/', title: 'x', home: true, jsonLd }));
    const parsed = JSON.parse($('script[type="application/ld+json"]').text());
    assert.equal(parsed['@graph'][0].description, '</script><b>');
    assert.doesNotMatch(inlineJson({ a: '</script>' }), /<\//);
  });
});

describe('sitemap and robots', () => {
  it('lists URLs with optional lastmod', () => {
    const xml = renderSitemap([{ loc: 'https://e.io/', lastmod: '2026-01-02' }, { loc: 'https://e.io/a/?x=1&y=2' }]);
    assert.match(xml, /<url><loc>https:\/\/e\.io\/<\/loc><lastmod>2026-01-02<\/lastmod><\/url>/);
    assert.match(xml, /<loc>https:\/\/e\.io\/a\/\?x=1&amp;y=2<\/loc><\/url>/);
  });

  it('points robots.txt at the sitemap', () => {
    assert.match(renderRobots('https://e.io/'), /^Sitemap: https:\/\/e\.io\/sitemap\.xml$/m);
  });
});

describe('createLinkResolver', () => {
  const resolve = createLinkResolver(SITE);
  const at = (href) => resolve(new URL(href));

  it('maps rendered source files on the source branch', () => {
    assert.equal(at('https://github.com/bimeron/.github/blob/main/SECURITY.md'), '/security/');
    assert.equal(at('https://github.com/bimeron/.github/blob/main/profile/README.md#install'), '/#install');
    assert.equal(at('https://github.com/Bimeron/.github/blob/main/CONTRIBUTING.md'), '/contributing/');
  });

  it('maps copied assets from blob and raw URLs', () => {
    assert.equal(at('https://raw.githubusercontent.com/bimeron/.github/main/profile/bimeron.png'), '/assets/logo.png');
    assert.equal(at('https://github.com/bimeron/.github/blob/main/profile/bimeron.png'), '/assets/logo.png');
  });

  it('leaves other refs, files and hosts alone', () => {
    assert.equal(at('https://github.com/bimeron/.github/blob/v1/SECURITY.md'), null);
    assert.equal(at('https://github.com/bimeron/.github/blob/main/LICENSE'), null);
    assert.equal(at('https://github.com/bimeron/bimeron-core/blob/main/SECURITY.md'), null);
    assert.equal(at('https://example.com/bimeron/.github/blob/main/SECURITY.md'), null);
  });
});

describe('pngToIco', () => {
  const png = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
  png.writeUInt32BE(64, 16);
  png.writeUInt32BE(48, 20);

  it('wraps the PNG with a single directory entry', () => {
    const ico = pngToIco(png);
    assert.equal(ico.readUInt16LE(2), 1);
    assert.equal(ico.readUInt16LE(4), 1);
    assert.equal(ico.readUInt8(6), 64);
    assert.equal(ico.readUInt8(7), 48);
    assert.equal(ico.readUInt32LE(14), png.length);
    assert.equal(ico.readUInt32LE(18), 22);
    assert.ok(ico.subarray(22).equals(png));
  });

  it('rejects non-PNG data', () => {
    assert.throws(() => pngToIco(Buffer.from('not a png, but long enough to pass')), /Not a PNG/);
  });
});
