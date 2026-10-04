# Upgrading to v1

## What changes in 1.0

Version 1.0 adds configuration inspection, safe repair previews, operation locks spanning the native command, and the Bun Windows path-alias fix. It preserves the documented 0.3 configuration fields, file formats, nearest-config lookup, section overrides, command forwarding, and local automatic conversion.

Read the [Changelog](changelog.md) for the release details and the [JavaScript & types](api.md) page for the stable public interface.

## Upgrade from 0.3

First inspect the current layout using the existing installation:

```sh
fnspm --version
fnspm doctor
```

Install v1 and inspect the same project:

```sh
npm install -g fnspm@1.0.0
fnspm config --show
fnspm doctor
```

You do not need to regenerate a valid 0.3 config. Keep your recorded state beside its original project and storage. If you intend to change the storage destination or move the project, restore dependencies before doing so.

Inspect each independently configured workspace section from its own directory. A section config still replaces the parent config and receives defaults for omitted fields.

## Upgrade a legacy 0.2 link

Older projects may already have `node_modules` linked to the configured project-local nosync directory without `.fnspm-state.json`.

FNSPM can adopt this layout when the link matches the configured local name, the target is a regular directory, and the layout passes validation:

```sh
npm install -g fnspm@1.0.0
fnspm migrate --dry-run
fnspm migrate
fnspm doctor
```

Adoption records ownership without moving or deleting dependency files. After successful adoption, `restore` can return that directory to the native layout. Matching legacy links are also tracked before eligible clean installs when automatic conversion is enabled.

Broken links, foreign targets, and untracked external storage are not adopted automatically. Do not fabricate state to bypass the checks.

## Behavior to review when coming from 0.2

Changes introduced in 0.3 also apply to v1:

- Node.js 22 or newer is required.
- Unknown config settings and unknown initialization options are rejected.
- Ambiguous manager lockfiles require an explicit selection.
- `--no-sync-folder` disables automatic migration.
- Existing destinations are never deleted to make room for migration.
- Restoration requires recorded ownership.
- Moving dependencies uses validation, operation locks, rollback attempts, and ownership state.

The earlier README's non-commercial restriction was inconsistent with the GPL license file and has been removed. The project uses GPL-3.0-only; consult the repository license for its terms.

## Clean installs and disabled conversion

A tracked project can run clean installs through FNSPM. Before a dependency-changing command such as npm `ci`, FNSPM restores tracked local storage so the manager can replace `node_modules` normally.

This restoration also occurs when conversion is now disabled. After success, conversion happens only for locations whose configuration enables it.

```sh
fnspm --pm npm ci
fnspm doctor
```

For a workspace section, already tracked shared root storage is refreshed with the root's settings. Untracked ancestors and siblings are not newly managed.

## The v1 compatibility boundary

The documented CLI, config settings and resolution, top-level exported types, and `main` function form the supported public interface. Internal `dist/src` modules and migration metadata are implementation details.

Breaking changes to that public interface after 1.0 require a new major version. No claim is made that cloud-client behavior or every historical native-manager layout is controlled by FNSPM.
