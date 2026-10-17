const https = require('https');

// Cache saran 5 menit: ketikan berulang / mundur (backspace) tidak perlu ke Google lagi.
const CACHE = new Map();
const TTL = 5 * 60 * 1000;
const agent = new https.Agent({ keepAlive: true, maxSockets: 16 });

function fetchSuggest(query) {
    return new Promise((resolve, reject) => {
        const r = https.get({
            hostname: 'suggestqueries.google.com',
            path: '/complete/search?client=youtube&ds=yt&hl=id&q=' + encodeURIComponent(query),
            headers: { 'User-Agent': 'Mozilla/5.0 Chrome/124.0.0.0' },
            agent, timeout: 4000
        }, (res) => {
            let d = ''; res.setEncoding('utf8');
            res.on('data', (c) => { d += c; });
            res.on('end', () => resolve(d));
        });
        r.on('timeout', () => r.destroy(new Error('timeout')));
        r.on('error', reject);
    });
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Expose-Headers', '*');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    const query = String(req.query?.q || req.query?.query || req.body?.q || req.body?.query || '').trim().slice(0, 100);
    if (!query) { return res.status(200).json([]); }

    const key = query.toLowerCase();
    const hit = CACHE.get(key);
    if (hit && hit.exp > Date.now()) {
        res.setHeader('Cache-Control', 'public, max-age=120');
        return res.status(200).json(hit.list);
    }

    try {
        const data = await fetchSuggest(query);
        const json = JSON.parse(data.replace(/^window\.google\.ac\.h\(/, '').replace(/\)\s*$/, ''));
        const list = (Array.isArray(json) && Array.isArray(json[1])) ? json[1].filter(i => Array.isArray(i) && i[0]).map(i => i[0]).slice(0, 8) : [];
        CACHE.set(key, { exp: Date.now() + TTL, list });
        if (CACHE.size > 500) CACHE.delete(CACHE.keys().next().value);
        res.setHeader('Cache-Control', 'public, max-age=120');
        res.status(200).json(list);
    } catch (e) {
        res.status(200).json([]);   // saran gagal bukan error fatal: UI cukup tidak menampilkan dropdown
    }
};
