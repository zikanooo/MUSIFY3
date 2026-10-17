const https = require('https');
const http = require('http');

module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Expose-Headers', '*');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing url parameter');

    let parsed;
    try {
        parsed = new URL(targetUrl);
    } catch (e) {
        return res.status(400).send('Invalid url parameter');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return res.status(400).send('Invalid url protocol');
    }

    const options = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36'
        }
    };

    const client = parsed.protocol === 'https:' ? https : http;
    const proxyReq = client.get(targetUrl, options, (proxyRes) => {
        if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
            req.query.url = proxyRes.headers.location;
            return module.exports(req, res);
        }

        res.status(proxyRes.statusCode);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        const contentType = proxyRes.headers['content-type'];
        res.setHeader('Content-Type', contentType && contentType.startsWith('image/') ? contentType : 'image/jpeg');

        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        if (!res.headersSent) {
            res.status(502).send('Proxy error: ' + err.message);
        }
    });
};
