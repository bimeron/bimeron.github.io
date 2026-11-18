// Post-processing of HTML returned by the GitHub Markdown API (`mode: "markdown"`).
//
// The API output is tuned for github.com: heading ids carry a `user-content-` prefix, images go
// through the camo proxy, Mermaid blocks come back as highlighted source and relative links are
// left as written. These functions turn it into HTML that works on a standalone site.

import * as cheerio from 'cheerio';

const ID_PREFIX = 'user-content-';
const MIDDLE_DOT = '·';
const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;
const SHORT_CELL = 20;

/**
 * @typedef {object} TransformOptions
 * @property {string} docPath Path of the source file in its repository, e.g. `profile/README.md`.
 * @property {(target: URL) => string | null} resolveLink Maps an absolute link target to a site
 *   URL, or returns null to keep the link unchanged.
 * @property {string} blobBase Base URL for relative links that do not map to a site page, e.g.
 *   `https://github.com/bimeron/.github/blob/main/`.
 * @property {string} rawBase Base URL for relative image sources, e.g.
 *   `https://raw.githubusercontent.com/bimeron/.github/main/`.
 */

/**
 * @typedef {object} TransformResult
 * @property {cheerio.CheerioAPI} $ The transformed document fragment.
 * @property {string[]} diagrams Mermaid sources, in document order. Each one has a matching
 *   `<figure class="diagram" data-diagram="N">` placeholder.
 * @property {string} title Text of the first `h1`.
 * @property {string} description Text of the first non-empty paragraph.
 */

/**
 * @param {string} html
 * @param {TransformOptions} options
 * @returns {TransformResult}
 */
export function transform(html, options) {
  const $ = cheerio.load(html, null, false);
  fixIds($);
  flattenHeadings($);
  useCanonicalImages($);
  unwrapSelfLinkedImages($);
  rewriteLinks($, options);
  const diagrams = extractDiagrams($);
  markLinkRows($);
  labelTableCells($);
  return { $, diagrams, title: extractTitle($), description: extractDescription($) };
}

/** Drops the `user-content-` prefix from ids and from the fragment links that point at them. */
export function fixIds($) {
  $(`[id^="${ID_PREFIX}"]`).each((_, el) => {
    $(el).attr('id', $(el).attr('id').slice(ID_PREFIX.length));
  });
  $(`[name^="${ID_PREFIX}"]`).each((_, el) => {
    $(el).attr('name', $(el).attr('name').slice(ID_PREFIX.length));
  });
  $(`a[href^="#${ID_PREFIX}"]`).each((_, el) => {
    $(el).attr('href', '#' + $(el).attr('href').slice(ID_PREFIX.length + 1));
  });
}

/**
 * Moves the permalink anchor into its heading and removes the `markdown-heading` wrapper, which
 * is the structure github-markdown-css styles (link icon on hover).
 */
export function flattenHeadings($) {
  $('div.markdown-heading').each((_, wrapper) => {
    const w = $(wrapper);
    const heading = w.children('h1, h2, h3, h4, h5, h6').first();
    const anchor = w.children('a.anchor').first();
    if (!heading.length) return;
    if (anchor.length) {
      if (anchor.attr('id') && !heading.attr('id')) {
        heading.attr('id', anchor.attr('id'));
        anchor.removeAttr('id');
      }
      heading.prepend(anchor);
    }
    w.replaceWith(heading);
  });
}

/** Replaces camo proxy URLs with the original image URLs. */
export function useCanonicalImages($) {
  $('img[data-canonical-src]').each((_, el) => {
    $(el).attr('src', $(el).attr('data-canonical-src')).removeAttr('data-canonical-src');
  });
}

/** Removes the links GitHub wraps around images that point at the image itself. */
export function unwrapSelfLinkedImages($) {
  $('a > img').each((_, el) => {
    const link = $(el).parent();
    if (link.children().length === 1 && link.text().trim() === '' && link.attr('href') === $(el).attr('src')) {
      link.replaceWith(el);
    }
  });
}

