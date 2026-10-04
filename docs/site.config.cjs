module.exports = {
    basePath: '/Fast-No-Sync-Package-Manager/',
    origin: 'https://sebytza23.github.io',
    repository: 'https://github.com/sebytza23/Fast-No-Sync-Package-Manager',
    pages: [
        {
            slug: '',
            file: 'overview.md',
            title: 'Overview',
            group: 'Start here',
            description:
                'Run the package manager you already use, with project settings and reversible local dependency storage.',
        },
        {
            slug: 'getting-started',
            file: 'getting-started.md',
            title: 'Getting started',
            group: 'Start here',
            description:
                'Install FNSPM, inspect your project, and complete your first install.',
        },
        {
            slug: 'configuration',
            file: 'configuration.md',
            title: 'Configuration',
            group: 'Guides',
            description:
                'Understand every setting, file format, default, and configuration boundary.',
        },
        {
            slug: 'workspaces',
            file: 'workspaces.md',
            title: 'Projects & workspaces',
            group: 'Guides',
            description:
                'Keep root and section settings independent while preserving your native workspace behavior.',
        },
        {
            slug: 'storage',
            file: 'storage.md',
            title: 'Dependency storage',
            group: 'Guides',
            description:
                'See how automatic conversion, external storage, migration, and restoration work.',
        },
        {
            slug: 'package-managers',
            file: 'package-managers.md',
            title: 'Package managers',
            group: 'Guides',
            description:
                'Manager detection, native commands, lockfiles, and the layouts supported in v1.',
        },
        {
            slug: 'cli',
            file: 'cli.md',
            title: 'CLI reference',
            group: 'Reference',
            description:
                'Every FNSPM command and flag, with examples and exit-status behavior.',
        },
        {
            slug: 'troubleshooting',
            file: 'troubleshooting.md',
            title: 'Troubleshooting',
            group: 'Reference',
            description:
                'Diagnose configuration, locks, storage conflicts, and interrupted operations.',
        },
        {
            slug: 'upgrading',
            file: 'upgrading.md',
            title: 'Upgrading to v1',
            group: 'Reference',
            description:
                'Move from 0.2 or 0.3 while preserving configuration and dependency files.',
        },
        {
            slug: 'api',
            file: 'api.md',
            title: 'JavaScript & types',
            group: 'Reference',
            description:
                'The public main function, TypeScript types, and the v1 compatibility contract.',
        },
        {
            slug: 'changelog',
            file: null,
            title: 'Changelog',
            group: 'Releases',
            description:
                'Release notes generated directly from the repository changelog.',
        },
        {
            slug: 'development',
            file: 'development.md',
            title: 'Development',
            group: 'Contributing',
            description:
                'Build, test, edit the documentation, and publish the site.',
        },
    ],
};
