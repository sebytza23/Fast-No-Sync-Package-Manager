# FNSPM (Fast No Sync Package Manager)

A unified command-line interface for managing packages across multiple package managers (npm, yarn, pnpm, bun, and deno) with macOS optimization for iCloud sync and automatic package manager detection.

## Features

- **Auto-Detection**: Automatically detects the project's package manager based on lock files
- **Native Flags**: Use native flags for each package manager
- **Node Modules Management**: Automatically creates symlinks for better system performance
- **Supported Platforms**: macOS, Windows, Linux

## Installation

```bash
npm install -g fnspm
```

## Initialization
#### Initialize FNSPM in your project:

> **Info**: If you skip the initialization step, FNSPM will use the **[default configuration](#default-configuration-file)**. However, it's recommended to run the initialization command to customize the setup according to your needs.

```bash
fnspm initialize [options]
```

### Initilization Options (all optional):

- `--default, -d`: Use default configuration
- `--pm`: Set default package manager (npm|yarn|pnpm|bun|deno)
- `--detection`: Set detection mode (auto|default|npm|yarn|pnpm|bun|deno)
- `--symlink`: Enable symlink creation
- `--no-symlink`: Disable symlink creation
- `--sync-folder`: Set nosync folder name
- `--no-sync-folder`: Disable nosync folder creation
- `--add-to-gitignore`: Add nosync folder to .gitignore
- `--no-add-to-gitignore`: Disable adding nosync folder to .gitignore
- `--verbose`: Enable verbose logging
- `--no-verbose`: Disable verbose logging

## Configuration
The configuration file is located in the root of the project and is named `fnspm.config.{cjs, mjs, js}`.
- `CommonJS` and `ES6` are supported.
- CommonJS extension is `.cjs`
- ES6 extension is `.mjs`
- JavaScript extension is `.js`
- Extension is automatically detected on initialization based on the `package.json` file.

### Default configuration file

```js
/** @type {import('fnspm').Config} */
const config = {
    "packageManager": {
        "default": "npm",
        "detection": "auto",
    },
    "symlink": {
        "enabled": true,
        "addToGitIgnore": true,
        "nosyncName": "node_modules.nosync",
    },
    "debug": {
        "verbose": false,
    },
};

// CommonJS and JS
module.exports = config;

// ES6
export default config;
```

## Usage

Basic syntax:
```bash
fnspm [command] [packages] [flags]
```

### Commands and Flags

- All native commands and Flags are supported

### Global Flags

- `--debug`: Show runned commands
- `--pm <manager>`: Use specified package manager
> **Note**: The `--pm` flag allows you to temporarily use a specific package manager for the current command only. This does not modify your configuration file - the default package manager specified in `fnspm.config.{cjs, mjs, js}` will still be used for subsequent commands. For example:
> ```bash
> # This command uses npm just for this installation
> fnspm --pm npm install lodash
> 
> # Future commands will still use your default package manager
> fnspm install express # Uses detection from config (auto|default|npm|yarn|pnpm|bun|deno)
> ```
### Examples

```bash
# Install lodash using npm with dev flag
fnspm --pm npm install lodash -d

# Install moment globally using yarn
fnspm --pm yarn install moment -g

# Install multiple packages with pnpm
fnspm --pm pnpm install -d lodash moment

# Uninstall a package using bun
fnspm --pm bun uninstall moment

# Update packages using deno
fnspm --pm deno update

# List installed packages using npm
fnspm --pm npm list

# Install all packages (auto-detected)
fnspm install → npm/yarn/pnpm/bun/deno install
```

### Auto-Detection

If no package manager is specified, FNSPM will detect it based on lock files:
- `package-lock.json` → npm
- `yarn.lock` → yarn
- `pnpm-lock.yaml` → pnpm
- `bun.(lockb|lock)` → bun
- `deno.lock` → deno

## Features in Detail

### Node Modules Management
- Automatically converts `node_modules` to `node_modules.nosync`
- Creates symlinks for better system performance
- Prevents unnecessary syncing
> **Note**: The synchronization process uses a special folder to prevent your node modules from being synced to cloud storage:
> - This folder is defined by the `nosyncName` setting in your configuration file
> - For iCloud users, it defaults to `node_modules.nosync`
> - You can customize this name to work with other cloud providers
> - This prevents large dependency folders from:
>   - Taking up cloud storage space
>   - Using unnecessary bandwidth
>   - Slowing down your cloud sync
> 
> Your project will continue to work normally while keeping your cloud storage efficient.

### Package Manager Specific Features (Full support)
- **NPM**
- **Yarn**
- **PNPM**
- **Bun**
- **Deno**

## Development

### Prerequisites
- Node.js >= 16
- TypeScript >= 5.0
- Bun (optional, for faster development)

### Setup Development Environment

```bash
# Clone the repository
git clone https://github.com/sebytza23/Fast-No-Sync-Package-Manager.git
cd fnspm

# Install dependencies using npm
npm install

# Or using bun (recommended for development)
bun install
```

### Development Commands

```bash
# Build the project
npm run build
# or
bun run build

# Start in development mode
npm run start
# or
bun run index.ts

# Run tests
npm test
# or
bun test
```

### Project Structure
```
fnspm/
├── src/
│   ├── config/          # Configuration files
│   ├── packages/        # Package manager implementations
│   ├── utils/           # Helper utilities
├── dist/                # Compiled JavaScript
└── tests/               # Test files
```

## Contributing

This project is open for educational and non-commercial use. Feel free to:
1. Fork the repository
2. Create a feature branch
3. Submit a Pull Request

## License

GPL-3.0 License - See [LICENSE](LICENSE) for details

This software is for **educational** and **non-commercial use only**. Commercial use or inclusion in commercial products is not permitted without explicit permission. 

> **Note**: Using this package manager in your personal or organizational projects, in the same way you would use npm, yarn, or other package managers, is not considered commercial use. Commercial use refers to incorporating this tool into commercial products or services for resale.

## Disclaimer
You are free to use it for **personal projects**. Keep in mind that the project is still in development and some features may not work as expected.

## Author

**Marin-Eusebiu Șerban**

## Supported Package Managers Versions
- npm: >= 6.0.0
- yarn: >= 1.4.0
- pnpm: >= 6.0.0
- bun: >= 0.6.0
- deno: >= 1.0.0

## Roadmap

- [x] Implement package.json manipulation
- [x] Add support for more package managers
- [x] Improve error handling and recovery
- [x] Add support for multiple cloud providers (iCloud, Dropbox, Google Drive, etc.) - through the nosync folder  
- [x] Implement configuration file
- [x] Add interactive mode (CLI)

## Support
Hey there! 👋 If you're finding this project helpful, I'd really appreciate your support! You can show some love by starring the project on [GitHub](https://github.com/sebytza23/Fast-No-Sync-Package-Manager) or treating me to a coffee. Every bit of support means a lot and helps keep this project going! ✨

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/yellow_img.png)](https://buymeacoffee.com/serban_marin_eusebiu)
