const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const config = require('./site.config.cjs');
const base = process.env.DOCS_BASE_PATH || config.basePath;
const site = path.join(__dirname, 'site');
const version = require('../package.json').version;
let checked = 0;
for (const page of config.pages) {
    const file = path.join(site, page.slug, 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /<html lang="en"/);
    assert.ok(
        html.includes('v' + version),
        'Missing current version in ' + file,
    );
    assert.ok(
        html.includes('<h1>' + page.title.replace('&', '&amp;') + '</h1>'),
        'Missing page title in ' + file,
    );
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, 'Duplicate anchor in ' + file);
    for (const [, , raw] of html.matchAll(/\b(href|src)="([^"]+)"/g)) {
        const href = raw.replace(/&amp;/g, '&');
        if (/^(https?:|mailto:)/.test(href)) continue;
        const target = new URL(
            href,
            'https://docs.test' + base + (page.slug ? page.slug + '/' : ''),
        );
        assert.ok(
            target.pathname.startsWith(base),
            'Link escapes project base path: ' + href,
        );
        let relative = decodeURIComponent(target.pathname.slice(base.length));
        if (!relative || relative.endsWith('/')) relative += 'index.html';
        const destination = path.join(site, relative);
        assert.ok(
            fs.existsSync(destination),
            'Broken local link: ' + href + ' in ' + file,
        );
        if (target.hash) {
            const targetHTML = fs.readFileSync(destination, 'utf8');
            assert.ok(
                targetHTML.includes(
                    'id="' + decodeURIComponent(target.hash.slice(1)) + '"',
                ),
                'Missing section: ' + href,
            );
        }
        checked++;
    }
}
const search = JSON.parse(
    fs.readFileSync(path.join(site, 'assets', 'search-index.json')),
);
assert.ok(search.length > config.pages.length);
for (const word of ['storagePath', 'doctor', 'workspace', version])
    assert.ok(
        search.some((entry) => entry.text.includes(word)),
        'Missing search content: ' + word,
    );
assert.ok(
    fs
        .readFileSync(path.join(site, 'changelog', 'index.html'), 'utf8')
        .includes(version),
    'Changelog does not contain current release',
);
assert.ok(fs.existsSync(path.join(site, '404.html')));
console.log(
    'Checked ' +
        config.pages.length +
        ' pages, ' +
        checked +
        ' local links/assets, unique anchors, version and search content.',
);
