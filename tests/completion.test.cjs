const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { fixture, run } = require('./support.cjs');
const { completionScript } = require('../dist/src/utils/completion.js');

function available(shell) {
    return !spawnSync(shell, ['--version'], { encoding: 'utf8' }).error;
}
const scenarios = [
    { words: ['fnspm', '--pm='], includes: ['--pm=npm', '--pm=bun'] },
    {
        words: ['fnspm', 'initialize', '--detection='],
        includes: ['--detection=auto', '--detection=bun'],
    },
    {
        words: ['fnspm', '--pm=bun', 'doctor', ''],
        includes: ['--json', '--size'],
    },
    {
        words: ['fnspm', ''],
        includes: ['--info', '--why', '--storage', '--relocate', 'doctor'],
    },
    { words: ['fnspm', '--storage', ''], includes: ['list', 'register'] },
    {
        words: ['fnspm', '--storage', 'list', ''],
        includes: ['--json', '--size'],
    },
    {
        words: ['fnspm', '--storage', 'register', ''],
        includes: ['--json'],
        excludes: ['--size'],
    },
    {
        words: ['fnspm', '--relocate', ''],
        includes: [
            '--external',
            '--configured',
            '--recover',
            '--dry-run',
            '--json',
        ],
    },
    {
        words: ['fnspm', '--relocate', '--external', ''],
        includes: ['--json', '--dry-run'],
        excludes: ['--configured', '--recover'],
    },
    { words: ['fnspm', 'initialize', ''], includes: ['--external'] },
    {
        words: ['fnspm', '--pm', 'bun', ''],
        includes: ['doctor', 'config'],
        excludes: [
            '--info',
            '--why',
            '--completion',
            'initialize',
            'migrate',
            'restore',
        ],
    },
    {
        words: ['fnspm', '--pm', 'bun', '--info', ''],
        excludes: ['--json', '--size'],
    },
    {
        words: ['fnspm', '--pm', ''],
        includes: ['npm', 'pnpm'],
        excludes: ['doctor'],
    },
    {
        words: ['fnspm', '--pm', 'bun', 'doctor', ''],
        includes: ['--json', '--size', '--fix'],
        excludes: ['--dry-run'],
    },
    { words: ['fnspm', 'doctor', '--fix', ''], includes: ['--dry-run'] },
    {
        words: ['fnspm', '--info', ''],
        includes: ['--json', '--size'],
        excludes: ['--fix', '--dry-run'],
    },
    {
        words: ['fnspm', '--completion', ''],
        includes: ['bash', 'zsh', 'fish', 'powershell'],
    },
    {
        words: ['fnspm', 'initialize', '--detection', ''],
        includes: ['auto', 'default', 'bun'],
    },
    { words: ['fnspm', 'config', '--show', ''], includes: ['--json'] },
    { words: ['fnspm', 'config', 'get', ''], excludes: ['--show', '--json'] },
    {
        words: ['fnspm', 'run', 'build', '--', ''],
        excludes: ['--info', '--why', '--pm', '--debug'],
    },
];
function verify(result, scenario) {
    assert.equal(
        result.status,
        0,
        JSON.stringify(scenario.words) +
            '\n' +
            result.stderr +
            '\n' +
            result.stdout,
    );
    const values = result.stdout
        .trim()
        .split(/\r?\n/)
        .map((value) => value.split('\t')[0])
        .filter(Boolean);
    for (const word of scenario.includes ?? [])
        assert.ok(
            values.includes(word),
            'Missing ' +
                word +
                ' for ' +
                JSON.stringify(scenario.words) +
                '\n' +
                result.stdout,
        );
    for (const word of scenario.excludes ?? [])
        assert.ok(
            !values.includes(word),
            'Unexpected ' + word + ' for ' + JSON.stringify(scenario.words),
        );
}
test('completion generation works without evaluating config or writing files', (t) => {
    const root = fixture(t);
    fs.writeFileSync(
        path.join(root, 'fnspm.config.cjs'),
        'throw new Error("completion must not load configuration")',
    );
    const before = fs.readdirSync(root);
    for (const shell of ['bash', 'zsh', 'fish', 'powershell']) {
        const result = run(root, ['--completion', shell]);
        assert.equal(result.status, 0, result.stderr);
        assert.ok(result.stdout.includes('fnspm'));
    }
    assert.equal(run(root, ['--completion', 'unsupported']).status, 1);
    assert.equal(run(root, ['--completion', 'bash', 'extra']).status, 1);
    assert.deepEqual(fs.readdirSync(root), before);
});
for (const shell of ['bash', 'zsh', 'fish', 'pwsh']) {
    test(
        shell +
            ' completion registration and contexts work in the actual shell',
        { skip: !available(shell) },
        (t) => {
            const root = fixture(t);
            const file = path.join(
                root,
                shell === 'pwsh' ? 'completion.ps1' : 'completion',
            );
            fs.writeFileSync(
                file,
                completionScript(shell === 'pwsh' ? 'powershell' : shell),
            );
            for (const scenario of scenarios) {
                let script;
                if (shell === 'bash')
                    script =
                        'source "$1"\nCOMP_WORDS=("${@:2}")\nCOMP_CWORD=$((${#COMP_WORDS[@]}-1))\n_fnspm_complete\nprintf "%s\\n" "${COMPREPLY[@]}"';
                if (shell === 'zsh')
                    script =
                        'autoload -Uz compinit; compinit -D\nsource "$1"\nshift\nwords=("$@")\nCURRENT=${#words[@]}\ncompadd() { [ "$1" = "--" ] && shift; printf "%s\\n" "$@"; }\n_files() { :; }\n_fnspm_complete';
                if (shell === 'fish')
                    script = 'source "$argv[1]"\ncomplete -C "$argv[2]"';
                if (shell === 'pwsh') {
                    const driver = path.join(root, 'driver.ps1');
                    fs.writeFileSync(
                        driver,
                        'param([string]$CompletionFile, [string]$Line)\n. $CompletionFile\n(TabExpansion2 $Line $Line.Length).CompletionMatches | ForEach-Object { $_.CompletionText }',
                    );
                    verify(
                        spawnSync(
                            shell,
                            [
                                '-NoProfile',
                                '-NonInteractive',
                                '-File',
                                driver,
                                file,
                                scenario.words.join(' '),
                            ],
                            { cwd: root, encoding: 'utf8', timeout: 20000 },
                        ),
                        scenario,
                    );
                    continue;
                }
                const args =
                    shell === 'fish'
                        ? ['-c', script, file, scenario.words.join(' ')]
                        : ['-c', script, 'fixture', file, ...scenario.words];
                verify(
                    spawnSync(shell, args, {
                        cwd: root,
                        encoding: 'utf8',
                        timeout: 20000,
                    }),
                    scenario,
                );
            }
        },
    );
}
