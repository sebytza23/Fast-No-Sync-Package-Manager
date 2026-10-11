# Dependency storage

## The automatic conversion lifecycle

With conversion enabled, an eligible native command follows this sequence:

1. Acquire operation locks for the relevant scope.
2. Before a dependency-changing command, restore tracked local dependencies and any already tracked shared workspace storage.
3. Run the selected package manager with your arguments and terminal streams.
4. After success, convert local dependencies and refresh eligible shared storage.
5. Release the locks.

A native failure keeps its exit status and leaves the native layout available for inspection. A failure in optional conversion prints a diagnostic without changing a successful manager command into a failure.

Automatic conversion also follows successful commands such as `run` or `list`, preserving older FNSPM behavior. Global, redirected, dry-run, and help/version invocations are excluded.

## Default project-local storage

By default, the target is `node_modules.nosync` inside the invocation directory:

```text
project/
  node_modules -> node_modules.nosync
  node_modules.nosync/
  .fnspm-state.json
```

FNSPM renames the existing directory rather than redownloading dependencies. It creates a relative symlink on Linux/macOS or an absolute directory junction on Windows.

Use a different single directory name through `symlink.nosyncName`:

```js
module.exports = {
    symlink: { nosyncName: 'dependencies.nosync' },
};
```

Restore an existing migration before changing the destination.

## Explicit migration and restoration

You can convert an existing regular dependency directory without running an install:

```sh
fnspm migrate --dry-run
fnspm migrate
fnspm doctor
```

A dry run inspects the plan without making changes. Migration refuses an existing destination, foreign link, unsafe path, cross-filesystem move, or a relocation that would break relative links.

To return to the native layout:

```sh
fnspm restore --dry-run
fnspm restore
```

Restoration removes the tracked source link, returns the owned dependency directory to `node_modules`, and cleans up completed migration state. Config and ignore rules remain.

> `restore` requires recorded ownership. It will not move an arbitrary directory just because it is named `node_modules.nosync`.

## External storage

Use an absolute path to a **dedicated destination that does not already exist**. Its parent must already exist, and the parent and project must be on the same filesystem.

The following POSIX example creates only the parent directory:

```sh
mkdir -p "$HOME/.local/share/fnspm"
fnspm initialize --storage-path "$HOME/.local/share/fnspm/example-project"
fnspm migrate --dry-run
fnspm migrate
```

Replace `example-project` with a destination unique to this project. If you already have a config, edit its `symlink.storagePath` instead of rerunning initialization.

For example, on Windows:

```js
module.exports = {
    symlink: { storagePath: 'C:\\dependency-storage\\example-project' },
};
```

The parent `C:\dependency-storage` must exist and the project must be on the same filesystem. This restriction concerns moving dependency storage; it is separate from the Bun executable being installed on another drive.

Dependencies with relative links to external workspace or linked-package directories may not be movable to external storage. FNSPM checks the resulting paths before renaming anything. Use project-local storage if that check refuses the move.

## Git ignore rules

When `symlink.addToGitIgnore` is enabled, migration adds rules for the source, project-local target, state, and operation lock. A project using the default name receives rules equivalent to:

```text
/node_modules
/node_modules.nosync/
/.fnspm-state.json
/.fnspm-operation.lock
```

The source rule intentionally has no trailing slash: Git must ignore a symlink too. External targets are outside the repository and do not need a project-local target rule.

## Ownership and recovery

`.fnspm-state.json` records the project, storage target, and dependency directory identity. The identity lets FNSPM refuse recovery when a directory has been replaced by a different one.

Do not commit the state, copy it into another project, or edit it to make a conflicting directory appear owned. Use `migrate`, `restore`, and `doctor` to manage the layout.

If an interruption leaves the recorded target intact but the source link missing:

```sh
fnspm doctor --fix --dry-run
fnspm doctor --fix
```

Supported repair recreates the owned link, cleans up metadata after a completed-but-interrupted restoration, and adds missing ignore rules. It does not remove unknown locks or overwrite conflicting directories.

## Synced folders

The `.nosync` name is an iCloud-oriented convention, not a cross-provider exclusion API. FNSPM does not set or verify iCloud, Dropbox, or Google Drive settings. Conversion also occurs after installation, when a cloud client may already have observed the files.

For Dropbox, use its [documented ignored-files mechanism](https://help.dropbox.com/sync/ignored-files). For other providers, verify exclusions separately, or place storage outside the synced tree on the same filesystem.

## Moving or renaming a project

Restore dependencies **before** moving the project, changing storage, or switching devices:

```sh
fnspm restore --dry-run
fnspm restore
```

Then move the project, update any external path in the config, and reinstall or migrate at the new location. Recorded ownership, absolute junctions, and external paths are local to the original location. Restoration can also refuse absolute links that would point into the old storage; resolve those link constraints before the move.
