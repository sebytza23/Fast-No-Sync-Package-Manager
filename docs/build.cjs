const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const MarkdownIt = require('markdown-it');
const config = require('./site.config.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(__dirname, 'site');
const version = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json')),
).version;
const base = process.env.DOCS_BASE_PATH || config.basePath;
if (!base.startsWith('/') || !base.endsWith('/'))
    throw new Error('DOCS_BASE_PATH must start and end with /');
const sourceRef =
    process.env.DOCS_SOURCE_REF ||
    execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
    }).trim();
const sourceBranch =
    execFileSync('git', ['branch', '--show-current'], {
        cwd: root,
        encoding: 'utf8',
    }).trim() || 'main';
const escape = (value) =>
    String(value).replace(
        /[&<>"']/g,
        (c) =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
            })[c],
    );
const url = (slug) => base + (slug ? slug + '/' : '');
const icon = (name) =>
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
    {
        search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
        menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
        close: '<path d="m6 6 12 12M6 18 18 6"/>',
        arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
        copy: '<rect x="8" y="8" width="12" height="12"/><path d="M16 8V4H4v12h4"/>',
    }[name] +
    '</svg>';
const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
const fallbackLink =
    md.renderer.rules.link_open ||
    ((tokens, idx, opts, env, self) => self.renderToken(tokens, idx, opts));
