import { exec, spawn } from 'child_process';
import { PackageManagerType } from '@/utils/types';
import { createSymlink, shouldCreateSymlink } from '@/utils/helpers';
import { loadConfig } from '@/utils/helpers';

export interface PackageManagerInterface {
    execute: (args: string[]) => Promise<void>;
}

export default abstract class PackageManager implements PackageManagerInterface {
    protected name!: PackageManagerType;

    public async execute(args: string[]): Promise<void> {
        const config = await loadConfig();
        const fullCommand = `${this.name} ${args.join(' ')}`.trim();
        const isInteractiveCommand = ['init', 'create', 'login'].some(cmd => args.includes(cmd));

        if (config.debug.verbose || args.includes('--debug')) {
            console.info(`Running command: ${fullCommand}`);
        }

        if (isInteractiveCommand) {
            return new Promise((resolve, reject) => {
                const [cmd, ...cmdArgs] = fullCommand.split(' ');
                const childProcess = spawn(cmd, cmdArgs, {
                    stdio: 'inherit',
                    shell: true
                });

                childProcess.on('close', async (code) => {
                    if (code === 0) {
                        if (await shouldCreateSymlink()) {
                            createSymlink()
                                .then(resolve)
                                .catch((error) => {
                                    console.error(`Error creating symlink: ${error}`);
                                    resolve();
                                });
                        } else {
                            resolve();
                        }
                    } else {
                        reject(new Error(`Command failed with code ${code}`));
                    }
                });

                childProcess.on('error', (error) => {
                    reject(error);
                });
            });
        }

        return new Promise((resolve, reject) => {
            exec(fullCommand, async (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error executing command: ${stderr}`);
                    reject(error);
                } else {
                    console.log(stdout);

                    if (await shouldCreateSymlink()) {
                        createSymlink().then(() => {
                            resolve();
                        }).catch((error) => {
                            console.error(`Error creating symlink: ${error}`);
                            resolve();
                        });
                    } else {
                        resolve();
                    }
                }
            });
        });
    }
}
