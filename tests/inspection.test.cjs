const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    fixture,
    config,
    dependencies,
    stub,
    run,
    directoryLink,
} = require('./support.cjs');

test('config inspection explains inherited settings, defaults, and manager override without writes', (t) => {
    const root = fixture(t, {
        workspaces: ['packages/*'],
        packageManager: 'pnpm@12.9.1',
    });
    config(root, { symlink: { nosyncName: 'shared.nosync' } });
    const section = path.join(root, 'packages', 'web');
    fs.mkdirSync(section, { recursive: true });
    fs.writeFileSync(path.join(section, 'package.json'), '{}');
    dependencies(section);
    const before = fs.readdirSync(section);
    const result = run(section, ['config', '--show', '--json']);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.cwd, section);
    assert.equal(report.projectRoot, root);
    assert.equal(report.dependencyRoot, section);
    assert.equal(report.configurationFile, path.join(root, 'fnspm.config.cjs'));
    assert.equal(
        report.origins['symlink.nosyncName'],
        report.configurationFile,
    );
    assert.equal(report.origins['symlink.enabled'], 'built-in default');
    assert.equal(report.packageManager.name, 'pnpm');
    assert.match(report.packageManager.reason, /package.json/);
    assert.equal(report.dependencyStorage, path.join(section, 'shared.nosync'));
    assert.deepEqual(fs.readdirSync(section), before);
    const override = JSON.parse(
        run(section, ['config', '--show', '--json', '--pm', 'bun']).stdout,
    );
    assert.equal(override.packageManager.name, 'bun');
    assert.match(override.packageManager.reason, /override/);
});

test('section configuration inspection preserves independent overrides and native config commands', (t) => {
    const root = fixture(t, { workspaces: ['packages/*'] });
    config(root, { symlink: { enabled: false, nosyncName: 'parent.nosync' } });
    const section = path.join(root, 'web');
    fs.mkdirSync(section);
    config(section, { symlink: { nosyncName: 'child.nosync' } });
    const report = JSON.parse(
        run(section, ['config', '--show', '--json']).stdout,
    );
    assert.equal(report.config.symlink.enabled, true);
    assert.equal(
        report.configurationFile,
        path.join(section, 'fnspm.config.cjs'),
    );
    assert.equal(report.config.symlink.nosyncName, 'child.nosync');
    const env = stub(root);
    assert.equal(
        run(section, ['--pm', 'npm', 'config', 'get', 'registry'], env).status,
        0,
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(env.ARGS_LOG)).args, [
        'config',
        'get',
        'registry',
    ]);
    assert.equal(
        run(section, ['--pm', 'npm', 'config', '--', '--show'], env).status,
        0,
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(env.ARGS_LOG)).args, [
        'config',
        '--',
        '--show',
    ]);
});

test('doctor previews and repairs ignore rules without moving dependency files', (t) => {
    const root = fixture(t);
    dependencies(root);
    const env = stub(root);
    assert.equal(run(root, ['migrate']).status, 0);
    const ignore = path.join(root, '.gitignore');
    fs.writeFileSync(ignore, 'logs/\r\n');
    const before = fs.readFileSync(
        path.join(root, '.fnspm-state.json'),
        'utf8',
    );
    const preview = run(
        root,
        ['doctor', '--pm', 'npm', '--fix', '--dry-run'],
        env,
    );
    assert.equal(preview.status, 0, preview.stderr + preview.stdout);
    assert.match(preview.stdout, /Would add/);
    assert.equal(fs.readFileSync(ignore, 'utf8'), 'logs/\r\n');
    assert.ok(!fs.existsSync(path.join(root, '.fnspm-operation.lock')));
    assert.equal(run(root, ['doctor', '--pm', 'npm', '--fix'], env).status, 0);
    assert.equal(
        fs.readFileSync(path.join(root, '.fnspm-state.json'), 'utf8'),
        before,
    );
    assert.match(fs.readFileSync(ignore, 'utf8'), /\/node_modules\r\n/);
    assert.match(
        run(root, ['doctor', '--pm', 'npm', '--fix'], env).stdout,
        /No safe repairs needed/,
    );
});

