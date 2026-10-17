const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS: izinkan semua origin (dev/preview)
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Handler API dibungkus: error sinkron maupun promise yang ditolak tidak lagi menjatuhkan server.
const wrap = (fn) => (req, res, next) => {
    try {
        const out = fn(req, res, next);
        if (out && typeof out.catch === 'function') out.catch(next);
    } catch (e) { next(e); }
};

app.get('/api/health', (req, res) => res.json({ ok: true, uptime: Math.round(process.uptime()), time: new Date().toISOString() }));

const ROUTES = ['search', 'lyrics', 'lyrics1', 'lyrics2', 'artist', 'album', 'suggest', 'ytplay', 'translate', 'transcribe', 'proxy-audio', 'proxy-image'];
ROUTES.forEach((name) => {
    let handler;
    try { handler = require('./api/' + name + '.js'); }
    catch (e) { console.error('[server] gagal memuat api/' + name + '.js:', e.message); return; }
    app.all('/api/' + name, wrap(handler));
});

// Endpoint /api/* yang tidak ada -> JSON 404 (bukan index.html)
app.use('/api', (req, res) => res.status(404).json({ status: false, error: 'Endpoint tidak ditemukan' }));

// Static: aset ber-versi (?v=) di-cache, HTML & service worker selalu segar
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    setHeaders: (res, filePath) => {
        if (/(sw\.js|\.html)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
    }
}));

// ---------- SPA fallback + OG tags dinamis ----------
const INDEX = path.join(__dirname, 'public', 'index.html');
const DEFAULT_COVER = 'https://www.gobox.my.id/file/R0ym4wqfznmp.png';

// Nilai dari query string WAJIB di-escape sebelum masuk HTML (mencegah XSS lewat ?title=...)
const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const safeImg = (u, fallback) => {
    try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.toString() : fallback; }
    catch (e) { return fallback; }
};

function injectMeta(html, m) {
    const t = esc(m.title), d = esc(m.desc), i = esc(m.image), u = esc(m.url);
    // Pakai fungsi sebagai pengganti: karakter "$" pada judul lagu tidak ditafsirkan sebagai pola regex
    const rep = (re, val) => { html = html.replace(re, () => val); };
    rep(/<title>.*?<\/title>/i, `<title>${t}</title>`);
    rep(/<meta property="og:title" content=".*?"\s*\/?>/i, `<meta property="og:title" content="${t}">`);
    rep(/<meta property="og:description" content=".*?"\s*\/?>/i, `<meta property="og:description" content="${d}">`);
    rep(/<meta property="og:image" content=".*?"\s*\/?>/i, `<meta property="og:image" content="${i}">`);
    rep(/<meta property="og:image:secure_url" content=".*?"\s*\/?>/i, `<meta property="og:image:secure_url" content="${i}">`);
    rep(/<meta property="og:url" content=".*?"\s*\/?>/i, `<meta property="og:url" content="${u}">`);
    rep(/<meta name="twitter:title" content=".*?"\s*\/?>/i, `<meta name="twitter:title" content="${t}">`);
    rep(/<meta name="twitter:description" content=".*?"\s*\/?>/i, `<meta name="twitter:description" content="${d}">`);
    rep(/<meta name="twitter:image" content=".*?"\s*\/?>/i, `<meta name="twitter:image" content="${i}">`);
    rep(/<meta name="twitter:image:src" content=".*?"\s*\/?>/i, `<meta name="twitter:image:src" content="${i}">`);
    rep(/<link rel="icon".*?>/i, `<link rel="icon" type="image/jpeg" href="${i}">`);
    rep(/<link rel="apple-touch-icon".*?>/i, `<link rel="apple-touch-icon" href="${i}">`);
    return html;
}

function metaFor(req) {
    const p = req.path;
    const q = req.query || {};
    const cover = safeImg(q.cover || q.thumb, null);
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    if (p.startsWith('/play/')) {
        const id = p.split('/play/')[1].split('/')[0];
        if (!id) return null;
        const title = q.title ? (q.artist ? `${q.title} - ${q.artist}` : q.title) : 'Dengarkan Musik - Musify';
        return { title, desc: `Dengarkan ${q.title || 'lagu favoritmu'} di Musify Web Music Player`, image: cover || `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`, url };
    }
    if (p.startsWith('/artist/')) {
        if (!p.split('/artist/')[1]) return null;
        const name = q.name || q.title;
        return {
            title: name ? `${name} (Artist) - Musify` : 'Artist - Musify',
            desc: name ? `Dengarkan lagu & album terbaik dari ${name} di Musify` : 'Dengarkan lagu & album dari artist favoritmu di Musify',
            image: cover || DEFAULT_COVER, url
        };
    }
    if (p.startsWith('/album/')) {
        if (!p.split('/album/')[1]) return null;
        const t = q.title, a = q.artist;
        return {
            title: t ? (a ? `${t} - ${a} (Album) - Musify` : `${t} (Album) - Musify`) : 'Album - Musify',
            desc: t ? `Dengarkan album ${t} di Musify` : 'Dengarkan album favoritmu di Musify',
            image: cover || DEFAULT_COVER, url
        };
    }
    return null;
}

app.use((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).send('Method Not Allowed');
    // Permintaan file statis yang tidak ada (mis. /foo.png) -> 404 sungguhan, bukan HTML
    if (path.extname(req.path) && !/\.html$/i.test(req.path)) return res.status(404).send('Not found');

    fs.readFile(INDEX, 'utf8', (err, html) => {
        if (err) return res.status(500).send('index.html tidak ditemukan');
        const meta = metaFor(req);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(meta ? injectMeta(html, meta) : html);
    });
});

// Penangkap error terakhir
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('[server] error', req.method, req.originalUrl, '-', err && err.message);
    if (res.headersSent) return res.destroy();
    if (req.path.startsWith('/api/')) return res.status(500).json({ status: false, error: 'Terjadi kesalahan di server' });
    res.status(500).send('Terjadi kesalahan di server');
});

process.on('unhandledRejection', (e) => console.error('[server] unhandledRejection:', e && e.message));
process.on('uncaughtException', (e) => console.error('[server] uncaughtException:', e && e.message));

const port = process.env.PORT || 3000;
const server = app.listen(port, '0.0.0.0', () => console.log(`Server berjalan di http://0.0.0.0:${port}`));
server.keepAliveTimeout = 65000;
const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