md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
    const token = tokens[idx];
    const href = token.attrGet('href');
    if (href && href.endsWith('.md')) {
        const target = config.pages.find(
            (page) =>
                page.file === href ||
                (!page.file && page.slug + '.md' === href),
        );
        if (!target) throw new Error('Unknown documentation link: ' + href);
        token.attrSet('href', url(target.slug));
    }
    return fallbackLink(tokens, idx, opts, env, self);
};
md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const language = token.info.trim().split(/\s+/)[0];
    const label =
        {
            sh: 'Shell',
            bash: 'Shell',
            js: 'JavaScript',
            ts: 'TypeScript',
            json: 'JSON',
            yaml: 'YAML',
            text: 'Text',
        }[language] ||
        language ||
        'Code';
    return (
        '<div class="code-block"><div class="code-toolbar"><span>' +
        escape(label) +
        '</span><button type="button" class="copy-button" data-copy aria-label="Copy code">' +
        icon('copy') +
        '<span>Copy</span></button></div><pre><code>' +
        escape(token.content) +
        '</code></pre></div>'
    );
};
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, 'assets'), { recursive: true });
fs.cpSync(path.join(__dirname, 'assets'), path.join(output, 'assets'), {
    recursive: true,
});
fs.writeFileSync(path.join(output, '.nojekyll'), '');
const searchIndex = [];
for (const [index, page] of config.pages.entries()) {
    const source = page.file
        ? path.join(__dirname, 'content', page.file)
        : path.join(root, 'CHANGELOG.md');
    let markdown = fs
        .readFileSync(source, 'utf8')
        .replace(/^# .+\n/, '')
        .replaceAll('{{version}}', version)
        .replaceAll('{{sourceBranch}}', sourceBranch);
    const tokens = md.parse(markdown, {});
    const headings = [];
    const usedIds = new Set();
    let section = {
        title: page.title,
        section: '',
        url: url(page.slug),
        text: '',
    };
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type === 'heading_open') {
            const title = tokens[i + 1].content;
            let id = title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');
            const initialId = id;
            let suffix = 2;
            while (usedIds.has(id)) id = initialId + '-' + suffix++;
            usedIds.add(id);
            token.attrSet('id', id);
            if (section.text.trim()) searchIndex.push(section);
            section = {
                title: page.title,
                section: title,
                url: url(page.slug) + '#' + id,
                text: '',
            };
            headings.push({ title, id, level: Number(token.tag.slice(1)) });
        }
        if (['inline', 'fence', 'code_block'].includes(token.type))
            section.text += token.content + ' ';
    }
    if (section.text.trim()) searchIndex.push(section);
    const content = md.renderer
        .render(tokens, md.options, {})
        .replace(/<table>/g, '<div class="table-scroll"><table>')
        .replace(/<\/table>/g, '</table></div>');
    let group = '';
    const navigation = config.pages
        .map((item, n) => {
            let label = '';
            if (item.group !== group) {
                group = item.group;
                label = '<p class="nav-group">' + escape(group) + '</p>';
            }
            return (
                label +
                '<a class="nav-link' +
                (item.slug === page.slug ? ' active' : '') +
                '" href="' +
                url(item.slug) +
                '"' +
                (item.slug === page.slug ? ' aria-current="page"' : '') +
                '><span>' +
                escape(item.title) +
                '</span><span class="nav-number" aria-hidden="true">' +
                String(n).padStart(2, '0') +
                '</span></a>'
            );
        })
        .join('');
    const toc = headings
        .filter((h) => h.level === 2)
        .map((h) => '<a href="#' + h.id + '">' + escape(h.title) + '</a>')
        .join('');
    const previous = config.pages[index - 1];
    const next = config.pages[index + 1];
    const pager =
        '<nav class="page-navigation" aria-label="Previous and next pages">' +
        (previous
            ? '<a href="' +
              url(previous.slug) +
              '"><span>Previous</span><strong>' +
              escape(previous.title) +
              '</strong></a>'
            : '<div></div>') +
        (next
            ? '<a class="next-page" href="' +
              url(next.slug) +
              '"><span>Next</span><strong>' +
              escape(next.title) +
              '</strong>' +
              icon('arrow') +
              '</a>'
            : '<div></div>') +
        '</nav>';
    const sourcePath = page.file ? 'docs/content/' + page.file : 'CHANGELOG.md';
    const html =
        '<!doctype html><html lang="en" class="no-js"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' +
        escape(page.title) +
        ' — FNSPM documentation</title><meta name="description" content="' +
        escape(page.description) +
        '"><link rel="canonical" href="' +
        config.origin +
        url(page.slug) +
        '"><meta name="theme-color" content="#FFFFFF"><link rel="icon" href="' +
        base +
        'assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="' +
        base +
        'assets/style.css"><script src="' +
        base +
        'assets/app.js" defer></script></head><body data-base="' +
        escape(base) +
        '"><a class="skip-link" href="#main-content">Skip to content</a><header class="topbar"><div class="topbar-inner"><button class="menu-button icon-button" aria-label="Open navigation" aria-expanded="false" aria-controls="sidebar">' +
        icon('menu') +
        '</button><a class="brand" href="' +
        base +
        '">FNSPM<span>Documentation</span></a><div class="header-actions"><a class="version-link" href="' +
        url('changelog') +
        '">v' +
        escape(version) +
        '</a><button class="search-button" data-open-search aria-label="Search documentation" aria-haspopup="dialog" aria-controls="documentation-search">' +
        icon('search') +
        '<span>Search docs</span><kbd>/</kbd></button><a class="github-link" href="' +
        config.repository +
        '">GitHub</a></div></div></header><div class="site-shell"><aside id="sidebar" class="sidebar"><nav aria-label="Documentation">' +
        navigation +
        '</nav><div class="sidebar-bottom"><a href="https://www.npmjs.com/package/fnspm">npm package</a><span>GPL-3.0-only</span></div></aside><main id="main-content" tabindex="-1"><div class="article-header"><div><p class="breadcrumb">' +
        escape(page.group) +
        '</p><h1>' +
        escape(page.title) +
        '</h1></div><span class="chapter-number" aria-label="Chapter ' +
        index +
        '">' +
        String(index).padStart(2, '0') +
        '</span></div><p class="page-description">' +
        escape(page.description) +
        '</p><details class="mobile-toc"><summary>On this page</summary><nav aria-label="Page sections">' +
        toc +
        '</nav></details><article class="article">' +
        content +
        '</article>' +
        pager +
        '<footer class="article-footer"><a href="' +
        config.repository +
        '/blob/' +
        encodeURIComponent(sourceRef) +
        '/' +
        sourcePath +
        '">View page source</a><a href="' +
        config.repository +
        '/issues">Report a documentation issue</a></footer></main><aside class="page-toc"><p>On this page</p><nav aria-label="Page sections">' +
        toc +
        '</nav><a class="toc-top" href="#main-content">Back to top</a></aside></div><dialog id="documentation-search" class="search-dialog" aria-labelledby="search-title"><div class="search-dialog-header"><h2 id="search-title">Search documentation</h2><button class="icon-button" data-close-search aria-label="Close search">' +
        icon('close') +
        '</button></div><label class="search-input-wrap">' +
        icon('search') +
        '<input id="search-input" type="search" placeholder="Try storagePath or doctor" aria-label="Search pages, commands, and settings" autocomplete="off"></label><p id="search-status" class="search-status" role="status"></p><ul id="search-results" class="search-results"></ul><div class="search-hint">Arrow keys to navigate. Enter to open. Escape to close.</div></dialog><div id="copy-status" class="sr-only" role="status" aria-live="polite"></div></body></html>';
    const directory = path.join(output, page.slug);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'index.html'), html);
}
fs.writeFileSync(
    path.join(output, 'assets', 'search-index.json'),
    JSON.stringify(searchIndex),
);
fs.writeFileSync(
    path.join(output, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
        config.pages
            .map(
                (page) =>
                    '<url><loc>' +
                    config.origin +
                    url(page.slug) +
                    '</loc></url>',
            )
            .join('') +
        '</urlset>',
);
fs.writeFileSync(
    path.join(output, 'robots.txt'),
    'User-agent: *\nAllow: /\nSitemap: ' +
        config.origin +
        base +
        'sitemap.xml\n',
);
fs.writeFileSync(
    path.join(output, '404.html'),
    '<!doctype html><html lang="en" class="no-js"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found — FNSPM</title><link rel="stylesheet" href="' +
        base +
        'assets/style.css"></head><body><main class="not-found"><p class="breadcrumb">FNSPM documentation</p><h1>Page not found</h1><p>This documentation page does not exist.</p><a href="' +
        base +
        '">Go to the overview</a></main></body></html>',
);
console.log(
    'Built ' +
        config.pages.length +
        ' documentation pages and ' +
        searchIndex.length +
        ' searchable sections for FNSPM ' +
        version +
        '.',
);
