const https = require('https');
const http = require('http');

// Koneksi dipakai ulang (keep-alive) supaya seek & lagu berikutnya tanpa handshake ulang.
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 64 });
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 64 });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Semua host publik diizinkan; jaringan internal diblokir (anti-SSRF).
function isPrivateHost(h) {
    h = String(h || '').toLowerCase().replace(/^\[|\]$/g, '');
    return /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::1$|::$|fc|fd|fe80)/.test(h) || h.endsWith('.local') || h.endsWith('.internal');
}

function cors(req, res) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');
}

function fail(res, code, msg) {
    if (res.headersSent) { try { res.destroy(); } catch (e) {} return; }
    res.status(code).send(msg);
}

// state: { hops, retried, reresolved, vid }
function fetchUpstream(req, res, target, state) {
    let parsed;
    try { parsed = new URL(target); } catch (e) { return fail(res, 400, 'Invalid url parameter'); }
    if (!/^https?:$/.test(parsed.protocol) || isPrivateHost(parsed.hostname)) {
        return fail(res, 403, 'Host tidak diizinkan');
    }

    let headers = { 'User-Agent': UA, 'Accept': '*/*', 'Accept-Encoding': 'identity', 'Connection': 'keep-alive' };
    if (/googlevideo\.com$/i.test(parsed.hostname) || /youtube\.com$/i.test(parsed.hostname)) {
        // UA/Origin harus cocok dengan klien yang membuat link (lihat c= di URL), kalau tidak googlevideo menjawab 403.
        try { headers = Object.assign(headers, require('./ytplay.js').streamHeaders(target)); } catch (e) {
            headers['Origin'] = 'https://www.youtube.com'; headers['Referer'] = 'https://www.youtube.com/';
        }
    }
    headers['Range'] = req.headers.range || 'bytes=0-';

    const client = parsed.protocol === 'https:' ? https : http;
    const upstream = client.get(target, { headers, agent: parsed.protocol === 'https:' ? httpsAgent : httpAgent, timeout: 15000 }, (up) => {
        const code = up.statusCode || 502;

        if (code >= 300 && code < 400 && up.headers.location && state.hops < 5) {
            up.resume();
            return fetchUpstream(req, res, new URL(up.headers.location, target).toString(), Object.assign({}, state, { hops: state.hops + 1 }));
        }

        // URL kedaluwarsa / terikat IP lain: resolve ulang dari server INI lalu coba lagi satu kali.
        if ([401, 403, 404, 410].includes(code) && state.vid && !state.reresolved) {
            up.resume();
            let resolver = null;
            try { resolver = require('./ytplay.js').getDownload; } catch (e) {}
            if (resolver) {
                return resolver(state.vid, true, [], state.opus).then((r) => {
                    if (!r || !r.audio) throw new Error('empty');
                    fetchUpstream(req, res, r.audio, Object.assign({}, state, { hops: 0, reresolved: true }));
                }).catch(() => fail(res, 502, 'Sumber audio tidak bisa dimuat ulang'));
            }
        }

        // Gangguan sesaat di sisi sumber: coba sekali lagi sebelum menyerah.
        if ((code === 429 || code >= 500) && !state.retried) {
            up.resume();
            return setTimeout(() => fetchUpstream(req, res, target, Object.assign({}, state, { retried: true })), 250);
        }

        // Status diteruskan apa adanya (206 hanya bila sumber memang 206 + Content-Range).
        res.status(code);
        cors(req, res);
        ['content-type', 'content-length', 'accept-ranges', 'content-range'].forEach(h => { if (up.headers[h]) res.setHeader(h, up.headers[h]); });
        if (!res.getHeader('accept-ranges')) res.setHeader('Accept-Ranges', 'bytes');
        if (!res.getHeader('content-type') || /text\/html/.test(String(res.getHeader('content-type')))) {
            if (code < 400) res.setHeader('Content-Type', 'audio/mp4');
        }
        res.setHeader('Cache-Control', code < 400 ? 'private, max-age=3600' : 'no-store');

        if (req.method === 'HEAD') { up.destroy(); return res.end(); }
        up.pipe(res);
        up.on('error', () => { try { res.destroy(); } catch (e) {} });
        res.on('close', () => up.destroy());
    });

    upstream.on('timeout', () => upstream.destroy(new Error('timeout')));
    upstream.on('error', (err) => {
        if (!state.retried && !res.headersSent) return setTimeout(() => fetchUpstream(req, res, target, Object.assign({}, state, { retried: true })), 250);
        fail(res, 502, 'Proxy error: ' + err.message);
    });
    req.on('close', () => upstream.destroy());
}

module.exports = (req, res) => {
    cors(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    const q = req.query || {};
    const targetUrl = q.url;
    if (!targetUrl) return res.status(400).send('Missing url parameter');
    const vid = /^[a-zA-Z0-9_-]{11}$/.test(String(q.vid || '')) ? String(q.vid) : null;
    fetchUpstream(req, res, targetUrl, { hops: 0, retried: false, reresolved: false, vid, opus: q.o === '1' });
};