test('doctor restores only a missing link to identity-confirmed storage', (t) => {
    const root = fixture(t);
    dependencies(root);
    const env = stub(root);
    run(root, ['migrate']);
    const source = path.join(root, 'node_modules');
    fs.unlinkSync(source);
    const preview = run(
        root,
        ['doctor', '--pm', 'npm', '--fix', '--dry-run'],
        env,
    );
    assert.equal(preview.status, 1);
    assert.match(preview.stdout, /Recover recorded link/);
    assert.ok(!fs.existsSync(source));
    const result = run(root, ['doctor', '--pm', 'npm', '--fix'], env);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.ok(fs.lstatSync(source).isSymbolicLink());
    assert.equal(
        fs.readFileSync(path.join(source, 'sentinel.txt'), 'utf8'),
        'preserve me',
    );
});

test('doctor finishes interrupted restoration without moving the restored directory', (t) => {
    const root = fixture(t);
    dependencies(root);
    run(root, ['migrate']);
    const source = path.join(root, 'node_modules');
    fs.unlinkSync(source);
    fs.renameSync(path.join(root, 'node_modules.nosync'), source);
    const result = run(root, ['doctor', '--fix', '--pm', 'npm'], stub(root));
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.ok(!fs.existsSync(path.join(root, '.fnspm-state.json')));
    assert.ok(fs.lstatSync(source).isDirectory());
    assert.equal(
        fs.readFileSync(path.join(source, 'sentinel.txt'), 'utf8'),
        'preserve me',
    );
});

test('doctor refuses replaced storage and malformed state before applying any repairs', (t) => {
    const root = fixture(t);
    dependencies(root);
    run(root, ['migrate']);
    const env = stub(root);
    const target = path.join(root, 'node_modules.nosync');
    fs.renameSync(target, path.join(root, 'saved-dependencies'));
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'foreign'), 'keep');
    fs.writeFileSync(path.join(root, '.gitignore'), 'untouched\n');
    assert.equal(run(root, ['doctor', '--fix', '--pm', 'npm'], env).status, 1);
    assert.equal(fs.readFileSync(path.join(target, 'foreign'), 'utf8'), 'keep');
    assert.equal(
        fs.readFileSync(path.join(root, '.gitignore'), 'utf8'),
        'untouched\n',
    );
    fs.writeFileSync(path.join(root, '.fnspm-state.json'), '{broken');
    const result = run(root, ['doctor', '--fix', '--pm', 'npm'], env);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Repair refused/);
    assert.equal(
        fs.readFileSync(path.join(root, '.gitignore'), 'utf8'),
        'untouched\n',
    );
});

test('doctor preflights unsafe ignore files before repairing a missing link', (t) => {
    const root = fixture(t);
    dependencies(root);
    run(root, ['migrate']);
    fs.unlinkSync(path.join(root, 'node_modules'));
    fs.unlinkSync(path.join(root, '.gitignore'));
    // A directory is rejected consistently on Windows and POSIX.
    fs.mkdirSync(path.join(root, '.gitignore'));
    const result = run(root, ['doctor', '--fix', '--pm', 'npm'], stub(root));
    assert.equal(result.status, 1);
    assert.ok(!fs.existsSync(path.join(root, 'node_modules')));
});

test('doctor never adopts foreign legacy links or clears unknown operation locks', (t) => {
    const root = fixture(t);
    const foreign = fixture(t);
    directoryLink(foreign, path.join(root, 'node_modules'));
    fs.writeFileSync(path.join(root, '.fnspm-operation.lock'), 'unknown owner');
    const result = run(root, ['doctor', '--fix', '--pm', 'npm'], stub(root));
    assert.equal(result.status, 1);
    assert.equal(
        fs.readFileSync(path.join(root, '.fnspm-operation.lock'), 'utf8'),
        'unknown owner',
    );
    assert.ok(!fs.existsSync(path.join(root, '.fnspm-state.json')));
});
