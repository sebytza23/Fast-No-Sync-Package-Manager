import spawn from 'cross-spawn';
import { constants } from 'node:os';
import type { PackageManagerType } from '../utils/types';

export class CommandError extends Error {
    constructor(
        message: string,
        public readonly exitCode = 1,
    ) {
        super(message);
    }
}

export default class PackageManager {
    constructor(public readonly name: PackageManagerType) {}

    public async execute(
        args: string[],
        cwd = process.cwd(),
        verbose = false,
    ): Promise<void> {
        if (verbose)
            console.error(
                `Running: ${[this.name, ...args].map((arg) => JSON.stringify(arg)).join(' ')}`,
            );
        await new Promise<void>((resolve, reject) => {
            // cross-spawn handles .cmd shims and Windows escaping without concatenating user arguments.
            const child = spawn(this.name, args, {
                cwd,
                stdio: 'inherit',
                shell: false,
            });
            const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
            const handlers = signals.map((signal) => () => {
                child.kill(signal);
            });
            signals.forEach((signal, i) => process.on(signal, handlers[i]));
            const cleanup = () =>
                signals.forEach((signal, i) =>
                    process.removeListener(signal, handlers[i]),
                );
            child.once('error', (error: NodeJS.ErrnoException) => {
                cleanup();
                reject(
                    new CommandError(
                        error.code === 'ENOENT'
                            ? `${this.name} is not installed or is not on PATH.`
                            : error.message,
                    ),
                );
            });
            child.once('close', (code, signal) => {
                cleanup();
                if (code === 0) resolve();
                else
                    reject(
                        new CommandError(
                            `${this.name} ${signal ? `terminated by ${signal}` : `exited with code ${code}`}.`,
                            code ??
                                (signal ? 128 + constants.signals[signal] : 1),
                        ),
                    );
            });
        });
    }
}
