import http from 'node:http';
import client from 'prom-client';
export { client };
export const register = client.register;
client.collectDefaultMetrics();
// Tiny HTTP server for services without Express (processor).
export function startMetricsServer(port, ready = () => true) {
  return http.createServer(async (req, res) => {
    if (req.url === '/metrics') { res.setHeader('Content-Type', register.contentType); return res.end(await register.metrics()); }
    if (req.url === '/healthz') { res.statusCode = 200; return res.end('ok'); }
    if (req.url === '/readyz') { res.statusCode = ready() ? 200 : 503; return res.end(ready() ? 'ready' : 'not ready'); }
    res.statusCode = 404; res.end();
  }).listen(port);
}
