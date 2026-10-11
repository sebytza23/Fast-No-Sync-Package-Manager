import { isPackageManager } from './package-managers';
import type { PackageManagerType } from './types';

// npm's typed configuration options consume the next argument even before the
// command. Keep these separate from other managers' flags and boolean switches.
const npmValueOptions = [
    '_auth',
    'access',
    'allow-git',
    'also',
    'audit-level',
    'auth-type',
    'before',
    'browser',
    'ca',
    'cache',
    'cache-max',
    'cache-min',
    'cafile',
    'call',
    'cert',
    'cidr',
    'cpu',
    'depth',
    'diff',
    'diff-dst-prefix',
    'diff-src-prefix',
    'diff-unified',
    'editor',
    'expect-result-count',
    'expires',
    'fetch-retries',
    'fetch-retry-factor',
    'fetch-retry-maxtimeout',
    'fetch-retry-mintimeout',
    'fetch-timeout',
    'git',
    'globalconfig',
    'heading',
    'https-proxy',
    'include',
    'init-author-email',
    'init-author-name',
    'init-author-url',
    'init-license',
    'init-module',
    'init-type',
    'init-version',
    'init.author.email',
    'init.author.name',
    'init.author.url',
    'init.license',
    'init.module',
    'init.version',
    'install-strategy',
    'key',
    'libc',
    'local-address',
    'location',
    'lockfile-version',
    'loglevel',
    'logs-dir',
    'logs-max',
    'maxsockets',
    'message',
    'name',
    'node-gyp',
    'node-options',
    'noproxy',
    'omit',
    'only',
    'orgs',
    'orgs-permission',
    'os',
    'otp',
    'pack-destination',
    'package',
    'packages',
    'packages-and-scopes-permission',
    'password',
    'prefix',
    'preid',
    'provenance-file',
    'proxy',
    'registry',
    'replace-registry-host',
    'save-prefix',
    'sbom-format',
    'sbom-type',
    'scope',
    'scopes',
    'script-shell',
    'searchexclude',
    'searchlimit',
    'searchopts',
    'searchstaleness',
    'shell',
    'tag',
    'tag-version-prefix',
    'token-description',
    'umask',
    'user-agent',
    'userconfig',
    'viewer',
    'which',
    'workspace',
];

// npm accepts these aliases and unambiguous command abbreviations.
const npmDependencyCommands = new Set([
    'add',
    'ci',
    'cit',
    'clean-install',
    'clean-install-',
    'clean-install-t',
    'clean-install-te',
    'clean-install-tes',
    'clean-install-test',
    'dd',
    'ddp',
    'ded',
    'dedu',
    'dedup',
    'dedupe',
    'i',
    'ic',
    'in',
    'ins',
    'inst',
    'insta',
    'instal',
    'install',
    'install-ci',
    'install-ci-',
    'install-ci-t',
    'install-ci-te',
    'install-ci-tes',
    'install-ci-test',
    'install-cl',
    'install-cle',
    'install-clea',
    'install-clean',
    'install-t',
    'install-te',
    'install-tes',
    'install-test',
    'isnt',
    'isnta',
    'isntal',
    'isntall',
    'isntall-',
    'isntall-c',
    'isntall-cl',
    'isntall-cle',
    'isntall-clea',
    'isntall-clean',
    'it',
    'pru',
    'prun',
    'prune',
    'r',
    'rb',
    'reb',
    'rebu',
    'rebui',
    'rebuil',
    'rebuild',
    'rem',
    'remo',
    'remov',
    'remove',
    'rm',
    'si',
    'sit',
    'ud',
    'udp',
    'udpa',
    'udpat',
    'udpate',
    'un',
    'uni',
    'unin',
    'unins',
    'uninst',
    'uninsta',
    'uninstal',
    'uninstall',
    'unl',
    'unli',
    'unlin',
    'unlink',
    'up',
    'upd',
    'upda',
    'updat',
    'update',
    'upg',
    'upgr',
    'upgra',
    'upgrad',
    'upgrade',
]);

const npmShorthands: Record<string, string[]> = {
    'enjoy-by': ['--before'],
    d: ['--loglevel', 'info'],
    dd: ['--loglevel', 'verbose'],
    ddd: ['--loglevel', 'silly'],
    quiet: ['--loglevel', 'warn'],
    q: ['--loglevel', 'warn'],
    s: ['--loglevel', 'silent'],
    silent: ['--loglevel', 'silent'],
    verbose: ['--loglevel', 'verbose'],
    desc: ['--description'],
    help: ['--usage'],
    local: ['--no-global'],
    n: ['--no-yes'],
    no: ['--no-yes'],
    porcelain: ['--parseable'],
    readonly: ['--read-only'],
    reg: ['--registry'],
    iwr: ['--include-workspace-root'],
    ws: ['--workspaces'],
    a: ['--all'],
    c: ['--call'],
    f: ['--force'],
    g: ['--global'],
    L: ['--location'],
    l: ['--long'],
    m: ['--message'],
    p: ['--parseable'],
    C: ['--prefix'],
    S: ['--save'],
    B: ['--save-bundle'],
    D: ['--save-dev'],
    E: ['--save-exact'],
    O: ['--save-optional'],
    P: ['--save-prod'],
    '?': ['--usage'],
    H: ['--usage'],
    h: ['--usage'],
    v: ['--version'],
    w: ['--workspace'],
    y: ['--yes'],
};

