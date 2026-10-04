export function displayHelp(): void {
    console.info(`FNSPM — package manager commands with local dependency storage

Usage:
  fnspm [--pm <manager>] [--debug] <command> [...native arguments]
  fnspm initialize [options]
  fnspm config --show [--json] [--pm <manager>]
  fnspm doctor [--pm <manager>] [--fix [--dry-run]]
  fnspm migrate [--dry-run]
  fnspm restore [--dry-run]
  fnspm --help | --version

Managers: npm, yarn, pnpm, bun, deno
Detection: --pm > configured detection > package.json#packageManager > lockfile > default
Arguments after -- are passed unchanged, including wrapper-looking flags.
Native command names are preserved (npm install, yarn add, deno install).

Initialization options:
  --default, -d              Generate defaults without prompts
  --pm <manager>            Default package manager
  --detection <mode>        auto, default, or a manager name
  --symlink / --no-symlink  Enable / disable automatic migration
  --sync-folder <name>      Project-local destination (default: node_modules.nosync)
  --storage-path <path>     Dedicated absolute destination outside the project
  --no-sync-folder          Alias for --no-symlink
  --add-to-gitignore / --no-add-to-gitignore
  --verbose / --no-verbose

Migration never overwrites an existing destination. External storage must be on
one filesystem with the project. Restore only moves dependencies tracked by FNSPM.
Yarn PnP and cache-only Deno projects may have no node_modules to migrate.`);
}
