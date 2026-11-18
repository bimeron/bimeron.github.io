// Build steps that need a headless browser: Mermaid diagrams and the social preview image.

import puppeteer from 'puppeteer';
import { renderMermaid } from '@mermaid-js/mermaid-cli';
import { escapeHtml, SOCIAL_IMAGE } from './page.mjs';

// The same font stack as github-markdown-css, so label boxes are measured with the fonts the
// page uses.
const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif';

export function launchBrowser() {
  return puppeteer.launch();
}

/**
 * Renders a Mermaid diagram into light and dark SVGs with unique ids.
 * @param {import('puppeteer').Browser} browser
 * @param {string} source
 * @param {string} id
 * @returns {Promise<{ light: string, dark: string }>}
 */
export async function renderDiagram(browser, source, id) {
  const result = {};
  for (const [variant, theme] of [['light', 'default'], ['dark', 'dark']]) {
    const { data } = await renderMermaid(browser, source, 'svg', {
      backgroundColor: 'transparent',
      fontEmbed: false,
      svgId: `${id}-${variant}`,
      mermaidConfig: {
        theme,
        themeVariables: { fontFamily: FONT_FAMILY },
        // Labels as SVG text with explicit line breaks only. HTML labels re-wrap in the
        // visitor's browser when its font is wider than the one used at build time.
        htmlLabels: false,
        markdownAutoWrap: false,
        flowchart: { htmlLabels: false, curve: 'basis', padding: 16 },
      },
    });
    result[variant] = new TextDecoder().decode(data);
  }
  return result;
}

/**
 * Renders the 1200x630 Open Graph image from the site name, description and logo.
 * @param {import('puppeteer').Browser} browser
 * @param {{ title: string, description: string, host: string, logo: Buffer }} content
 * @returns {Promise<Uint8Array>}
 */
export async function renderSocialImage(browser, { title, description, host, logo }) {
  const logoUrl = `data:image/png;base64,${logo.toString('base64')}`;
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; }
  body { width: ${SOCIAL_IMAGE.width}px; height: ${SOCIAL_IMAGE.height}px; box-sizing: border-box;
    padding: 88px 96px; display: flex; flex-direction: column; background: #0d1117; color: #f0f6fc;
    font-family: ${FONT_FAMILY}; }
  .brand { display: flex; align-items: center; gap: 28px; }
  .brand img { width: 96px; height: 96px; border-radius: 20px; }
  h1 { margin: 0; font-size: 76px; font-weight: 600; letter-spacing: -1px; }
  p { margin: 48px 0 0; max-width: 980px; font-size: 38px; line-height: 1.35; color: #9198a1; }
  .host { margin-top: auto; font-size: 28px; color: #4493f8; }
</style></head>
<body>
  <div class="brand"><img src="${logoUrl}" alt=""><h1>${escapeHtml(title)}</h1></div>
  <p>${escapeHtml(description)}</p>
  <div class="host">${escapeHtml(host)}</div>
</body></html>`;
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: SOCIAL_IMAGE.width, height: SOCIAL_IMAGE.height });
    await page.setContent(html, { waitUntil: 'load' });
    return await page.screenshot({ type: 'png' });
  } finally {
    await page.close();
  }
}
