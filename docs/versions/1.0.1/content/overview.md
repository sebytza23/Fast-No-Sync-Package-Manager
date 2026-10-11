# Overview

FNSPM is a command-line wrapper for **npm, Yarn, pnpm, Bun, and Deno**. It selects a manager for your project, forwards your command, and can keep local dependencies in a separate directory connected to `node_modules`.

The manager still resolves packages, writes lockfiles, and runs scripts. FNSPM adds configuration, reversible storage, and coordination around that workflow.

## Start with your existing project

Install FNSPM with Node.js 22 or newer, then run it in a project that already has a package manifest.

```sh
npm install -g fnspm
fnspm config --show
fnspm install
```

No configuration file is required. By default, FNSPM detects the manager and uses a project-local `node_modules.nosync` directory. If it cannot detect a manager, it falls back to npm. The chosen manager must already be on your `PATH`.

Follow [Getting started](getting-started.md) for a complete first install, or [Configuration](configuration.md) to customize an existing project.

## What conversion changes

A successful native command can turn this layout:

```text
project/
  package.json
  node_modules/             actual dependency files
```

Into this layout:

```text
project/
  package.json
  node_modules -> node_modules.nosync
  node_modules.nosync/      the same dependency files
  .fnspm-state.json         recorded ownership
```

On Linux and macOS, the connection is a symbolic link. On Windows, it is a directory junction. Your code continues to import packages through `node_modules`.

You can inspect the layout with `fnspm doctor` and return to a regular dependency directory with `fnspm restore`. See [Dependency storage](storage.md) for the complete lifecycle.

## Choose the guide for your workflow

| You want to…                                                         | Read                                                                         |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Install FNSPM and run your first command                             | [Getting started](getting-started.md)                                        |
| Give projects or sections different settings                         | [Configuration](configuration.md) and [Projects & workspaces](workspaces.md) |
| Understand auto-convert or move dependencies outside a synced folder | [Dependency storage](storage.md)                                             |
| Use a specific manager, workspace filter, or lockfile install        | [Package managers](package-managers.md)                                      |
| Look up flags and return codes                                       | [CLI reference](cli.md)                                                      |
| Investigate a broken link, lock, or destination conflict             | [Troubleshooting](troubleshooting.md)                                        |
| Upgrade an older FNSPM setup                                         | [Upgrading to v1](upgrading.md)                                              |
| See what changed in a release                                        | [Changelog](changelog.md)                                                    |

## What v1 guarantees

Version 1.0 preserves documented configuration formats, section overrides, native arguments, child exit codes, and local automatic conversion. The supported JavaScript API and exported types are documented in [JavaScript & types](api.md).

FNSPM holds operation locks across restoration, native execution, and conversion. A competing FNSPM operation on the same dependency scope fails before another manager starts. Independent projects can operate independently.

These locks coordinate FNSPM processes. Direct manager commands and cloud clients do not participate in them.

## Cloud storage and installation speed

FNSPM does not configure cloud-provider exclusions or guarantee that installs become faster. The `.nosync` naming convention is not a universal exclusion mechanism. Automatic conversion happens after a native command finishes, so files can still be synced during an install.

For cloud-oriented setups, read [Dependency storage](storage.md) before choosing a destination. Use provider-supported exclusions or dedicated storage outside the synced folder, and verify the provider's behavior.
