import { exec } from 'child_process';
import { PackageManagerName } from '@/utils/types';
import { createSymlink, shouldCreateSymlink } from '@/utils/helpers';

export interface PackageManagerInterface {
    execute: (args: string[]) => Promise<void>;
}

export default abstract class PackageManager implements PackageManagerInterface {
    protected name!: PackageManagerName;

    public async execute(args: string[]): Promise<void> {
        const fullCommand = `${this.name} ${args.join(' ')}`.trim();

        if (args.includes('--debug')) {
            console.info(`Running command: ${fullCommand}`);
        }

        return new Promise((resolve, reject) => {
            exec(fullCommand, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error executing command: ${stderr}`);
                    reject(error);
                } else {
                    console.log(stdout);

                    if (shouldCreateSymlink()) {
                        createSymlink().then(() => {
                            resolve();
                        }).catch((error) => {
                            console.error(`Error creating symlink: ${error}`);
                            resolve();
                        });
                    }
                }
            });
        });
    }
}
