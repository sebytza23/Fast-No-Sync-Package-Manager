const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const config = require('./site.config.cjs');
const root = path.resolve(__dirname, '..');

module.exports = function editions() {
    const current = {
        version: require('../package.json').version,
        directory: __dirname,
        prefix: '',
        pages: config.pages,
        sourceRef:
            process.env.DOCS_SOURCE_REF ||
            execFileSync('git', ['rev-parse', 'HEAD'], {
                cwd: root,
                encoding: 'utf8',
            }).trim(),
        sourceBranch:
            execFileSync('git', ['branch', '--show-current'], {
                cwd: root,
                encoding: 'utf8',
            }).trim() || 'main',
    };
    const archiveRoot = path.join(__dirname, 'versions');
    const archived = fs.existsSync(archiveRoot)
        ? fs
              .readdirSync(archiveRoot)
              .map((name) => {
                  if (!/^\d+\.\d+\.\d+$/.test(name))
                      throw new Error('Invalid documentation version: ' + name);
                  const directory = path.join(archiveRoot, name);
                  const edition = JSON.parse(
                      fs.readFileSync(
                          path.join(directory, 'edition.json'),
                          'utf8',
                      ),
                  );
                  if (edition.version !== name)
                      throw new Error(
                          'Archive version does not match directory: ' + name,
                      );
                  return {
                      ...edition,
                      directory,
                      prefix: 'versions/' + name + '/',
                      archived: true,
                  };
              })
              .filter((edition) => edition.version !== current.version)
        : [];
    archived.sort((a, b) => {
        const left = a.version.split('.').map(Number);
        const right = b.version.split('.').map(Number);
        for (let i = 0; i < 3; i++)
            if (left[i] !== right[i]) return right[i] - left[i];
        return 0;
    });
    return [current, ...archived];
};