// Match npm's shorthand expansion only for classification; forwarded args stay literal.
function normalizeNpmArgs(args: string[]): string[] {
    const result: string[] = [];
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--') {
            result.push(...args.slice(i));
            break;
        }
        if (!arg.startsWith('-') || arg === '-') {
            result.push(arg);
            continue;
        }
        if (/^-C[^=]/.test(arg)) {
            result.push('--prefix=' + arg.slice(2));
            continue;
        }
        const [name, ...values] = arg.replace(/^--?/, '').split('=');
        const suffix = values.length ? '=' + values.join('=') : '';
        let expanded = Object.hasOwn(npmShorthands, name)
            ? [...npmShorthands[name]]
            : undefined;
        if (
            !expanded &&
            !arg.startsWith('--') &&
            name.length > 1 &&
            [...name].every((letter) => Object.hasOwn(npmShorthands, letter))
        )
            expanded = [...name].flatMap((letter) => npmShorthands[letter]);
        if (expanded) {
            expanded[expanded.length - 1] += suffix;
            result.push(...expanded);
        } else result.push('--' + name + suffix);
    }
    return result.map((arg) => arg.replace(/^--usage(?==|$)/, '--help'));
}

export function parseRunArgs(args: string[]): {
    manager?: PackageManagerType;
    debug: boolean;
    args: string[];
} {
    let manager: PackageManagerType | undefined;
    let debug = false;
    const forwarded: string[] = [];
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--') {
            forwarded.push(...args.slice(i));
            break;
        }
        if (arg === '--pm' || arg.startsWith('--pm=')) {
            const value = (
                arg === '--pm' ? args[++i] : arg.slice(5)
            )?.toLowerCase();
            if (!isPackageManager(value))
                throw new Error('Use --pm with npm, yarn, pnpm, bun, or deno.');
            if (manager) throw new Error('--pm may only be specified once.');
            manager = value;
        } else if (arg === '--debug') debug = true;
        else forwarded.push(arg);
    }
    if (!forwarded.length || forwarded[0] === '--')
        throw new Error('No package manager command provided.');
    return { manager, debug, args: forwarded };
}

/** Preserve automatic conversion after native commands, scoped to the caller's local dependencies. */
export function shouldAutoMigrate(
    args: string[],
    manager?: PackageManagerType,
): boolean {
    if (manager === 'npm') args = normalizeNpmArgs(args);
    const ownArgs = args.slice(
        0,
        args.indexOf('--') < 0 ? args.length : args.indexOf('--'),
    );
    const switches = new Map<string, boolean>();
    for (let i = 0; i < ownArgs.length; i++) {
        const arg = ownArgs[i];
        if (/^--(prefix|cwd|dir|directory)($|=)/.test(arg) || /^-C/.test(arg))
            return false;
        if (manager === 'npm') {
            if (npmValueOptions.some((name) => arg === '--' + name)) {
                i++;
                continue;
            }
        }
        const option = /^--(no-)?(global|dry-run|help|version)(?:=(.*))?$/.exec(
            arg,
        );
        const short = /^-[^-]*g/.test(arg)
            ? 'global'
            : arg === '-h'
              ? 'help'
              : arg === '-v'
                ? 'version'
                : undefined;
        if (!option && !short) continue;
        let value = option?.[3];
        if (value === undefined && ['true', 'false'].includes(ownArgs[i + 1]))
            value = ownArgs[++i];
        const enabled = value !== 'false';
        switches.set(option?.[2] ?? short!, option?.[1] ? !enabled : enabled);
    }
    return ![...switches.values()].some(Boolean);
}

export function isDependencyCommand(
    args: string[],
    manager?: PackageManagerType,
): boolean {
    if (manager === 'npm') args = normalizeNpmArgs(args);
    // Native managers accept options before the command. Skip their values so
    // `--filter web install` and `--workspace web ci` still restore tracked storage.
    const valueOptions = new Set([
        '--filter',
        '--filter-prod',
        '-F',
        '--workspace',
        '--scope',
        '--registry',
        '--cache',
        '--config',
        '-c',
        '--loglevel',
        '--location',
        '--userconfig',
        '--globalconfig',
        '--store-dir',
        '--modules-folder',
    ]);
    if (manager === 'npm') {
        for (const option of npmValueOptions) valueOptions.add('--' + option);
    }
    let command: string | undefined;
    for (let i = 0; i < args.length && args[i] !== '--'; i++) {
        const arg = args[i];
        if (valueOptions.has(arg)) {
            i++;
            continue;
        }
        if (arg.startsWith('-')) {
            // Native boolean options may have an explicit value. It is not a
            // command, and --color additionally accepts npm's "always" value.
            if (
                !arg.includes('=') &&
                (['true', 'false'].includes(args[i + 1]) ||
                    (manager === 'npm' &&
                        arg === '--color' &&
                        args[i + 1] === 'always'))
            )
                i++;
            continue;
        }
        if (manager === 'pnpm' && ['recursive', 'multi', 'm'].includes(arg))
            continue;
        if (manager === 'yarn' && arg === 'workspace') {
            i++;
            continue;
        }
        command = arg;
        break;
    }
    const dependencyCommand =
        manager === 'npm'
            ? npmDependencyCommands.has(
                  (command ?? '').replace(
                      /[A-Z]/g,
                      (letter) => '-' + letter.toLowerCase(),
                  ),
              )
            : [
                  'install',
                  'i',
                  'add',
                  'ci',
                  'remove',
                  'rm',
                  'uninstall',
                  'update',
                  'up',
                  'upgrade',
                  'clean-install',
                  'install-test',
                  'it',
                  'un',
                  'uni',
                  'rebuild',
                  'rb',
                  'prune',
                  'dedupe',
              ].includes(command ?? '');
    return dependencyCommand && shouldAutoMigrate(args, manager);
}
