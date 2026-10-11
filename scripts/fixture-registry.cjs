// Private localhost registry for native-manager tests; never contacts npm.
const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');
const archive = fs.readFileSync(process.argv[2]);
const server = http.createServer((request, response) => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    if (request.url === '/fnspm-fixture/-/fnspm-fixture-1.0.0.tgz') {
        response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        response.end(archive);
    } else if (
        request.url === '/fnspm-fixture' ||
        request.url === '/fnspm-fixture/1.0.0'
    ) {
        const version = {
            name: 'fnspm-fixture',
            version: '1.0.0',
            main: 'index.js',
            dist: {
                tarball: `${origin}/fnspm-fixture/-/fnspm-fixture-1.0.0.tgz`,
                shasum: crypto.createHash('sha1').update(archive).digest('hex'),
                integrity: `sha512-${crypto.createHash('sha512').update(archive).digest('base64')}`,
            },
        };
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
            JSON.stringify(
                request.url.endsWith('/1.0.0')
                    ? version
                    : {
                          name: 'fnspm-fixture',
                          'dist-tags': { latest: '1.0.0' },
                          versions: { '1.0.0': version },
                      },
            ),
        );
    } else if (request.url === '/fixture.js') {
        response.writeHead(200, { 'Content-Type': 'application/javascript' });
        response.end('export default 42;\n');
    } else {
        response.writeHead(404);
        response.end('Test fixture not found');
    }
});
server.listen(0, '127.0.0.1', () =>
    process.send(`http://127.0.0.1:${server.address().port}`),
);
process.on('disconnect', () => server.close());
