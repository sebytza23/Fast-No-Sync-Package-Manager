# Package managers

## Selection precedence

The first applicable rule selects the manager:

1. CLI `--pm` for this invocation.
2. Configured detection: a fixed manager name, or `'default'` to use the configured fallback.
3. The manager declared in `package.json#packageManager`.
4. A single recognized lockfile manager.
5. Deno configuration (`deno.json` or `deno.jsonc`).
6. The configured fallback, npm by default.

For example, a manifest declaration of `"packageManager": "pnpm@12.9.1"` selects pnpm in automatic mode. It does not install pnpm or require the available executable to be version 12.9.1. Pin and provision manager versions through your normal toolchain.

Inspect the decision without executing the manager:

```sh
fnspm config --show
fnspm config --show --pm bun
```

## Recognized lockfiles

| Manager | Lockfiles                                  |
| ------- | ------------------------------------------ |
| npm     | `package-lock.json`, `npm-shrinkwrap.json` |
| Yarn    | `yarn.lock`                                |
| pnpm    | `pnpm-lock.yaml`                           |
| Bun     | `bun.lock`, `bun.lockb`                    |
| Deno    | `deno.lock`                                |

Bun's binary and text lockfiles count as one manager. Lockfiles from different managers require an explicit selection when no earlier rule applies. FNSPM does not silently delete a competing lockfile.

## Keep native commands native

These examples use each manager's own command names:

| Task                   | Example                                     |
| ---------------------- | ------------------------------------------- |
| npm install            | `fnspm --pm npm install`                    |
| npm clean install      | `fnspm --pm npm ci`                         |
| Yarn add               | `fnspm --pm yarn add lodash`                |
| Yarn immutable install | `fnspm --pm yarn install --immutable`       |
| pnpm add               | `fnspm --pm pnpm add lodash`                |
| pnpm locked install    | `fnspm --pm pnpm install --frozen-lockfile` |
| Bun add                | `fnspm --pm bun add lodash`                 |
| Bun locked install     | `fnspm --pm bun install --frozen-lockfile`  |
| Deno npm dependency    | `fnspm --pm deno install npm:lodash`        |

Locked or immutable installs require an appropriate existing lockfile. A fresh project may need a normal install first. FNSPM does not generate lockfiles itself.

When a native command fails, FNSPM preserves its exit code and output. See the manager's own documentation for unsupported flags or lockfile-format errors.

## npm and pnpm workspaces

Workspace selectors and recursive operations remain native:

```sh
fnspm --pm npm --workspace web ci
fnspm --pm pnpm --filter web install --frozen-lockfile
fnspm --pm pnpm -w install
```

FNSPM recognizes common selector options before a dependency command, so tracked storage is restored before the manager can replace it. The manager determines where dependencies are actually installed.

## Yarn Plug'n'Play

Modern Yarn can use Plug'n'Play rather than `node_modules`. FNSPM forwards commands and leaves that layout to Yarn; there is no local dependency directory to convert.

If your project intentionally uses Yarn's node-modules linker, that local directory can be managed when relocation checks pass. FNSPM does not change `nodeLinker` or rewrite `.yarnrc.yml`.

Use Yarn's own runtime commands and configuration for PnP imports. A plain Node.js command may need Yarn's PnP loader; FNSPM does not install that loader into Node globally.

## Deno dependency layouts

Deno can use a global cache or a local `node_modules`, depending on the project's Deno configuration. FNSPM converts only an existing local dependency directory.

```sh
fnspm --pm deno task build
fnspm --pm deno cache main.ts
```

Deno still controls permissions, tasks, imports, and caching. A cache-only project reporting no local `node_modules` is a supported outcome.

## Bun on Windows

Version 1.0 expands Windows short path names such as `RUNNER~1` and resolves directory aliases before launching Bun. This keeps Bun's current-directory spelling consistent with the resolved manifest path when it links workspace packages.

The native test suite reproduces the direct Bun 1.4.2 short-path failure, then verifies successful FNSPM installs and frozen installs, workspace imports, relative lockfile keys, conversion, and restoration through short paths and cross-drive junctions.

The Bun executable and project do not need to share a drive for this fix. Moving dependency storage still has the same-filesystem requirement described in [Dependency storage](storage.md).

Native redirect flags remain forwarded unchanged. The normalization applies to the launch directory, rather than rewriting a user's command or manager configuration.

## Validation scope

The v1 native suite uses npm, Yarn 4.18.1, pnpm 12.9.1, Bun 1.4.2, and Deno 2.9.6, with Node 22 and 24 across Windows, Linux, and macOS. It covers repeated and locked installs, workspace sections, restoration, legacy upgrades, Yarn PnP, and cache-only Deno using local fixtures.

This verifies the tested workflows and layouts. It does not establish that every historical manager release uses compatible dependency layouts. The pinned versions used by CI are recorded in the repository workflow.
