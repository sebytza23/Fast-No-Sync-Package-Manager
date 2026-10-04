(() => {
    document.documentElement.classList.remove('no-js');
    const versionPicker = document.querySelector('.version-picker');
    document.addEventListener('click', (event) => {
        if (!versionPicker.contains(event.target)) versionPicker.open = false;
    });
    document.addEventListener('keydown', (event) => {
        if (
            event.key === 'Escape' &&
            versionPicker.open &&
            !document.querySelector('#documentation-search').open
        ) {
            versionPicker.open = false;
            versionPicker.querySelector('summary').focus();
        }
    });
    const menu = document.querySelector('.menu-button');
    const sidebar = document.querySelector('.sidebar');
    const closeMenu = () => {
        if (sidebar.contains(document.activeElement)) menu.focus();
        sidebar.classList.remove('open');
        document.body.classList.remove('nav-open');
        menu.setAttribute('aria-expanded', 'false');
        menu.setAttribute('aria-label', 'Open navigation');
    };
    menu.addEventListener('click', () => {
        const open = !sidebar.classList.contains('open');
        sidebar.classList.toggle('open', open);
        document.body.classList.toggle('nav-open', open);
        menu.setAttribute('aria-expanded', String(open));
        menu.setAttribute(
            'aria-label',
            open ? 'Close navigation' : 'Open navigation',
        );
    });
    document.addEventListener('click', (event) => {
        if (
            sidebar.classList.contains('open') &&
            !sidebar.contains(event.target) &&
            !menu.contains(event.target)
        )
            closeMenu();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeMenu();
    });
    document.querySelectorAll('[data-copy]').forEach((button) =>
        button.addEventListener('click', async () => {
            const code = button
                .closest('.code-block')
                .querySelector('code').textContent;
            const label = button.querySelector('span');
            try {
                await navigator.clipboard.writeText(code);
                label.textContent = 'Copied';
                document.querySelector('#copy-status').textContent =
                    'Code copied to clipboard.';
            } catch {
                label.textContent = 'Select code';
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(
                    button.closest('.code-block').querySelector('code'),
                );
                selection.removeAllRanges();
                selection.addRange(range);
                document.querySelector('#copy-status').textContent =
                    'Copy was unavailable. Code selected for manual copying.';
            }
            setTimeout(() => {
                label.textContent = 'Copy';
            }, 2200);
        }),
    );
    const dialog = document.querySelector('#documentation-search');
    const input = document.querySelector('#search-input');
    const results = document.querySelector('#search-results');
    const status = document.querySelector('#search-status');
    let indexPromise;
    let revision = 0;
    let opener;
    const loadIndex = () =>
        indexPromise ||
        (indexPromise = fetch(
            document.body.dataset.base +
                'assets/search-index.json?v=' +
                encodeURIComponent(document.body.dataset.revision),
        )
            .then((response) => {
                if (!response.ok)
                    throw new Error('Search index could not be loaded.');
                return response.json();
            })
            .catch((error) => {
                indexPromise = undefined;
                throw error;
            }));
    const render = async () => {
        const current = ++revision;
        const terms = input.value
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean);
        try {
            const index = await loadIndex();
            if (current !== revision) return;
            let hits;
            if (!terms.length)
                hits = index
                    .filter((entry) =>
                        [
                            'Getting started',
                            'Configuration',
                            'CLI reference',
                            'Changelog',
                            index[0].title,
                        ].includes(entry.title),
                    )
                    .filter(
                        (entry, i, entries) =>
                            entries.findIndex(
                                (item) => item.title === entry.title,
                            ) === i,
                    );
            else
                hits = index
                    .map((entry) => {
                        const title = entry.title.toLowerCase();
                        const heading = entry.section.toLowerCase();
                        const text = entry.text.toLowerCase();
                        const corpus = title + ' ' + heading + ' ' + text;
                        const score = terms.every((term) =>
                            corpus.includes(term),
                        )
                            ? terms.reduce(
                                  (total, term) =>
                                      total +
                                      (title.includes(term) ? 8 : 0) +
                                      (heading.includes(term) ? 6 : 0) +
                                      (text.includes(term) ? 2 : 0),
                                  0,
                              )
                            : 0;
                        return { ...entry, score };
                    })
                    .filter((entry) => entry.score)
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 14);
            results.replaceChildren();
            for (const hit of hits) {
                const item = document.createElement('li');
                const link = document.createElement('a');
                link.href = hit.url;
                const heading = document.createElement('small');
                heading.textContent = hit.title;
                const title = document.createElement('strong');
                title.textContent = hit.section || hit.title;
                const snippet = document.createElement('p');
                const text = hit.text.replace(/\s+/g, ' ').trim();
                const match = terms.length
                    ? text.toLowerCase().indexOf(terms[0])
                    : 0;
                const start = Math.max(0, match - 45);
                snippet.textContent =
                    (start ? '…' : '') +
                    text.slice(start, start + 170) +
                    (text.length > start + 170 ? '…' : '');
                link.append(heading, title, snippet);
                item.append(link);
                results.append(item);
            }
            status.textContent = terms.length
                ? hits.length
                    ? hits.length + ' matching sections'
                    : 'No results. Try a command or setting, such as doctor or storagePath.'
                : 'Start with one of these pages, or search the full documentation.';
        } catch {
            results.replaceChildren();
            status.textContent =
                'Search could not load. Use the navigation to browse the documentation, or try again.';
        }
    };
    const openSearch = () => {
        if (dialog.open) return;
        versionPicker.open = false;
        opener = document.activeElement;
        closeMenu();
        dialog.showModal();
        input.focus();
        render();
    };
    document
        .querySelector('[data-open-search]')
        .addEventListener('click', openSearch);
    document
        .querySelector('[data-close-search]')
        .addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        if (opener) opener.focus();
    });
    dialog.addEventListener('click', (event) => {
        const rect = dialog.getBoundingClientRect();
        if (
            event.target === dialog &&
            (event.clientX < rect.left ||
                event.clientX > rect.right ||
                event.clientY < rect.top ||
                event.clientY > rect.bottom)
        )
            dialog.close();
    });
    input.addEventListener('input', render);
    results.addEventListener('click', (event) => {
        if (event.target.closest('a')) dialog.close();
    });
    document.addEventListener('keydown', (event) => {
        const editing =
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) ||
            event.target.isContentEditable;
        if (
            ((event.ctrlKey || event.metaKey) &&
                event.key.toLowerCase() === 'k') ||
            (event.key === '/' && !editing)
        ) {
            event.preventDefault();
            openSearch();
        }
    });
    dialog.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            dialog.close();
            return;
        }
        if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
        const links = [...results.querySelectorAll('a')];
        if (!links.length) return;
        const position = links.indexOf(document.activeElement);
        event.preventDefault();
        if (event.key === 'ArrowDown')
            links[(position + 1) % links.length].focus();
        else if (position <= 0) input.focus();
        else links[position - 1].focus();
    });
    const tocLinks = [...document.querySelectorAll('.page-toc nav a')];
    const sections = tocLinks
        .map((link) => document.getElementById(link.hash.slice(1)))
        .filter(Boolean);
    if ('IntersectionObserver' in window && sections.length) {
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort(
                        (a, b) =>
                            a.boundingClientRect.top - b.boundingClientRect.top,
                    )[0];
                if (!visible) return;
                tocLinks.forEach((link) => {
                    if (link.hash.slice(1) === visible.target.id)
                        link.setAttribute('aria-current', 'location');
                    else link.removeAttribute('aria-current');
                });
            },
            { rootMargin: '-90px 0px -60% 0px' },
        );
        sections.forEach((section) => observer.observe(section));
    }
})();
