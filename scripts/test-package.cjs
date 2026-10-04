// Exercise the publish artifact, not a workspace that accidentally supplies missing files.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const spawn = require('cross-spawn');
const root = path.resolve(__dirname, '..');
const manifest = require('../package.json');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'fnspm-package-'));
function command(executable, args, cwd = scratch) {
    const result = spawn.sync(executable, args, {
        cwd,
        encoding: 'utf8',
        timeout: 120000,
    });
    if (result.error || result.status !== 0)
        throw new Error(
            `${executable} ${args.join(' ')} failed:\n${result.error || result.stderr}\n${result.stdout}`,
        );
    return result.stdout;
}
try {
    const pack = JSON.parse(
        command('npm', ['pack', '--json', '--pack-destination', scratch], root),
    )[0];
    const files = new Set(pack.files.map((file) => file.path));
    for (const file of [
        'dist/index.js',
        'dist/index.d.ts',
        'dist/src/utils/types.d.ts',
        'dist/src/utils/package-managers.d.ts',
    ])
        assert.ok(files.has(file), `Missing ${file}`);
    assert.ok(
        ![...files].some(
            (file) => file.startsWith('tests/') || file.startsWith('src/'),
        ),
    );
    fs.writeFileSync(
        path.join(scratch, 'package.json'),
        JSON.stringify({ private: true, type: 'commonjs' }),
    );
    command('npm', [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        path.join(scratch, pack.filename),
    ]);
    const executable = path.join(
        scratch,
        'node_modules',
        'fnspm',
        'dist',
        'index.js',
    );
    assert.equal(
        command(process.execPath, [executable, '--version']).trim(),
        manifest.version,
    );
    assert.match(command(process.execPath, [executable, '--help']), /doctor/);
    const installedBin = path.join(
        scratch,
        'node_modules',
        '.bin',
        process.platform === 'win32' ? 'fnspm.cmd' : 'fnspm',
    );
    assert.equal(command(installedBin, ['--version']).trim(), manifest.version);
    assert.equal(
        command(process.execPath, [
            '-e',
            "require('fnspm'); console.log('imported')",
        ]).trim(),
        'imported',
    );
    fs.writeFileSync(
        path.join(scratch, 'consumer.ts'),
        `import type { Config, UserConfig, PackageManagerType } from 'fnspm';
const manager: PackageManagerType = 'bun';
const config: UserConfig = { symlink: { enabled: false } };
declare const full: Config;
const valid: PackageManagerType = full.packageManager.default;
// @ts-expect-error unsupported manager must not become any
const invalid: PackageManagerType = 'unsupported';
void [manager, config, valid, invalid];\n`,
    );
    fs.writeFileSync(
        path.join(scratch, 'tsconfig.json'),
        JSON.stringify({
            compilerOptions: {
                strict: true,
                noEmit: true,
                skipLibCheck: false,
                target: 'ES2022',
                module: 'NodeNext',
                moduleResolution: 'NodeNext',
                types: [],
            },
            include: ['consumer.ts'],
        }),
    );
    command(process.execPath, [
        path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
        '-p',
        path.join(scratch, 'tsconfig.json'),
    ]);
    console.log(
        `Package verified: ${manifest.name}@${manifest.version} — installed CLI, side-effect-free import, complete TypeScript declarations.`,
    );
} finally {
    fs.rmSync(scratch, { recursive: true, force: true });
}
