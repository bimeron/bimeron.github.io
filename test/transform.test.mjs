import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import * as cheerio from 'cheerio';

import { createLinkResolver, SITE, sourceUrls } from '../src/site.mjs';
import { fillDiagrams, labelTableCells, markLinkRows, summarize, transform } from '../src/transform.mjs';

const fixture = fs.readFileSync(new URL('./fixtures/api-output.html', import.meta.url), 'utf8');
const options = { docPath: 'profile/README.md', resolveLink: createLinkResolver(SITE), ...sourceUrls(SITE) };
const run = () => transform(fixture, options);

describe('transform', () => {
  it('drops the user-content- prefix from ids and fragment links', () => {
    const { $ } = run();
    assert.equal($('[id^="user-content-"]').length, 0);
    assert.equal($('a[href^="#user-content-"]').length, 0);
    assert.equal($('sup a').attr('href'), '#fn-1');
    assert.equal($('sup a').attr('id'), 'fnref-1');
  });

  it('puts permalink anchors inside headings and removes the wrapper', () => {
    const { $ } = run();
    assert.equal($('.markdown-heading').length, 0);
    const h2 = $('h2').first();
    assert.equal(h2.attr('id'), 'projects');
    assert.ok(h2.children().first().is('a.anchor'));
    assert.equal(h2.find('a.anchor').attr('id'), undefined);
    assert.equal(h2.find('a.anchor').attr('href'), '#projects');
  });

  it('keeps every in-page link pointing at an existing id', () => {
    const { $ } = run();
    const ids = new Set($('[id]').map((_, el) => $(el).attr('id')).get());
    const missing = $('a[href^="#"]')
      .map((_, el) => $(el).attr('href').slice(1))
      .get()
      .filter((id) => id !== 'fn-1' && !ids.has(id));
    assert.deepEqual(missing, []);
  });

  it('replaces camo URLs with the canonical image URL', () => {
    const { $ } = run();
    const badge = $('img[alt="Release"]');
    assert.equal(badge.attr('src'), 'https://img.shields.io/badge/release-v1-blue?a=1&b=2');
    assert.equal(badge.attr('data-canonical-src'), undefined);
    assert.doesNotMatch($.html(), /camo\.githubusercontent\.com/);
  });

  it('unwraps self-linked images and serves copied assets locally', () => {
    const { $ } = run();
    const logo = $('h1 img');
    assert.equal(logo.attr('src'), '/assets/logo.png');
    assert.ok(logo.parent().is('h1'));
  });

  it('keeps links around images that point elsewhere', () => {
    const { $ } = run();
    assert.equal($('img[alt="Release"]').parent().attr('href'), 'https://example.com/releases');
  });

  it('maps links to rendered source files to site pages, keeping the fragment', () => {
    const { $ } = run();
    assert.equal($('a:contains("contributing guide")').attr('href'), '/contributing/#pull-requests');
    assert.equal($('a:contains("support")').attr('href'), '/support/');
  });

  it('points other relative links at GitHub and leaves pinned refs alone', () => {
    const { $ } = run();
    assert.equal($('a:contains("the policy")').attr('href'), 'https://github.com/bimeron/.github/blob/main/profile/SECURITY.md');
    assert.equal($('a:contains("the guide")').attr('href'), 'https://github.com/bimeron/.github/blob/main/profile/docs/guide.md');
    assert.equal($('a:contains("pinned policy")').attr('href'), 'https://github.com/bimeron/.github/blob/v1/SECURITY.md');
  });

  it('extracts Mermaid sources as plain text and leaves a placeholder', () => {
    const { $, diagrams } = run();
    assert.deepEqual(diagrams, ['flowchart LR\n    a["A & B"] --> b["C<br/>D"]\n']);
    assert.equal($('.highlight-source-mermaid').length, 0);
    assert.equal($('figure.diagram[data-diagram="0"]').length, 1);
  });

  it('fills placeholders with light and dark SVGs', () => {
    const { $ } = run();
    fillDiagrams($, [{ light: '<svg id="l"></svg>', dark: '<svg id="d"></svg>' }]);
    const figure = $('figure.diagram');
    assert.equal(figure.attr('data-diagram'), undefined);
    assert.equal(figure.find('.diagram-light svg#l').length, 1);
    assert.equal(figure.find('.diagram-dark svg#d').length, 1);
  });

  it('fails when a diagram has no rendered SVG', () => {
    const { $ } = run();
    assert.throws(() => fillDiagrams($, []), /No rendered SVG for diagram 0/);
  });

  it('turns a bold label with dot-separated links into a button row', () => {
    const { $ } = run();
    const row = $('p.link-row');
    assert.equal(row.length, 1);
    assert.equal(row.find('strong').text(), 'Start here:');
    assert.deepEqual(row.find('a').map((_, a) => $(a).attr('class')).get(), ['btn btn-primary', 'btn', 'btn']);
    assert.doesNotMatch(row.text(), /·/);
  });

  it('labels table cells with their column headers', () => {
    const { $ } = run();
    assert.deepEqual($('tbody td').map((_, td) => $(td).attr('data-label')).get(), ['Project', 'Status']);
  });

  it('marks short table cells', () => {
    const $ = cheerio.load('<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>In development</td><td>A cell with more than twenty characters</td></tr></tbody></table>', null, false);
    labelTableCells($);
    assert.deepEqual($('td').map((_, td) => $(td).hasClass('short')).get(), [true, false]);
  });

  it('extracts the title and description', () => {
    const { title, description } = run();
    assert.equal(title, 'Example Org');
    assert.equal(description, 'Example Org builds example software: one core and apps on top of it.');
  });
});

describe('markLinkRows', () => {
  const rows = (html) => {
    const $ = cheerio.load(html, null, false);
    markLinkRows($);
    return $('p.link-row').length;
  };

  it('ignores ordinary paragraphs that start with bold text', () => {
    assert.equal(rows('<p><strong>Note:</strong> read <a href="a">this</a> · <a href="b">that</a>.</p>'), 0);
  });

  it('needs at least two links and a middle dot separator', () => {
    assert.equal(rows('<p><strong>Go:</strong> <a href="a">A</a></p>'), 0);
    assert.equal(rows('<p><strong>Go:</strong> <a href="a">A</a> <a href="b">B</a></p>'), 0);
    assert.equal(rows('<p><strong>Go:</strong> <a href="a">A</a> · <a href="b">B</a></p>'), 1);
  });
});

describe('summarize', () => {
  it('keeps short text unchanged', () => {
    assert.equal(summarize('Short text.'), 'Short text.');
  });

  it('keeps whole sentences that fit', () => {
    const text = `${'a'.repeat(70)}. ${'b'.repeat(70)}. ${'c'.repeat(70)}.`;
    assert.equal(summarize(text), `${'a'.repeat(70)}. ${'b'.repeat(70)}.`);
  });

  it('cuts a long first sentence at a word boundary', () => {
    const result = summarize(`${'word '.repeat(60)}end.`);
    assert.ok(result.length <= 160);
    assert.match(result, /word…$/);
  });
});
