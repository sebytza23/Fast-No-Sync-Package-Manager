import fs from 'fs';
import path from 'path';
import { prompt } from 'enquirer';
import { defaultConfig } from '@/config/fnspm.config';
import { Config, PackageManagerType } from './types';
import { VALID_PACKAGE_MANAGERS } from '@/packages/factory';

export const initialize = async (args: string[]) => {
    if (args.includes('-d') || args.includes('--default')) {
        await createConfigFile(defaultConfig);
        console.log('Created default configuration file');
        return;
    }

    if (args.length > 1) {
        const config = processCliArgs(args);
        await createConfigFile(config);
        return;
    }

    console.log('Welcome to FNSPM configuration!\n');

    const answers = await prompt([
        {
            type: 'select',
            name: 'packageManager',
            message: 'Select default package manager:',
            choices: VALID_PACKAGE_MANAGERS
        },
        {
            type: 'select',
            name: 'detection',
            message: 'Choose detection mode:',
            choices: ['auto', 'default', ...VALID_PACKAGE_MANAGERS]
        },
        {
            type: 'toggle',
            name: 'symlinkEnabled',
            message: 'Enable symlink creation?',
            initial: true
        },
        {
            type: 'input',
            name: 'nosyncName',
            message: 'Nosync folder name:',
            initial: 'node_modules.nosync',
            skip() {
                // @ts-ignore
                return !this.state.answers.symlinkEnabled;
              },
        },
        {
            type: 'toggle', 
            name: 'addToGitignore',
            message: 'Add to .gitignore?',
            initial: true,
            skip(){
                // @ts-ignore
                return !this.state.answers.symlinkEnabled;
            }
        },
        {
            type: 'toggle',
            name: 'verbose',
            message: 'Enable verbose logging?',
            initial: false
        }
    ]).then(async (answers: any) => {
        const config: Config = {
            packageManager: {
                default: answers.packageManager,
            detection: answers.detection,
        },
        symlink: {
            enabled: answers.symlinkEnabled,
            nosyncName: answers.nosyncName,
            addToGitIgnore: answers.addToGitignore
        },
        debug: {
            verbose: answers.verbose
        }};
    
        await createConfigFile(config);
        console.log('\nConfiguration file created successfully!');
    });
} 

function processCliArgs(args: string[]): Config {
    const config = { ...defaultConfig };
    
    if (args.includes('--no-symlink')) {
        config.symlink.enabled = false;
    }

    if (args.includes('--add-to-gitignore')) {
        config.symlink.addToGitIgnore = true;
    }

    if (args.includes('--no-add-to-gitignore')) {
        config.symlink.addToGitIgnore = false;
    }

    if (args.includes('--verbose')) {
        config.debug.verbose = true;
    }

    if (args.includes('--no-verbose')) {
        config.debug.verbose = false;
    }
    
    if (args.includes('--sync-folder')) {
        config.symlink.nosyncName = args[args.indexOf('--sync-folder') + 1];
    }

    if (args.includes('--no-sync-folder')) {
        config.symlink.nosyncName = 'node_modules.nosync';
    }

    return config;
}

async function createConfigFile(config: Config) {
    let configContent = "/** @type {import('fnspm').Config} */";
    let fileName = 'fnspm.config';
    
    try {
        const packageJsonPath = path.join(process.cwd(), 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            
            if (packageJson.type === 'module') {
                // ESM
                configContent = `const config = ${JSON.stringify(config, null, 2)};`;
                configContent += `export default config;`;
                fileName += '.mjs';
            } else {
                // CommonJS
                configContent = `const config = ${JSON.stringify(config, null, 2)};`;
                configContent += `module.exports = config;`;
                fileName += '.cjs';
            }
        } else {
            configContent = `const config = ${JSON.stringify(config, null, 2)};`;
            configContent += `module.exports = config;`;
            fileName += '.js';
        }

        fs.writeFileSync(path.join(process.cwd(), fileName), configContent);
        console.log(`Created configuration file: ${fileName}`);
    } catch (error) {
        console.error('Error creating configuration file:', error);
        configContent = `const config = ${JSON.stringify(config, null, 2)};`;
        configContent += `module.exports = config;`;
        fileName += '.js';
        fs.writeFileSync(path.join(process.cwd(), fileName), configContent);
        console.log(`Created fallback configuration file: ${fileName}`);
    }
} 