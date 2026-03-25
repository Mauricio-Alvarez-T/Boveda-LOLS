const http = require('https');

console.log('Testing production API: https://boveda.lols.cl/api/auth/login');
const startTime = Date.now();

const req = http.request('https://boveda.lols.cl/api/auth/login', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    timeout: 10000 // 10 seconds timeout
}, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
    res.setEncoding('utf8');
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        console.log(`BODY: ${data}`);
        console.log(`Time taken: ${Date.now() - startTime}ms`);
    });
});

req.on('timeout', () => {
    console.error(`Request timed out after 10 seconds. The server accepted the connection but didn't respond!`);
    req.destroy();
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

// Write mock body
req.write(JSON.stringify({ email: 'test@lols.cl', password: 'wrongpassword' }));
req.end();
