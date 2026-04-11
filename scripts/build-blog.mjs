import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nunjucks from "nunjucks";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const contentDir = path.join(rootDir, "content", "blog");
const outputDir = path.join(rootDir, "blog");
const templatesDir = path.join(rootDir, "templates");
const nunjucksEnv = nunjucks.configure(templatesDir, {
  autoescape: true,
  noCache: true,
});

const staticPageConfigs = [
  {
    templatePath: "pages/index.njk",
    outputPath: "index.html",
    rootPrefix: ".",
    currentSection: null,
  },
  {
    templatePath: "pages/apps/index.njk",
    outputPath: "apps/index.html",
    rootPrefix: "..",
    currentSection: "apps",
  },
  {
    templatePath: "pages/resume/index.njk",
    outputPath: "resume/index.html",
    rootPrefix: "..",
    currentSection: "resume",
  },
  {
    templatePath: "pages/portfolio/index.njk",
    outputPath: "portfolio/index.html",
    rootPrefix: "..",
    currentSection: "portfolio",
  },
  {
    templatePath: "pages/portfolio/dwarves-manager.njk",
    outputPath: "portfolio/dwarves-manager.html",
    rootPrefix: "..",
    currentSection: "portfolio",
  },
  {
    templatePath: "pages/portfolio/starplan.njk",
    outputPath: "portfolio/starplan.html",
    rootPrefix: "..",
    currentSection: "portfolio",
  },
  {
    templatePath: "pages/portfolio/omnivista-cirrus-terra.njk",
    outputPath: "portfolio/omnivista-cirrus-terra.html",
    rootPrefix: "..",
    currentSection: "portfolio",
  },
  {
    templatePath: "pages/portfolio/visual-automated-attendant.njk",
    outputPath: "portfolio/visual-automated-attendant.html",
    rootPrefix: "..",
    currentSection: "portfolio",
  },
];

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

async function main() {
  const posts = await loadPosts();
  await fs.mkdir(outputDir, { recursive: true });

  await writeFile(path.join(outputDir, "index.html"), renderBlogIndex(posts));

  await Promise.all(
    posts.map((post, index) => {
      const prev = posts[index + 1] ?? null;
      const next = posts[index - 1] ?? null;
      return writeFile(
        path.join(outputDir, post.slug, "index.html"),
        renderBlogPost(post, { prev, next })
      );
    })
  );

  await Promise.all(
    staticPageConfigs.map((config) =>
      writeFile(path.join(rootDir, config.outputPath), renderStaticPage(config))
    )
  );

  console.log(
    `Generated ${posts.length} blog post(s) into ${path.relative(rootDir, outputDir)} and rendered ${staticPageConfigs.length} static page(s) from Nunjucks templates.`
  );
}

function renderStaticPage({ templatePath, rootPrefix, currentSection }) {
  return renderTemplate(templatePath, createTemplateContext(rootPrefix, currentSection));
}

async function loadPosts() {
  const files = await fs.readdir(contentDir);
  const posts = [];

  for (const fileName of files) {
    if (!fileName.endsWith(".md")) {
      continue;
    }

    const source = await fs.readFile(path.join(contentDir, fileName), "utf8");
    const { frontMatter, body } = parseFrontMatter(source);
    const title = frontMatter.title ?? fileName.replace(/\.md$/, "");
    const slug = slugify(frontMatter.slug ?? title);
    const date = new Date(frontMatter.date ?? Date.now());

    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid date in ${fileName}`);
    }

    if (frontMatter.draft === true) {
      continue;
    }

    posts.push({
      slug,
      title,
      date,
      dateLabel: dateFormatter.format(date),
      excerpt: frontMatter.excerpt ?? createExcerpt(body, 180),
      tags: Array.isArray(frontMatter.tags) ? frontMatter.tags : [],
      cover: typeof frontMatter.cover === "string" ? frontMatter.cover : "",
      body,
      html: renderMarkdown(body),
    });
  }

  return posts.sort((a, b) => b.date - a.date);
}

function parseFrontMatter(source) {
  const normalized = source.replace(/\r\n/g, "\n").trim();

  if (!normalized.startsWith("---\n")) {
    return { frontMatter: {}, body: normalized };
  }

  const endIndex = normalized.indexOf("\n---\n", 4);

  if (endIndex === -1) {
    return { frontMatter: {}, body: normalized };
  }

  const rawFrontMatter = normalized.slice(4, endIndex).split("\n");
  const body = normalized.slice(endIndex + 5).trim();
  const frontMatter = {};

  for (const rawLine of rawFrontMatter) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf(":");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    frontMatter[key] = parseFrontMatterValue(value);
  }

  return { frontMatter, body };
}

function parseFrontMatterValue(value) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }

  if (value.includes(",") && !value.includes("://")) {
    return value
      .split(",")
      .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }

  return value;
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];

  for (let index = 0; index < lines.length; ) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const codeStart = line.match(/^```(\w+)?\s*$/);

    if (codeStart) {
      const language = codeStart[1] ? ` class="language-${escapeHtml(codeStart[1])}"` : "";
      const buffer = [];
      index += 1;

      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        buffer.push(lines[index]);
        index += 1;
      }

      index += 1;
      html.push(`<pre><code${language}>${escapeHtml(buffer.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);

    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      html.push("<hr>");
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const buffer = [];

      while (index < lines.length && /^>\s?/.test(lines[index])) {
        buffer.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }

      html.push(`<blockquote>${renderMarkdown(buffer.join("\n"))}</blockquote>`);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];

      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(`<li>${renderInline(lines[index].replace(/^[-*]\s+/, ""))}</li>`);
        index += 1;
      }

      html.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = [];

      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(`<li>${renderInline(lines[index].replace(/^\d+\.\s+/, ""))}</li>`);
        index += 1;
      }

      html.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const paragraph = [];

    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,6})\s+/.test(lines[index]) &&
      !/^```/.test(lines[index]) &&
      !/^>\s?/.test(lines[index]) &&
      !/^[-*]\s+/.test(lines[index]) &&
      !/^\d+\.\s+/.test(lines[index]) &&
      !/^---+$/.test(lines[index].trim())
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }

    html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
  }

  return html.join("\n");
}

