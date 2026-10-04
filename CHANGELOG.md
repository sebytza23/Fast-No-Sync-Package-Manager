# Changelog

## Unreleased — preparing 1.0.0

- Hold operation locks across restoration, the native command, and conversion;
  coordinate workspace roots and sections, including untracked shared storage.
- Recognize common native options before dependency commands, including npm
  workspace selections, pnpm filters/recursive installs, and Yarn workspace adds.
- Add `config --show` with per-setting origins, manager selection reasons,
  project/dependency roots, and optional machine-readable JSON.
- Add `doctor --fix --dry-run` and explicit `doctor --fix` for identity-checked
  link recovery, interrupted restoration cleanup, and missing ignore rules.
- Verify all five native managers and workspace layouts, including Yarn PnP and
  cache-only Deno, using local fixtures rather than public registry dependencies.
- Normalize repository line endings and run the full manager suite on Windows,
  Linux, and macOS with Node.js 22 and 24.

### Compatibility contract for 1.0

- Preserve 0.3 configuration file formats, settings, closest-config resolution,
  native argument forwarding, exit codes, and local automatic conversion.
- `config get`, `config set`, and other native config commands remain forwarded;
  only the `config --show` inspection form belongs to FNSPM.
- Concurrent or nested FNSPM operations targeting the same dependency scope fail
  promptly before starting another native command. External package managers and
  cloud clients do not participate in FNSPM locking.
- Recovery never removes unknown locks, adopts foreign links, or overwrites
  conflicting dependency directories.

## 0.3.0 — 2026-10-01

- Require Node.js 22 or newer; use a single npm development lockfile.
- Preserve native arguments, live terminal output, child exit status and interrupts.
- Load CJS/ESM configurations with strict validation and partial defaults.
- Implement documented initialization flags without overwriting existing config.
- Detect manifest package managers and workspace roots; reject ambiguous locks.
- Replace destructive relocation with collision checks, ownership state, rollback,
  operation locking, and explicit `migrate` / `restore` commands with dry runs.
- Add `doctor` and dedicated external dependency storage with link safety checks.
- Preserve automatic conversion after native commands, including workspace
  sections; only convert local dependencies in the invocation directory.
- Keep per-section initialization/configuration independent; inherit the nearest
  parent config without losing it when local migration state/lockfiles appear.
- Safely adopt matching legacy project-local nosync links without moving their
  dependency files, and handle repeat clean installs.
- Restore and refresh already tracked shared workspace storage when installs
  run from a section, preserving the workspace root's own configuration.
- Build before packaging, ship complete declarations, and avoid CLI side effects
  when importing the package.
- Add regression tests, package installation/type checking, cross-platform CI,
  and scheduled dependency updates.
- Correct cloud-provider support claims and align license documentation with GPL.

### Compatibility notes

- Unknown config settings/options are now rejected rather than silently ignored.
- Multiple lockfile managers require a declaration or explicit override.
- `--no-sync-folder` now disables automatic migration.
- Migration refuses existing destinations instead of deleting them.
- `restore` needs recorded ownership; matching project-local legacy links can be
  adopted using `migrate`, including automatic adoption before clean installs.
- TypeScript is a build dependency, not a peer requirement for CLI users.
