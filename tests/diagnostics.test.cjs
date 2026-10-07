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

test('information JSON reports project context and health without migrating native dependencies', (t) => {
    const root = fixture(t, { packageManager: 'pnpm@12.9.1' });
    config(root, { symlink: { enabled: false } });
    const source = dependencies(root);
    const result = run(root, ['--info', '--json'], stub(root));
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.status, 'healthy');
    assert.equal(report.runtime.fnspm, require('../package.json').version);
    assert.equal(report.runtime.node, process.versions.node);
    assert.equal(report.project.root, root);
    assert.equal(
        report.configuration.file,
        path.join(root, 'fnspm.config.cjs'),
    );
    assert.equal(report.packageManager.name, 'pnpm');
    assert.match(report.packageManager.reason, /package.json/);
    assert.equal(report.packageManager.version, '1.0.0');
    assert.equal(report.dependencies.layout, 'native');
    assert.equal(report.dependencies.size, null);
    assert.equal(report.repair.requested, false);
    assert.ok(fs.lstatSync(source).isDirectory());
    assert.ok(!fs.existsSync(path.join(root, '.fnspm-state.json')));
    assert.ok(!fs.existsSync(path.join(root, '.gitignore')));
});

test('information and why flags preserve independent section settings and inherited workspace context', (t) => {
    const root = fixture(t, { workspaces: ['packages/*'] });
    config(root, {
        packageManager: { default: 'npm', detection: 'default' },
        symlink: { enabled: false },
    });
    const section = path.join(root, 'packages', 'web');
    fs.mkdirSync(section, { recursive: true });
    fs.writeFileSync(path.join(section, 'package.json'), '{}');
    config(section, {
        packageManager: { default: 'bun', detection: 'default' },
        symlink: { enabled: false },
    });
    const env = stub(root);
    const info = JSON.parse(run(section, ['--info', '--json'], env).stdout);
    assert.equal(info.project.root, section);
    assert.deepEqual(info.project.workspaceRoots, [root]);
    assert.equal(info.packageManager.name, 'bun');
    fs.unlinkSync(env.ARGS_LOG);
    const why = run(section, ['--why', '--json', '--pm', 'pnpm'], env);
    assert.equal(why.status, 0, why.stderr);
    const report = JSON.parse(why.stdout);
    assert.equal(report.config.packageManager.default, 'bun');
    assert.equal(report.packageManager.name, 'pnpm');
    assert.equal(
        report.origins['packageManager.default'],
        path.join(section, 'fnspm.config.cjs'),
    );
    assert.ok(
        !fs.existsSync(env.ARGS_LOG),
        'why must not probe or execute a manager',
    );
});

test('doctor JSON retains error codes and outputs valid JSON for malformed config and project manifests', (t) => {
    const root = fixture(t);
    fs.writeFileSync(
        path.join(root, 'fnspm.config.cjs'),
        'throw new Error("broken config")',
    );
    for (const args of [
        ['doctor', '--json'],
        ['--info', '--json'],
    ]) {
        const result = run(root, args);
        assert.equal(result.status, 1);
        assert.equal(result.stderr, '');
        const report = JSON.parse(result.stdout);
        assert.equal(report.status, 'error');
        assert.equal(report.issues[0].code, 'configuration.invalid');
        assert.match(report.issues[0].message, /broken config/);
    }
    fs.unlinkSync(path.join(root, 'fnspm.config.cjs'));
    fs.writeFileSync(path.join(root, 'package.json'), '{broken');
    const result = run(root, ['--info', '--json']);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).issues[0].code, 'project.invalid');
});

test('doctor JSON describes repair previews and resulting managed storage without premature writes', (t) => {
    const root = fixture(t);
    const source = dependencies(root);
    const env = stub(root);
    assert.equal(run(root, ['migrate']).status, 0);
    fs.unlinkSync(source);
    const preview = run(root, ['doctor', '--json', '--fix', '--dry-run'], env);
    assert.equal(preview.status, 1);
    const report = JSON.parse(preview.stdout);
    assert.equal(report.dependencies.state, 'recovery-needed');
    assert.equal(report.repair.dryRun, true);
    assert.ok(
        report.repair.actions.some((action) =>
            action.includes('Recover recorded link'),
        ),
    );
    assert.ok(!fs.existsSync(source));
    const repair = run(root, ['doctor', '--json', '--fix'], env);
    assert.equal(repair.status, 0, repair.stderr);
    const repaired = JSON.parse(repair.stdout);
    assert.equal(repaired.dependencies.state, 'valid');
    assert.equal(repaired.dependencies.layout, 'symlink');
    assert.ok(fs.lstatSync(source).isSymbolicLink());
    assert.equal(
        fs.readFileSync(path.join(source, 'sentinel.txt'), 'utf8'),
        'preserve me',
    );
});

test('optional dependency size counts unique regular-file bytes and skips child symlinks', (t) => {
    const root = fixture(t);
    config(root, { symlink: { enabled: false } });
    const source = dependencies(root);
    const file = path.join(source, 'sentinel.txt');
    fs.linkSync(file, path.join(source, 'hardlink.txt'));
    const external = fixture(t);
    fs.writeFileSync(path.join(external, 'do-not-count'), 'x'.repeat(1000));
    directoryLink(external, path.join(source, 'external'));
    const result = run(root, ['--info', '--json', '--size'], stub(root));
    assert.equal(result.status, 0, result.stderr);
    const size = JSON.parse(result.stdout).dependencies.size;
    assert.equal(size.apparentBytes, String(Buffer.byteLength('preserve me')));
    assert.equal(size.files, 2);
    assert.equal(size.hardlinksDeduplicated, 1);
    assert.equal(size.skippedSymlinks, 1);
    assert.equal(size.complete, true);
});

test('size inspection refuses foreign storage and information cannot apply repairs', (t) => {
    const root = fixture(t);
    const foreign = fixture(t);
    directoryLink(foreign, path.join(root, 'node_modules'));
    const result = run(root, ['--info', '--json', '--size'], stub(root));
    const report = JSON.parse(result.stdout);
    assert.equal(report.dependencies.size, null);
    assert.ok(report.issues.some((issue) => issue.code === 'size.unverified'));
    assert.equal(run(root, ['--info', '--fix']).status, 1);
    assert.equal(run(root, ['--info', '--dry-run']).status, 1);
    assert.ok(!fs.existsSync(path.join(root, '.fnspm-state.json')));
});

test('information flags and native info, why, clean and completion retain native argument forwarding', (t) => {
    const root = fixture(t);
    config(root, { symlink: { enabled: false } });
    const env = stub(root);
    for (const args of [
        ['info', 'example'],
        ['why', 'example'],
        ['clean'],
        ['completion'],
        ['run', 'task', '--info', '--why'],
        ['run', 'task', '--', '--info', '--why', '--completion', 'bash'],
    ]) {
        const result = run(root, ['--pm', 'npm', ...args], env);
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(
            JSON.parse(fs.readFileSync(env.ARGS_LOG, 'utf8')).args,
            args,
        );
    }
});