function renderInline(text) {
  const codeSpans = [];
  let html = text.replace(/`([^`]+)`/g, (_, code) => {
    const token = `__CODE_${codeSpans.length}__`;
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  html = escapeHtml(html);
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  html = html.replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");
  html = html.replace(/(^|[\s(])_([^_]+)_(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");

  codeSpans.forEach((value, index) => {
    html = html.replace(`__CODE_${index}__`, value);
  });

  return html;
}

function renderBlogIndex(posts) {
  const list = posts
    .map(
      (post) => `
        <article class="blog-list__item" data-reveal>
          <div class="blog-list__meta">
            <span>${post.dateLabel}</span>
            ${post.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
          </div>
          <div>
            <h2><a href="./${post.slug}/index.html">${escapeHtml(post.title)}</a></h2>
            <p>${escapeHtml(post.excerpt)}</p>
          </div>
          <a href="./${post.slug}/index.html">Read article</a>
        </article>
      `
    )
    .join("");

  return renderLayout({
    pageTitle: "Khopa | Blog",
    description: "Posts.",
    rootPrefix: "..",
    currentSection: "blog",
    bodyClass: "blog-page",
    mainContent: `
      <div class="container">
        <section class="blog-list__hero" data-reveal>
          <p class="eyebrow">Blog</p>
          <h1>Posts.</h1>
          <p>Markdown in <code>content/blog/</code>. Static output.</p>
        </section>
        <section class="blog-list">
          ${list}
        </section>
      </div>
    `,
  });
}

function renderBlogPost(post, { prev, next }) {
  const cover = post.cover
    ? `<img class="post-cover" src="${escapeHtml(post.cover)}" alt="">`
    : `<div class="post-cover" aria-hidden="true"></div>`;
  const tagList = post.tags.length
    ? `<ul class="post-tags">${post.tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join("")}</ul>`
    : "";

  const navigation = prev || next
    ? `
      <nav class="post-nav">
        <p class="eyebrow">Continue reading</p>
        <div class="post-nav__links">
          ${next ? `<a href="../${next.slug}/index.html">Newer: ${escapeHtml(next.title)}</a>` : ""}
          ${prev ? `<a href="../${prev.slug}/index.html">Older: ${escapeHtml(prev.title)}</a>` : ""}
        </div>
      </nav>
    `
    : "";

  return renderLayout({
    pageTitle: `${post.title} | Khopa`,
    description: post.excerpt,
    rootPrefix: "../..",
    currentSection: "blog",
    bodyClass: "blog-page",
    mainContent: `
      <div class="container">
        <article class="post-shell">
          <header class="post-hero" data-reveal>
            <p class="eyebrow">Article</p>
            <h1>${escapeHtml(post.title)}</h1>
            <div class="post-meta">
              <span class="meta-label">${post.dateLabel}</span>
            </div>
            <p>${escapeHtml(post.excerpt)}</p>
            ${tagList}
            ${cover}
          </header>
          <div class="post-body" data-reveal>
            ${post.html}
          </div>
        </article>
        ${navigation}
      </div>
    `,
  });
}

function renderLayout({ pageTitle, description, rootPrefix, currentSection, bodyClass, mainContent }) {
  return renderTemplate("layout.njk", {
    pageTitle,
    description,
    bodyClass,
    mainContent,
    ...createTemplateContext(rootPrefix, currentSection),
  });
}

function renderTemplate(templatePath, context) {
  return nunjucksEnv.render(templatePath, context).trim();
}

function resolveSiteHref(rootPrefix, relativePath) {
  return rootPrefix === "." ? `./${relativePath}` : `${rootPrefix}/${relativePath}`;
}

function createTemplateContext(rootPrefix, currentSection) {
  return {
    assetPrefix: rootPrefix === "." ? "." : rootPrefix,
    currentSection,
    homeHref: resolveSiteHref(rootPrefix, "index.html"),
    portfolioHref: resolveSiteHref(rootPrefix, "portfolio/index.html"),
    resumeHref: resolveSiteHref(rootPrefix, "resume/index.html"),
    blogHref: resolveSiteHref(rootPrefix, "blog/index.html"),
    appsHref: resolveSiteHref(rootPrefix, "apps/index.html"),
  };
}

function createExcerpt(markdown, limit) {
  return `${stripMarkdown(markdown).slice(0, limit).trim().replace(/\s+\S*$/, "")}...`;
}

function stripMarkdown(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/[`*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function writeFile(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