/** Resolves relative links and maps links to pages that the site renders itself. */
export function rewriteLinks($, { docPath, resolveLink, blobBase, rawBase }) {
  const docUrl = new URL(docPath, blobBase);
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href.startsWith('#')) return;
    const target = new URL(href, docUrl);
    const mapped = resolveLink(target);
    if (mapped !== null) $(el).attr('href', mapped);
    else if (!ABSOLUTE.test(href)) $(el).attr('href', target.href);
  });
  const rawDocUrl = new URL(docPath, rawBase);
  $('img[src]').each((_, el) => {
    const src = $(el).attr('src');
    const target = new URL(src, rawDocUrl);
    const mapped = resolveLink(target);
    if (mapped !== null) $(el).attr('src', mapped);
    else if (!ABSOLUTE.test(src)) $(el).attr('src', target.href);
  });
}

/** Replaces Mermaid code blocks with numbered placeholders and returns their sources. */
export function extractDiagrams($) {
  const diagrams = [];
  $('div.highlight-source-mermaid, pre[lang="mermaid"]').each((_, el) => {
    const source = $(el).text().replace(/\s+$/, '') + '\n';
    $(el).replaceWith(`<figure class="diagram" data-diagram="${diagrams.length}"></figure>`);
    diagrams.push(source);
  });
  return diagrams;
}

/**
 * Fills diagram placeholders with prerendered SVGs.
 * @param {cheerio.CheerioAPI} $
 * @param {{ light: string, dark: string }[]} svgs
 */
export function fillDiagrams($, svgs) {
  $('figure.diagram[data-diagram]').each((_, el) => {
    const svg = svgs[Number($(el).attr('data-diagram'))];
    if (!svg) throw new Error(`No rendered SVG for diagram ${$(el).attr('data-diagram')}`);
    $(el)
      .removeAttr('data-diagram')
      .html(`<div class="diagram-light">${svg.light}</div><div class="diagram-dark">${svg.dark}</div>`);
  });
}

/**
 * Turns a paragraph made of a bold label followed by links separated by middle dots
 * (`**Label:** [A](a) · [B](b)`) into a row of buttons. The first link becomes the primary one.
 */
export function markLinkRows($) {
  $('p').each((_, el) => {
    const p = $(el);
    const nodes = p.contents().toArray();
    if (nodes.length === 0 || !$(nodes[0]).is('strong')) return;
    const rest = nodes.slice(1);
    const links = rest.filter((n) => n.type === 'tag' && n.name === 'a');
    const others = rest.filter((n) => !(n.type === 'tag' && n.name === 'a'));
    const separatorsOnly = others.every((n) => n.type === 'text' && n.data.replaceAll(MIDDLE_DOT, '').trim() === '');
    const hasDots = others.some((n) => n.type === 'text' && n.data.includes(MIDDLE_DOT));
    if (links.length < 2 || !separatorsOnly || !hasDots) return;
    p.addClass('link-row');
    others.forEach((n) => $(n).remove());
    links.forEach((a, i) => $(a).addClass(i === 0 ? 'btn btn-primary' : 'btn'));
  });
}

/**
 * Copies column headers into `data-label` attributes for the stacked mobile table layout and
 * marks short cells, which the stylesheet keeps on one line.
 */
export function labelTableCells($) {
  $('table').each((_, table) => {
    const headers = $(table).find('thead th').map((_, th) => $(th).text().trim()).get();
    $(table).find('tbody tr').each((_, tr) => {
      $(tr).children('td').each((i, td) => {
        if (headers[i]) $(td).attr('data-label', headers[i]);
        if ($(td).text().trim().length <= SHORT_CELL) $(td).addClass('short');
      });
    });
  });
}

export function extractTitle($) {
  return $('h1').first().text().replace(/\s+/g, ' ').trim();
}

export function extractDescription($) {
  const p = $('p').filter((_, el) => $(el).text().trim() !== '').first();
  return summarize(p.text().replace(/\s+/g, ' ').trim());
}

/**
 * Shortens text for a meta description: whole sentences while they fit in `max` characters,
 * otherwise the first sentence cut at a word boundary.
 */
export function summarize(text, max = 160) {
  if (text.length <= max) return text;
  const sentences = (text.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? []).map((s) => s.trim());
  let result = '';
  for (const sentence of sentences) {
    const next = result ? `${result} ${sentence}` : sentence;
    if (next.length > max) break;
    result = next;
  }
  if (result) return result;
  const cut = text.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:]+$/, '') + '…';
}
