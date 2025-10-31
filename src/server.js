import http from 'node:http'

export function startServer({ port = Number(process.env.PORT || 7070) } = {}) {
  const invalid = msg => ({
    Success: false,
    Version: '1.1',
    StatusCode: 0,
    StatusDescription: 'Bad Request',
    Headers: '',
    Content: '',
    ContentLength: 0,
    ContentType: 'text/plain',
    Elapsed: 0,
    Error: String(msg || 'Invalid request'),
  });

  function setCors(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', req.headers['access-control-request-method'] || 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type, Authorization, Cache-Control, Accept');
  }

  const server = http.createServer(async (req, res) => {
    setCors(req, res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url !== '/proxy') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(invalid('Not found. Use POST /proxy')));
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(invalid('Only POST is allowed.')));
      return;
    }

    // Read raw body
    let raw = '';
    for await (const chunk of req) raw += chunk;

    // Parse outer JSON
    let payload;
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(invalid('Invalid JSON body.')));
      return;
    }

    // Accept either { json: "<stringified>" } or { json: {...} } or a direct object
    let rj;
    try {
      rj = typeof payload?.json === 'string' ? JSON.parse(payload.json) : (payload.json || payload);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(invalid('Invalid "json" payload.')));
      return;
    }

    const method = String(rj?.method || 'GET').toUpperCase();
    const target = String(rj?.idnUrl || rj?.url || '').trim();
    if (!target) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(invalid('Missing target URL.')));
      return;
    }

    // Build fetch options
    const opts = { method, headers: {} };

    // Parse headers from single string: "Key: Val\nKey2: Val2"
    if (rj?.headers) {
      for (const line of String(rj.headers).split('\n')) {
        const t = line.trim();
        if (!t) continue;
        const i = t.indexOf(':');
        if (i < 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(invalid(`Invalid Header:\n${t}`)));
          return;
        }
        const k = t.slice(0, i).trim();
        const v = t.slice(i + 1).trim();
        const low = k.toLowerCase();
        if (low === 'host' || low === 'content-length') continue; // forbidden / auto-calculated
        opts.headers[k] = v;
      }
    }

    // Body and Content-Type
    if (rj?.body != null) {
      opts.body = typeof rj.body === 'string' ? rj.body : String(rj.body);
    }
    if (rj?.contentType) {
      opts.headers['Content-Type'] = rj.contentType;
    }

    const started = Date.now();
    try {
      const resp = await fetch(target, opts);
      const elapsed = Date.now() - started;

      let headersStr = '';
      resp.headers.forEach((v, n) => {
        headersStr += `${n}: ${v}\n`;
      });

      const text = await resp.text();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        Success: resp.ok,
        Version: '1.1',
        StatusCode: resp.status,
        StatusDescription: resp.statusText,
        Headers: headersStr,
        Content: text || '',
        ContentLength: (text || '').length,
        ContentType: resp.headers.get('content-type') || '',
        Elapsed: elapsed,
      }));
    } catch {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(invalid('Error sending request.')));
    }
  });

  return new Promise(resolve => {
    server.listen(port, () => {
      console.log(`Local proxy: http://localhost:${port}/proxy`);
      resolve(server);
    });
  });
}
