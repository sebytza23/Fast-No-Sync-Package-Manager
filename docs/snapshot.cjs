const fs = require('node:fs');
const path = require('node:path');
const edition = require('./editions.cjs')()[0];
const destination = path.join(__dirname, 'versions', edition.version);
if (fs.existsSync(destination))
    throw new Error(
        'Documentation snapshot already exists for ' +
            edition.version +
            '. Archived content must not be overwritten.',
    );
const pages = edition.pages.filter((page) => page.slug !== 'versions');
fs.mkdirSync(path.join(destination, 'content'), { recursive: true });
for (const page of pages) {
    if (page.file)
        fs.copyFileSync(
            path.join(__dirname, 'content', page.file),
            path.join(destination, 'content', page.file),
        );
}
fs.copyFileSync(
    path.join(__dirname, '..', 'CHANGELOG.md'),
    path.join(destination, 'CHANGELOG.md'),
);
fs.writeFileSync(
    path.join(destination, 'edition.json'),
    JSON.stringify(
        {
            version: edition.version,
            sourceRef: edition.sourceRef,
            sourceBranch: 'v' + edition.version,
            pages,
        },
        null,
        4,
    ) + '\n',
);
console.log(
    'Saved documentation snapshot for ' +
        edition.version +
        '. Commit it before preparing the next release.',
);
