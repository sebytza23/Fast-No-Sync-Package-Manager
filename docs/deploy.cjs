const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const config = require('./site.config.cjs');
const root = path.resolve(__dirname, '..');
const git = (args, cwd = root) =>
    execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
    }).trim();
const remote = git(['remote', 'get-url', 'origin']);
const expected = config.repository.replace('https://github.com/', '');
if (!remote.includes(expected))
    throw new Error(
        'The origin remote does not match the configured documentation repository.',
    );
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'fnspm-pages-'));
try {
    const source = git(['rev-parse', 'HEAD']);
    git(['init', '-q'], scratch);
    git(['config', 'user.name', git(['config', 'user.name'])], scratch);
    git(['config', 'user.email', git(['config', 'user.email'])], scratch);
    git(['remote', 'add', 'origin', remote], scratch);
    const branch = spawnSync(
        'git',
        ['ls-remote', '--exit-code', 'origin', 'refs/heads/gh-pages'],
        { cwd: scratch, encoding: 'utf8' },
    );
    if (branch.status === 0) {
        git(['fetch', '--depth=1', 'origin', 'gh-pages'], scratch);
        git(['checkout', '-b', 'gh-pages', 'FETCH_HEAD'], scratch);
    } else if (branch.status === 2)
        git(['checkout', '--orphan', 'gh-pages'], scratch);
    else throw new Error('Could not inspect gh-pages: ' + branch.stderr);
    for (const file of fs.readdirSync(scratch))
        if (file !== '.git')
            fs.rmSync(path.join(scratch, file), {
                recursive: true,
                force: true,
            });
    fs.cpSync(path.join(__dirname, 'site'), scratch, { recursive: true });
    fs.mkdirSync(path.join(scratch, '.github', 'workflows'), {
        recursive: true,
    });
    fs.copyFileSync(
        path.join(__dirname, 'static-pages.yml'),
        path.join(scratch, '.github', 'workflows', 'pages.yml'),
    );
    fs.writeFileSync(
        path.join(scratch, 'source.json'),
        JSON.stringify(
            {
                sourceCommit: source,
                repository: config.repository,
                version: require('../package.json').version,
            },
            null,
            2,
        ) + '\n',
    );
    git(['add', '--all'], scratch);
    const changes = spawnSync('git', ['diff', '--cached', '--quiet'], {
        cwd: scratch,
    });
    if (changes.status === 0)
        console.log('Published documentation is already current.');
    else {
        git(
            [
                'commit',
                '-m',
                'Publish FNSPM documentation from ' + source.slice(0, 7),
            ],
            scratch,
        );
        git(['push', 'origin', 'HEAD:gh-pages'], scratch);
        console.log(
            'Pushed static documentation. GitHub Pages deployment runs on gh-pages.',
        );
    }
} finally {
    fs.rmSync(scratch, { recursive: true, force: true });
}
