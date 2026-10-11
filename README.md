# FNSPM — Fast No Sync Package Manager

Version 1.0.0 adds configuration inspection, guided recovery, complete operation
locks, and a fix for Bun workspace installs through Windows path aliases.

**[Read the documentation](https://sebytza23.github.io/Fast-No-Sync-Package-Manager/)**
for setup guides, project and workspace configuration, the CLI reference,
troubleshooting, and release notes.

You can also open the documentation with `npm docs fnspm`.

FNSPM runs your existing package manager and optionally keeps `node_modules` in a
separate local directory connected by a symlink. It supports npm, Yarn, pnpm,
Bun, and Deno command forwarding. Node.js 22 or newer is required.

This is a wrapper: native command names and flags retain their meaning. It does
not make installs inherently faster or make cloud providers share one exclusion
mechanism.

## Install and run

```sh
npm install -g fnspm
fnspm --help
fnspm --version

fnspm install                       # auto-detect the project's manager
fnspm --pm npm install lodash --save-dev
fnspm --pm yarn add lodash
fnspm --pm pnpm add lodash
fnspm --pm bun add lodash
fnspm --pm deno install npm:lodash
fnspm --debug run build
fnspm run build -- --debug          # pass --debug to the underlying command
```

The selected package manager must already be installed and on `PATH`. FNSPM
preserves argument boundaries, terminal input/output, child exit codes, and
interrupts. It does not install or pin the manager version recorded in your
manifest; `doctor` reports the executable version actually available.

`--pm <manager>` and `--debug` are FNSPM options before `--`. Arguments after
`--`, including wrapper-looking flags, pass through unchanged. `help`,
`initialize`, `init-config`, `doctor`, `migrate`, and `restore` are reserved
FNSPM commands. `fnspm init` still invokes the native manager's `init` command.
Use the manager directly if it has a command that collides with a reserved name.
`config --show` is an FNSPM inspection command; other `config` commands are
forwarded to the selected manager.

## Configuration

Initialization is optional. Without a config file, FNSPM uses npm as its fallback,
auto-detection, and project-local `node_modules.nosync` storage.

```sh
fnspm initialize                    # interactive terminal wizard
fnspm initialize --default          # noninteractive defaults
fnspm initialize --pm pnpm --detection auto --no-symlink
```

Initialization writes into the current directory, including a workspace section.
It writes `fnspm.config.cjs`, or `fnspm.config.mjs` for projects with
`"type": "module"`. Existing configuration is never overwritten. `.js` files are
also supported according to the project's module type. Keep exactly one config
file. Invalid configuration stops execution rather than enabling default settings
unexpectedly.

Partial configuration works; omitted settings receive these defaults:

```js
/** @type {import('fnspm').UserConfig} */
const config = {
    packageManager: { default: 'npm', detection: 'auto' },
    symlink: {
        enabled: true,
        addToGitIgnore: true,
        nosyncName: 'node_modules.nosync',
        // storagePath: '/absolute/path/outside/synced-folders/my-project-deps',
    },
    debug: { verbose: false },
};
module.exports = config; // use `export default config` in .mjs / ESM .js
```

Config files execute as JavaScript, like a package manager's project scripts.
Only load configurations from projects you trust.

| Initialization option                         | Effect                                                            |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `--default`, `-d`                             | Use defaults without prompting; other options still override them |
| `--pm <manager>`                              | Set fallback manager                                              |
| `--detection <mode>`                          | `auto`, `default`, or a manager name                              |
| `--symlink`, `--no-symlink`                   | Enable or disable automatic migration                             |
| `--sync-folder <name>`                        | Set a single project-local directory name                         |
| `--storage-path <absolute-path>`              | Set a dedicated storage directory outside the project             |
| `--no-sync-folder`                            | Alias for `--no-symlink`                                          |
| `--add-to-gitignore`, `--no-add-to-gitignore` | Enable or disable generated ignore rules                          |
| `--verbose`, `--no-verbose`                   | Enable or disable command diagnostics                             |

Legacy boolean forms such as `--symlink true` and `--verbose false` also work.

Inspect the effective settings without running a package manager or changing files:

```sh
fnspm config --show
fnspm config --show --json
fnspm config --show --pm pnpm
```

The report shows the invocation directory, project/detection root, local dependency
directory, selected configuration file, origin of each setting, selected manager
and selection reason, and configured storage path. JSON output uses the same
information. Config files are evaluated as usual; inspection does not run the
selected manager. This is useful when a section inherits a parent config or has
its own override.

## Detection and workspaces

Selection precedence:

1. `--pm` for the current invocation.
2. Explicit config detection (`default` or a manager name).
3. `package.json#packageManager`, such as `"pnpm@10.0.0"`.
4. A single lockfile manager.
5. Deno configuration, then the configured fallback.

Recognized locks: `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`,
`pnpm-lock.yaml`, `bun.lock`, `bun.lockb`, and `deno.lock`. Bun's two formats count
as one manager. Conflicting managers without a manifest declaration require an
explicit choice instead of silently selecting npm.

Configuration and manager detection search upward for the nearest project or
workspace root, stopping at a Git boundary. Root markers include a config file,
a lockfile, `pnpm-workspace.yaml`, `deno.json`/`deno.jsonc`, or a manifest with
`workspaces`. A nested project with its own root marker is treated independently.
Configuration is resolved independently: the closest config applies, including
one inherited from a parent project, until another config or Git boundary. A
section config overrides the parent config as a whole; its omitted fields receive
the built-in defaults. Local migration state or a generated section lockfile does
not discard an inherited configuration. The underlying command still runs in the
directory from which you invoked it, so workspace/package context is preserved.

For example, initialize inside `packages/web` to give it its own manager and
`web.nosync` directory; `packages/api` can use different settings or inherit the
parent config. Each section's local dependency directory is converted separately.

## Inspect, migrate, and restore

```sh
fnspm doctor                       # read-only diagnostics; nonzero for errors
fnspm doctor --pm bun
fnspm doctor --fix --dry-run       # preview safe repairs without writing files
fnspm doctor --fix                 # apply safe repairs, then inspect again
fnspm migrate --dry-run            # inspect without writing files
fnspm migrate                      # migrate existing node_modules explicitly
fnspm restore --dry-run
fnspm restore                      # return tracked dependencies to node_modules
```

`doctor --fix` can recreate a missing link to recorded storage with matching
directory identity, clean up metadata after an interrupted restoration, and add
missing `.gitignore` rules. It validates the repair plan before writing and never
overwrites a conflicting dependency directory or removes an unknown operation
lock. Preview can return a nonzero diagnostic status when a problem still exists;
successful repair is followed by the normal health checks. Invalid or replaced
storage needs manual inspection, and the report explains the next step.

Migration renames the directory and creates a relative symlink on macOS/Linux or
an absolute junction on Windows. It refuses existing destinations, foreign
symlinks, unsafe paths, and cross-filesystem moves. If link creation fails, it
attempts to return the original directory to its previous location. FNSPM records
the directory identity in `.fnspm-state.json`; restoration refuses storage that
was replaced by another directory. Do not copy this state file between projects.

Automatic conversion follows successful native commands, preserving the previous
behavior for `install`, `add`, `run`, `list`, and other commands. It only converts
`node_modules` in the current invocation directory, including workspace sections;
it does not start managing ancestor or sibling directories. Global,
redirected, dry-run, and help/version invocations are excluded. `doctor` itself is
read-only when invoked without `--fix`.

Tracked local storage is restored before dependency-changing commands (even if
automatic migration was disabled), so clean installs can replace `node_modules`.
Matching legacy project-local nosync links are tracked before a clean install;
no dependency files are moved during adoption. After success, local dependencies
are converted again if enabled. Failed installs keep their native exit status
and leave the native layout available for repair. An optional conversion failure
prints a diagnostic without claiming the package manager itself failed.

An install from a workspace section can also replace the shared root dependencies.
If that workspace root already has tracked storage, FNSPM restores it before the
command and converts it again after success using the root's own configuration.
An untracked ancestor directory is left in its native layout.

With `addToGitIgnore`, migration adds root rules for `node_modules`, project-local
storage, migration state, and the operation lock. Both link and target must be
ignored; `node_modules/` alone does not necessarily ignore the symlink itself.
`restore` retains ignore rules and configuration. Use `--no-symlink` / edit the
configuration if future installations should remain in the native layout.

### Storage outside synced folders

Set `storagePath` to an absolute, **dedicated and currently nonexistent** directory
outside the project. Its parent must already exist on the same filesystem. Choose
a different destination for every project. Dependencies containing relative links
to external workspace or linked-package directories cannot be relocated when that
would break those links; use project-local storage in that case.

`.nosync` is an iCloud-oriented convention/workaround, not a cross-provider API.
FNSPM does not configure or verify iCloud, Dropbox, or Google Drive exclusion.
For Dropbox, use its documented [ignored-files mechanism](https://help.dropbox.com/sync/ignored-files).
For other providers, verify their exclusion behavior yourself or place dependency
storage outside the synced folder. Automatic migration happens after installation,
so files may be synced while an install is running. A symlink by itself is not a
guarantee about a provider's behavior.

### Layouts and recovery

- Modern Yarn defaults to [Plug'n'Play](https://yarnpkg.com/features/pnp), which has
  no `node_modules`. FNSPM forwards commands and skips directory migration.
- Deno can use a global cache or local `node_modules`, depending on its
  [configuration](https://docs.deno.com/runtime/reference/deno_json/). Only an
  existing local dependency directory can be migrated.
- FNSPM expands Windows short directory names (such as `RUNNER~1`) and resolves
  directory aliases before launching Bun. This avoids Bun's workspace link
  failure when its current directory and resolved manifest use different path
  spellings. Native tests verify installs and frozen installs through short
  paths and junctions, including projects and Bun installed on different drives,
  workspace links, relative lockfile keys, automatic conversion, and restoration.
- A valid project-local symlink from FNSPM 0.2 that matches `nosyncName` is adopted
  without moving or deleting dependency files. Run `migrate --dry-run` to inspect
  adoption, or `migrate` to record ownership before `restore`. Automatic conversion
  also adopts these links. Foreign, broken, and untracked external links are never
  adopted or moved automatically.
- If a migration was interrupted, `doctor` identifies broken links/state. A
  tracked target with a missing source can be recovered using `migrate` or
  `restore`. A stale `.fnspm-operation.lock` requires checking that the recorded
  process is no longer running before removing the lock. Never delete dependency
  storage to resolve a lock or destination conflict.
- FNSPM holds operation locks while restoring, running the native command, and
  converting dependencies. Local dependency-changing commands are protected even
  when automatic conversion is disabled. Workspace sections also lock their
  shared root, including roots not yet migrated. Concurrent or nested FNSPM
  commands targeting that scope fail promptly before another manager starts;
  independent projects remain independent. Global, redirected, help/version, and
  dry-run native commands retain their existing exclusions. Direct package
  manager invocations and cloud clients do not participate in these locks.
- Restore dependencies before moving/renaming a project or changing storage to
  another device. Absolute links pointing into the storage must be changed to
  relative links before restoration. Recorded ownership and absolute external paths are local to
  the original project location.

## Development and validation

```sh
npm ci
npm run check
npm test
npm run test:package
npm run test:managers -- npm yarn pnpm bun deno  # each manager must be on PATH
npm run format:check
npm audit
```

The CLI uses the root npm lockfile; documentation has a separate private build
package and lockfile in `docs/`. Tests cover CLI forwarding, CJS/ESM configs,
workspace detection, migration collisions, rollback, interrupted operations,
restoration, and publish-artifact installation/type checking. `prepack` builds the
CLI and declarations automatically. Importing `fnspm` does not execute the CLI.
CI runs on Node 22/24 across macOS, Linux, and Windows. Cloud-provider behavior is
not part of automated tests, and command forwarding is not a promise that every
historical package manager version shares the same dependency layout.

Native tests cover all five managers, repeat and locked installations, upgrades
from legacy links, workspace sections, restoration, Yarn PnP, and cache-only Deno.
They use local archives and a private localhost fixture registry; project
dependencies are not downloaded from the public npm registry. CI installs the
pinned manager versions recorded in its workflow before running these scenarios.

## Compatibility for 1.0

The supported public interface consists of the documented CLI commands/options,
configuration fields and resolution rules, and top-level exported types and
`main` function. Existing 0.3 CJS/ESM configs, section overrides, native argument
forwarding, exit codes, and local auto-conversion remain supported. Internal
`dist/src` modules and operation metadata are implementation details; `migrate`,
`restore`, and `doctor` manage that metadata. Breaking public-interface changes
after 1.0 require a new major version.

## License and contributing

[GPL-3.0-only](LICENSE). Commercial use is permitted under the GPL's terms; see
[GNU's licensing FAQ](https://www.gnu.org/licenses/gpl-faq.en.html#DoesTheGPLAllowMoney).
The previous README's non-commercial restriction was inconsistent with the GPL
license file and has been removed. Contributions are welcome via pull requests.

Author: Marin-Eusebiu Șerban.

[Support the project](https://buymeacoffee.com/serban_marin_eusebiu).
