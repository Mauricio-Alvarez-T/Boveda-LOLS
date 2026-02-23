const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/fiscalizacion/exportar-excel',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
        // Missing auth token, but let's check if the error is due to auth or body
    }
};

const req = http.request(options, res => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => console.log('Response:', res.statusCode, body));
});

req.on('error', e => console.error(e));
req.write(JSON.stringify({ trabajadores: [{ id: 1 }, { id: 2 }] }));
req.end();
