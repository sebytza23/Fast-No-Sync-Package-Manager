const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('./support.cjs');
const { mergeConfig } = require('../dist/src/utils/config.js');
const { detectPackageManager } = require('../dist/src/utils/detection.js');
const { findProjectRoot } = require('../dist/src/utils/project.js');
const touch = (root, file) => fs.writeFileSync(path.join(root, file), '');
for (const [file, manager] of [
    ['package-lock.json', 'npm'],
    ['npm-shrinkwrap.json', 'npm'],
    ['yarn.lock', 'yarn'],
    ['pnpm-lock.yaml', 'pnpm'],
    ['bun.lockb', 'bun'],
    ['bun.lock', 'bun'],
    ['deno.lock', 'deno'],
    ['deno.jsonc', 'deno'],
])
    test(`detect ${file}`, (t) => {
        const root = fixture(t);
        touch(root, file);
        assert.equal(detectPackageManager(root, mergeConfig()), manager);
    });
test('packageManager beats conflicting lockfiles', (t) => {
    const root = fixture(t, { packageManager: 'bun@1.4.2' });
    touch(root, 'bun.lock');
    touch(root, 'package-lock.json');
    assert.equal(detectPackageManager(root, mergeConfig()), 'bun');
});
test('Bun binary and text locks count as one manager', (t) => {
    const root = fixture(t);
    touch(root, 'bun.lock');
    touch(root, 'bun.lockb');
    assert.equal(detectPackageManager(root, mergeConfig()), 'bun');
});
test('ambiguous lockfiles require explicit choice', (t) => {
    const root = fixture(t);
    touch(root, 'bun.lock');
    touch(root, 'package-lock.json');
    assert.throws(
        () => detectPackageManager(root, mergeConfig()),
        /Multiple package managers/,
    );
    assert.equal(
        detectPackageManager(
            root,
            mergeConfig({ packageManager: { detection: 'yarn' } }),
        ),
        'yarn',
    );
});
test('default detection ignores project manager and validates unsupported declarations', (t) => {
    const root = fixture(t, { packageManager: 'unknown@1' });
    assert.throws(
        () => detectPackageManager(root, mergeConfig()),
        /Unsupported/,
    );
    assert.equal(
        detectPackageManager(
            root,
            mergeConfig({
                packageManager: { detection: 'default', default: 'pnpm' },
            }),
        ),
        'pnpm',
    );
});
test('find workspace root from nested package', (t) => {
    const root = fixture(t, { workspaces: ['packages/*'] });
    const nested = path.join(root, 'packages', 'app', 'src');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(root, 'packages', 'app', 'package.json'), '{}');
    assert.equal(findProjectRoot(nested), root);
});
test('prefer a standalone nested project over parent workspace', (t) => {
    const root = fixture(t, { workspaces: ['packages/*'] });
    const child = path.join(root, 'standalone');
    fs.mkdirSync(child);
    touch(child, 'bun.lock');
    assert.equal(findProjectRoot(child), child);
});
test('stop at git boundary without inheriting parent config', (t) => {
    const root = fixture(t);
    touch(root, 'fnspm.config.cjs');
    const child = path.join(root, 'other');
    fs.mkdirSync(child);
    fs.mkdirSync(path.join(child, '.git'));
    assert.equal(findProjectRoot(child), child);
});
