const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { basePath } = require('./site.config.cjs');
const root = path.join(__dirname, 'site');
const port = Number(process.env.PORT || 4173);
const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
};
if (!fs.existsSync(root))
    throw new Error('Build the documentation before starting the preview.');
http.createServer((request, response) => {
    try {
        const url = new URL(request.url, 'http://localhost');
        if (url.pathname === '/') {
            response.writeHead(302, { Location: basePath });
            response.end();
            return;
        }
        if (!url.pathname.startsWith(basePath))
            throw new Error('Unknown route');
        let file = path.resolve(
            root,
            decodeURIComponent(url.pathname.slice(basePath.length)),
        );
        if (file !== root && !file.startsWith(root + path.sep))
            throw new Error('Path outside site');
        const stats = fs.statSync(file);
        if (stats.isDirectory()) {
            if (!url.pathname.endsWith('/')) {
                response.writeHead(301, {
                    Location: url.pathname + '/' + url.search,
                });
                response.end();
                return;
            }
            file = path.join(file, 'index.html');
        }
        response.writeHead(200, {
            'Content-Type':
                types[path.extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-store',
        });
        fs.createReadStream(file).pipe(response);
    } catch {
        response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(fs.readFileSync(path.join(root, '404.html')));
    }
}).listen(port, '127.0.0.1', () =>
    console.log('Documentation preview: http://127.0.0.1:' + port + basePath),
);
