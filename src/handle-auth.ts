import http from 'http';
import url from 'url';

export function startCallbackServer() {
  const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url!, true);
    if (parsedUrl.pathname === '/auth/callback') {
      const { code, error } = parsedUrl.query;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <h1>Success!</h1>
        <p>Copy this access token back: ${code}</p>
      `);
    }
  }).listen(3000);
};
