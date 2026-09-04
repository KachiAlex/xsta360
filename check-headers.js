const http = require('http');
http.get('http://localhost:3000/login', (r) => {
  const headers = r.headers;
  for (const [k, v] of Object.entries(headers)) {
    if (k.startsWith('x-') || k.startsWith('content-security') || k.startsWith('strict-') || k.startsWith('referrer') || k.startsWith('permissions')) {
      console.log(k + ': ' + v);
    }
  }
  r.resume();
}).on('error', (e) => console.error(e));
