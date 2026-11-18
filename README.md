# bimeron.github.io

Source of the Bimeron Network website: https://bimeron.github.io.

Apart from the 404 page, the site has no text of its own. The pages are generated from
[`bimeron/.github`](https://github.com/bimeron/.github):

| Page | Source |
| --- | --- |
| `/` | [`profile/README.md`](https://github.com/bimeron/.github/blob/main/profile/README.md) |
| `/contributing/` | [`CONTRIBUTING.md`](https://github.com/bimeron/.github/blob/main/CONTRIBUTING.md) |
| `/security/` | [`SECURITY.md`](https://github.com/bimeron/.github/blob/main/SECURITY.md) |
| `/support/` | [`SUPPORT.md`](https://github.com/bimeron/.github/blob/main/SUPPORT.md) |

To change the text, edit those files. This repository holds the build: rendering, page
template, styles and workflows.

## How the build works

1. **Render.** Each source file goes through the
   [GitHub Markdown API](https://docs.github.com/en/rest/markdown) in `markdown` mode, the mode
   GitHub uses for README files. The output matches github.com.
2. **Post-process** ([`src/transform.mjs`](src/transform.mjs)):
   - heading ids lose the `user-content-` prefix, so in-page anchors work;
   - camo proxy URLs are replaced with the original image URLs;
   - links to the rendered source files point at the site pages, other relative links point at
     GitHub;
   - a paragraph of the form `**Label:** [A](a) · [B](b)` becomes a row of buttons, the first
     one primary;
   - table cells get column labels for the stacked mobile layout.
3. **Diagrams.** Mermaid blocks are rendered at build time with
   [mermaid-cli](https://github.com/mermaid-js/mermaid-cli) into inline light and dark SVGs.
   The page needs no JavaScript.
4. **Assemble** ([`src/page.mjs`](src/page.mjs)): page template with
   [github-markdown-css](https://github.com/sindresorhus/github-markdown-css),
   [`src/site.css`](src/site.css), metadata from the first heading and paragraph, Open Graph and
   Twitter tags, JSON-LD, favicon, a generated social image, `404.html`, `sitemap.xml` and
   `robots.txt`.
5. **Check** ([`scripts/check-site.mjs`](scripts/check-site.mjs)): required files and metadata,
   leftovers of GitHub-specific markup, internal links and anchors, sitemap coverage.

Pages, copied assets and the site URL are configured in [`src/site.mjs`](src/site.mjs).

## Deployment

The [Deploy](.github/workflows/deploy.yml) workflow builds the site and publishes it to GitHub
Pages (source: GitHub Actions). It runs:

- after pushes to `bimeron/.github` that change the source files: a workflow in that repository
  starts Deploy through `workflow_dispatch`;
- on pushes to `main` in this repository;
- every night, as a fallback;
- manually from the Actions tab. The `ref` input selects the branch, tag or commit of
  `bimeron/.github` to build from.

[CI](.github/workflows/ci.yml) runs the same build and checks on pull requests without
deploying, and uploads the built site as an artifact.

Optional repository variables:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_SITE_VERIFICATION` | Google Search Console verification token |
| `BING_SITE_VERIFICATION` | Bing Webmaster Tools verification token |

## Local build

Requirements: Node.js 22 or later. `npm ci` downloads a headless Chrome for Mermaid and the
social image.

```sh
git clone https://github.com/bimeron/.github ../bimeron-profile
npm ci
npm test
npm run build -- --source ../bimeron-profile
npm run check
npm run serve    # http://localhost:8080/
```

The build calls the GitHub Markdown API. Without a token the API allows 60 requests per hour,
enough for a few builds. Set `GITHUB_TOKEN` to raise the limit.

## License

[MIT](LICENSE)
