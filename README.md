# khopa.github.io

Static personal website for GitHub Pages.

## Prerequisites

- Node.js 18+
- npm

## Install

Run from the repository root:

npm install

## Build the site

Any of these commands builds blog posts and renders static pages from Nunjucks templates:

npm run build
npm run build:site
npm run build:blog

Build outputs are written directly to the published HTML files in this repository, including:

- index.html
- apps/index.html
- resume/index.html
- portfolio/*.html
- blog/index.html and blog/<slug>/index.html

## Content and templates

- Blog source markdown: content/blog
- Site templates: templates/pages
- Shared layout: templates/layout.njk
- Shared partials: templates/partials/navbar.njk and templates/partials/footer.njk
- Build script: scripts/build-blog.mjs

## Workflow

1. Edit page templates in templates/pages or blog markdown in content/blog.
2. Run npm run build:site.
3. Review generated HTML changes.
4. Commit and push to deploy on GitHub Pages.
