// GitHub Markdown API client.

const API = 'https://api.github.com/markdown';

/**
 * Renders Markdown the way GitHub renders README files.
 *
 * `mode: "markdown"` is required: `gfm` mode turns every soft line break into `<br>`, and the
 * source files are hard-wrapped.
 *
 * @param {string} text
 * @param {{ token?: string, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<string>}
 */
export async function renderMarkdown(text, { token, fetchImpl = fetch } = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'bimeron-site-build',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetchImpl(API, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text, mode: 'markdown' }),
  });
  if (!response.ok) {
    throw new Error(`GitHub Markdown API returned ${response.status}: ${await response.text()}`);
  }
  return response.text();
}
