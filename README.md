# FNSPM (Fast No Sync Package Manager)

A unified command-line interface for managing packages across multiple package managers (npm, yarn, pnpm, bun, and deno).

## Features

- **Universal Interface**: Use consistent commands across different package managers
- **Auto-Detection**: Automatically detects the project's package manager based on lock files
- **Native Flags**: Use native flags for each package manager
- **Node Modules Management**: Automatically creates symlinks for better system performance
- **Supported Platforms**: macOS

## Installation

```bash
npm install -g fnspm
```

## Usage

Basic syntax:
```bash
fnspm [command] [packages] [flags]
```

### Commands

- All native commands are supported

### Global Flags

- `--debug`: Show runned commands
- `--pm <manager>`: Specify package manager

### Examples

```bash
# Install lodash using npm with dev flag
fnspm --pm npm install lodash -d

# Install moment globally using yarn
fnspm --pm yarn install moment -g

# Install multiple packages with pnpm
fnspm --pm pnpm install -d -e lodash moment

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
- `bun.lockb` → bun
- `deno.lock` → deno

## Features in Detail

### Node Modules Management
- Automatically converts `node_modules` to `node_modules.nosync`
- Creates symlinks for better system performance
- Prevents unnecessary iCloud/Dropbox syncing

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
git clone https://github.com/yourusername/fnspm.git
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
│   ├── packages/         # Package manager implementations
│   ├── utils/           # Helper utilities
├── dist/                # Compiled JavaScript
└── tests/              # Test files
```

## Contributing

This project is open for educational and non-commercial use. Feel free to:
1. Fork the repository
2. Create a feature branch
3. Submit a Pull Request

## License

GPL-3.0 License - See [LICENSE](LICENSE) for details

This software is for **educational** and **non-commercial use only**. Commercial use or inclusion in commercial products is not permitted without explicit permission. 

<p style="color: red;"><b>ATTENTION</b></p> 
<b>Is not considered commercial use if you are using it like any other package manager</b>

## Disclaimer
You are free to use it for **personal projects**. Keep in mind that the project is still in development and some features may not work as expected.

## Author

**Marin-Eusebiu Șerban**

## Roadmap

- [ ] Add support for workspaces
- [ ] Implement package.json manipulation
- [ ] Add support for more package managers
- [ ] Improve error handling and recovery
- [ ] Add support for multiple cloud providers (iCloud, Dropbox, Google Drive, etc.)
- [ ] Implement configuration file
- [ ] Add interactive mode (CLI)