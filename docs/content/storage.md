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

Use `--relocate` to change an existing managed destination, or restore before editing the storage configuration manually.

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

### Automatic external storage

For a new configuration:

```sh
fnspm initialize --external
fnspm install
fnspm --info --json
fnspm --storage list
```

For an existing config, set `symlink.storagePath: 'auto'`. For already managed dependencies, preview `fnspm --relocate --external --dry-run`, then apply `fnspm --relocate --external`.

FNSPM derives a SHA-256 project ID from the canonical dependency-owner path. Equal directory names in different locations receive different destinations. Defaults are:

| Platform | Data directory                                     |
| -------- | -------------------------------------------------- |
| macOS    | `~/Library/Application Support/fnspm`              |
| Linux    | `$XDG_DATA_HOME/fnspm`, or `~/.local/share/fnspm`  |
| Windows  | `%LOCALAPPDATA%\fnspm`, or `~/AppData/Local/fnspm` |

Dependencies live under `storage/<project-id>/node_modules`; inventory records live under `registry/<project-id>.json`. `FNSPM_DATA_DIR` can select another absolute data directory, for example on the same filesystem as a project on a different disk. Changing it does not move existing storage; use relocation deliberately.

Automatic storage retains the same filesystem, ownership, existing-destination and relative-link checks as explicit storage. A project whose relative workspace links would change resolution must keep project-local storage. The feature does not fall back to copying files across disks, alter cloud-provider settings or move workspace packages.

Dry runs compute the destination without creating directories or registry records. Applied migrations create the managed parents and refuse occupied dependency destinations.

### Explicit external paths

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
/.fnspm-storage.json
/.fnspm-relocate.json
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

## Storage inventory

```sh
fnspm --storage list
fnspm --storage list --json
fnspm --storage list --json --size
fnspm --storage register
```

Successful migrations and already tracked migrations update a per-project record. Use `--storage register` from an older tracked installation to add it without moving dependencies. Registration refuses untracked or inconsistent storage. The inventory is a discovery aid; local ownership state and filesystem identities remain authoritative.

Listing reads records and verifies project/storage identities without evaluating project config or running a manager. It shows the recorded project, target, status and last recording time. Tree size is measured only with `--size`, and only for currently verified managed entries. Measurements have the same logical-byte, symlink and hardlink semantics as [diagnostic size inspection](cli.md#diagnostic-json-and-optional-size).

| Status            | Meaning                                                                            |
| ----------------- | ---------------------------------------------------------------------------------- |
| `managed`         | Project identity, ownership state, storage identity and source link agree          |
| `recovery-needed` | A recorded link is missing or relocation remains pending                           |
| `restored`        | Ownership state and the old target are absent; dependencies may have been restored |
| `unavailable`     | The project path cannot currently be found; its disk may be disconnected           |
| `changed`         | Project/storage identity or source layout no longer agrees with the record         |
| `untracked`       | Storage remains, but its project no longer has ownership state                     |
| `invalid`         | The record or accessible metadata could not be read or validated                   |

Missing projects are not proof of unused dependencies. Listing never deletes storage, records, unknown locks or metadata. Invalid/changed entries return exit code `1`; other statuses remain visible for inspection. An inventory-write failure warns without changing a completed migration into a failure; the local state is still usable and registration can be retried.

## Relocating managed storage

```sh
fnspm --relocate --external --dry-run
fnspm --relocate --external
fnspm --relocate /absolute/dedicated/destination --dry-run
fnspm --relocate /absolute/dedicated/destination
fnspm --relocate --configured
```

Relocation moves an identity-verified dependency directory, keeps the project in place, recreates its source link and updates state. Explicit destinations require an existing parent; automatic destinations create managed parents. Existing/overlapping destinations, another filesystem, foreign source links, changed storage and relative links that would break are refused before moving data.

The chosen destination is kept in `.fnspm-storage.json`, so subsequent installs continue to use it without overwriting the JavaScript config. `--configured` relocates back to the configured destination and clears this preference. After restoration, it can clear the preference without moving native dependencies. Conversion enablement remains controlled by the existing config.

Before changing the source link, FNSPM writes a relocation journal with the old/new targets and directory identity. If interrupted, it retains the journal and data for a verified roll-forward recovery:

```sh
fnspm --relocate --recover --dry-run
fnspm --relocate --recover
# Or preview/apply through doctor:
fnspm doctor --fix --dry-run
fnspm doctor --fix
```

Recovery verifies that exactly one of the old/new destinations owns the recorded directory, refuses changed/foreign entries, completes the link/preference/state update, and removes the journal only after verification. `restore` can complete the pending move before restoring native dependencies. Explicit `--recover` and `restore` work without loading a broken JavaScript config.

A forced termination may also leave an operation lock. Confirm that the recorded process has stopped before manually removing only that lock; recovery never clears an unknown lock automatically. The journal supports process-interruption recovery, not a guarantee against every power-loss or filesystem failure. Neither relocation nor recovery deletes dependency trees.

## Synced folders

The `.nosync` name is an iCloud-oriented convention, not a cross-provider exclusion API. FNSPM does not set or verify iCloud, Dropbox, or Google Drive settings. Conversion also occurs after installation, when a cloud client may already have observed the files.

For Dropbox, use its [documented ignored-files mechanism](https://help.dropbox.com/sync/ignored-files). For other providers, verify exclusions separately, or place storage outside the synced tree on the same filesystem.

## Moving or renaming a project

Restore dependencies **before** moving the project or switching devices:

```sh
fnspm restore --dry-run
fnspm restore
fnspm --relocate --configured # clear any local relocation preference after restore
```

Then move the project, update any external path in the config, and reinstall or migrate at the new location. Recorded ownership, absolute junctions, and external paths are local to the original location. Restoration can also refuse absolute links that would point into the old storage; resolve those link constraints before the move.
