const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const config = require('./site.config.cjs');
const projectBase = process.env.DOCS_BASE_PATH || config.basePath;
const site = path.join(__dirname, 'site');
const editions = require('./editions.cjs')();
let checked = 0;
let pageCount = 0;
for (const edition of editions) {
    const base = projectBase + edition.prefix;
    for (const page of edition.pages) {
        const file = path.join(site, edition.prefix, page.slug, 'index.html');
        const html = fs.readFileSync(file, 'utf8');
        pageCount++;
        assert.match(html, /<html lang="en"/);
        assert.ok(
            html.includes('current v' + edition.version),
            'Incorrect version menu in ' + file,
        );
        assert.ok(
            html.includes('<h1>' + page.title.replace('&', '&amp;') + '</h1>'),
            'Missing page title in ' + file,
        );
        assert.equal(
            html.includes('class="archive-banner"'),
            Boolean(edition.archived),
            'Incorrect archive banner in ' + file,
        );
        const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(
            (match) => match[1],
        );
        assert.equal(
            new Set(ids).size,
            ids.length,
            'Duplicate anchor in ' + file,
        );
        for (const [, , raw] of html.matchAll(/\b(href|src)="([^"]+)"/g)) {
            const href = raw.replace(/&amp;/g, '&');
            if (/^(https?:|mailto:)/.test(href)) continue;
            const target = new URL(
                href,
                'https://docs.test' + base + (page.slug ? page.slug + '/' : ''),
            );
            assert.ok(
                target.pathname.startsWith(projectBase),
                'Link escapes project base path: ' + href,
            );
            let relative = decodeURIComponent(
                target.pathname.slice(projectBase.length),
            );
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
        for (const [, code] of html.matchAll(
            /<pre><code>([\s\S]*?)<\/code><\/pre>/g,
        )) {
            assert.ok(!code.includes('{{'), 'Unresolved template in ' + file);
            for (const [, version] of code.matchAll(
                /npm install(?: -g)? fnspm@([\d.]+)/g,
            )) {
                assert.equal(
                    version,
                    edition.version,
                    'Stale installation example in ' + file,
                );
            }
        }
    }
    const search = JSON.parse(
        fs.readFileSync(
            path.join(site, edition.prefix, 'assets', 'search-index.json'),
        ),
    );
    assert.ok(search.length > edition.pages.length);
    for (const word of ['storagePath', 'doctor', 'workspace', edition.version])
        assert.ok(
            search.some((entry) => entry.text.includes(word)),
            'Missing search content: ' + word + ' for ' + edition.version,
        );
    for (const entry of search)
        assert.ok(
            entry.url.startsWith(base),
            'Search result escapes its edition: ' + entry.url,
        );
    assert.ok(
        fs
            .readFileSync(
                path.join(site, edition.prefix, 'changelog', 'index.html'),
                'utf8',
            )
            .includes(edition.version),
        'Changelog does not contain edition release',
    );
}
const generated = JSON.parse(fs.readFileSync(path.join(site, 'versions.json')));
assert.deepEqual(
    generated.map(({ version }) => version),
    editions.map(({ version }) => version),
);
assert.ok(fs.existsSync(path.join(site, '404.html')));
console.log(
    'Checked ' +
        pageCount +
        ' pages across ' +
        editions.length +
        ' editions, ' +
        checked +
        ' local links/assets, version-specific installation examples, archive banners and isolated search indexes.',
);
