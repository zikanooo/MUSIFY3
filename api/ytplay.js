const axios = require('axios');

// ---------------------------------------------------------------------------
// Musify — resolver audio via YouTube Music / YouTube (InnerTube) LANGSUNG.
// Server lama (vidssave, savetube, Piped, Invidious) sudah dihapus: tidak ada lagi
// perantara pihak ketiga. Semua klien InnerTube diadu paralel, link yang menang
// diuji dulu dari server (Range 0-1), lalu diputar lewat /api/proxy-audio karena
// URL googlevideo terikat IP server yang memintanya.
// ---------------------------------------------------------------------------

const ytCache = new Map();                 // videoId -> { data, expireAt }
const CACHE_TTL = 4 * 60 * 60 * 1000;
const WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const INNERTUBE_CLIENTS = [
  {
    name: 'ANDROID_MUSIC',
    host: 'music.youtube.com',
    ua: 'com.google.android.apps.youtube.music/7.27.52 (Linux; U; Android 14; en_US) gzip',
    body: { clientName: 'ANDROID_MUSIC', clientVersion: '7.27.52', androidSdkVersion: 34, osName: 'Android', osVersion: '14', hl: 'en', gl: 'US' },
    nameId: 21, delay: 0
  },
  {
    name: 'ANDROID_VR',
    host: 'www.youtube.com',
    ua: 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    body: { clientName: 'ANDROID_VR', clientVersion: '1.60.19', deviceMake: 'Oculus', deviceModel: 'Quest 3', osName: 'Android', osVersion: '12L', androidSdkVersion: 32, hl: 'en', gl: 'US' },
    nameId: 28, delay: 0
  },
  {
    name: 'IOS_MUSIC',
    host: 'music.youtube.com',
    ua: 'com.google.ios.youtubemusic/7.27.0 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X;)',
    body: { clientName: 'IOS_MUSIC', clientVersion: '7.27.0', deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.1.0.22B83', hl: 'en', gl: 'US' },
    nameId: 26, delay: 250
  },
  {
    name: 'IOS',
    host: 'music.youtube.com',
    ua: 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X;)',
    body: { clientName: 'IOS', clientVersion: '19.45.4', deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.1.0.22B83', hl: 'en', gl: 'US' },
    nameId: 5, delay: 250
  },
  {
    name: 'ANDROID',
    host: 'www.youtube.com',
    ua: 'com.google.android.youtube/19.44.38 (Linux; U; Android 14; en_US) gzip',
    body: { clientName: 'ANDROID', clientVersion: '19.44.38', androidSdkVersion: 34, osName: 'Android', osVersion: '14', hl: 'en', gl: 'US' },
    nameId: 3, delay: 600
  },
  {
    name: 'TV_EMBED',
    host: 'www.youtube.com',
    ua: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version',
    body: { clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', clientVersion: '2.0', hl: 'en', gl: 'US' },
    embed: true, nameId: 85, delay: 900
  },
  {
    name: 'WEB_EMBED',
    host: 'www.youtube.com',
    ua: WEB_UA,
    body: { clientName: 'WEB_EMBEDDED_PLAYER', clientVersion: '1.20241201.00.00', hl: 'en', gl: 'US' },
    embed: true, nameId: 56, delay: 900
  }
];

// URL googlevideo memuat c=<clientName>. Stream dari klien aplikasi (Android/iOS) harus diunduh dengan
// User-Agent klien yang sama, kalau tidak sering dijawab 403 — ini penyebab "lagu belum bisa dimuat".
const UA_BY_CLIENT = {};
INNERTUBE_CLIENTS.forEach((c) => { UA_BY_CLIENT[c.body.clientName] = c.ua; });
function clientOfUrl(url) {
  const m = /[?&]c=([A-Z0-9_]+)/.exec(url || '');
  return m ? m[1] : '';
}
function uaForUrl(url) { return UA_BY_CLIENT[clientOfUrl(url)] || WEB_UA; }
function needsWebHeaders(url) {
  const c = clientOfUrl(url);
  return !c || /^(WEB|TVHTML5|MWEB)/.test(c);
}
function streamHeaders(url, range) {
  const h = { 'User-Agent': uaForUrl(url), 'Accept': '*/*', 'Accept-Encoding': 'identity' };
  if (range) h['Range'] = range;
  if (needsWebHeaders(url)) { h['Origin'] = 'https://www.youtube.com'; h['Referer'] = 'https://www.youtube.com/'; }
  return h;
}

// visitorData (anonim) membuat permintaan terlihat seperti sesi nyata -> lebih jarang kena "bukan bot".
let visitorCache = { v: null, exp: 0 };
async function getVisitorData() {
  if (visitorCache.v && visitorCache.exp > Date.now()) return visitorCache.v;
  try {
    const { data } = await axios.get('https://music.youtube.com/', { headers: { 'User-Agent': WEB_UA, 'Accept-Language': 'en-US,en;q=0.9' }, timeout: 5000 });
    const m = /"VISITOR_DATA":"([^"]+)"/.exec(String(data)) || /"visitorData":"([^"]+)"/.exec(String(data));
    if (m) { visitorCache = { v: m[1], exp: Date.now() + 30 * 60 * 1000 }; return m[1]; }
  } catch (e) { /* tanpa visitorData tetap jalan */ }
  visitorCache = { v: null, exp: Date.now() + 60 * 1000 };
  return null;
}

function extractVideoId(url) {
  if (!url) return null;
  const str = String(url).trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
  const m = str.match(/(?:v=|\/embed\/|\/shorts\/|\/live\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function expireOf(url) {
  const m = /[?&]expire=(\d+)/.exec(url || '');
  return m ? parseInt(m[1], 10) * 1000 : 0;
}

function fmtDuration(secs) {
  secs = Math.max(0, parseInt(secs, 10) || 0);
  return `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Pencarian YouTube Music -> daftar videoId (dipakai bila input berupa teks / mode alternatif)
// ---------------------------------------------------------------------------
function collectVideoIds(node, out, limit) {
  if (!node || out.length >= limit) return;
  if (Array.isArray(node)) { for (const n of node) collectVideoIds(n, out, limit); return; }
  if (typeof node !== 'object') return;
  const r = node.musicResponsiveListItemRenderer;
  if (r) {
    const id = (r.playlistItemData && r.playlistItemData.videoId) ||
      (r.overlay && r.overlay.musicItemThumbnailOverlayRenderer && r.overlay.musicItemThumbnailOverlayRenderer.content &&
        r.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer &&
        r.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.playNavigationEndpoint &&
        r.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.playNavigationEndpoint.watchEndpoint &&
        r.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.playNavigationEndpoint.watchEndpoint.videoId);
    if (id && !out.includes(id)) out.push(id);
    return;
  }
  for (const k of Object.keys(node)) collectVideoIds(node[k], out, limit);
}

async function searchVideoIds(query, limit) {
  const out = [];
  const body = (params) => ({
    context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20241127.01.00', hl: 'id', gl: 'ID' } },
    query, ...(params ? { params } : {})
  });
  // 1) filter "Lagu"; 2) tanpa filter (cadangan bila filter kosong)
  for (const params of ['EgWKAQIIAWoSEAQQAxAFEAkQChAVEBAQERAO', null]) {
    try {
      const { data } = await axios.post('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', body(params), {
        headers: { 'Content-Type': 'application/json', 'User-Agent': WEB_UA, 'Origin': 'https://music.youtube.com' },
        timeout: 8000
      });
      collectVideoIds(data && data.contents, out, limit || 1);
      if (out.length) break;
    } catch (e) { /* coba berikutnya */ }
  }
  return out.slice(0, limit || 1);
}

async function searchVideoId(query) {
  const ids = await searchVideoIds(query, 1);
  return ids[0] || null;
}

// ---------------------------------------------------------------------------
// Pilih format audio terbaik
// ---------------------------------------------------------------------------
function pickAudioFormat(formats, allowOpus) {
  const list = (formats || []).filter(f => f && f.url && /^audio\//.test(f.mimeType || ''));
  if (!list.length) return null;
  const br = (f) => f.averageBitrate || f.bitrate || 0;
  const byBr = (a, b) => br(b) - br(a);
  const mp4 = list.filter(f => /audio\/mp4/.test(f.mimeType)).sort(byBr);
  const opus = list.filter(f => /opus/.test(f.mimeType)).sort(byBr);
  // AAC/MP4 jalan di semua browser (termasuk Safari/iOS); Opus hanya bila klien mendukung dan bitrate jauh lebih tinggi.
  if (mp4.length && opus.length && allowOpus && br(opus[0]) >= br(mp4[0]) * 1.25) return opus[0];
  return (mp4.length ? mp4 : list.sort(byBr))[0];
}

async function tryInnerTube(client, videoId, signal, allowOpus) {
  const visitor = await getVisitorData();
  const context = { client: Object.assign({}, client.body) };
  if (visitor) context.client.visitorData = visitor;
  if (client.embed) context.thirdParty = { embedUrl: 'https://www.youtube.com/watch?v=' + videoId };
  const res = await axios.post(
    `https://${client.host}/youtubei/v1/player?prettyPrint=false`,
    {
      videoId, context, contentCheckOk: true, racyCheckOk: true,
      playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } }
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': client.ua,
        'Origin': 'https://' + client.host,
        'X-YouTube-Client-Name': String(client.nameId),
        'X-YouTube-Client-Version': client.body.clientVersion,
        ...(visitor ? { 'X-Goog-Visitor-Id': visitor } : {})
      },
      timeout: 8000, signal
    }
  );
  const d = res.data || {};
  const st = d.playabilityStatus && d.playabilityStatus.status;
  if (st && st !== 'OK') throw new Error(`${client.name}: ${st} ${(d.playabilityStatus.reason || '').slice(0, 80)}`);
  const sd = d.streamingData || {};
  const fmt = pickAudioFormat([...(sd.adaptiveFormats || []), ...(sd.formats || [])], allowOpus);
  if (!fmt) throw new Error(`${client.name}: tidak ada format audio langsung`);
  return {
    duration: fmtDuration(d.videoDetails && d.videoDetails.lengthSeconds),
    audio: fmt.url,
    mime: fmt.mimeType || '',
    cdn: 'ytmusic-' + client.name,
    proxy: true,
    expireAt: expireOf(fmt.url)
  };
}

// Uji cepat: apakah URL benar-benar bisa dibaca dari server ini? (Range 0-1, UA sesuai klien). Mengembalikan kode HTTP (0 = gagal koneksi).
function probeUrl(url, ms) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? require('https') : require('http');
      const r = lib.get(url, { headers: streamHeaders(url, 'bytes=0-1'), timeout: ms || 4500 }, (res) => {
        const code = res.statusCode || 0;
        res.destroy(); fin(code);
      });
      r.on('timeout', () => { r.destroy(); fin(0); });
      r.on('error', () => fin(0));
    } catch (e) { fin(0); }
  });
}

const inflight = new Map();

async function getDownloadRaw(input, fresh, avoid, opus) {
  avoid = avoid || [];
  let videoId = extractVideoId(input);
  if (!videoId) videoId = await searchVideoId(input);   // input berupa judul/teks -> cari di YouTube Music
  if (!videoId) { const e = new Error('video tidak ditemukan'); e.__details = ['search: kosong']; throw e; }

  const cacheKey = videoId + (opus ? '|o' : '');
  const cached = fresh ? null : ytCache.get(cacheKey);
  if (cached && cached.expireAt > Date.now()) return cached.data;

  const controller = new AbortController();
  const unverified = [];   // link yang didapat tapi uji server gagal — dipakai hanya bila semuanya gagal
  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  // klien yang baru saja gagal di sisi pengguna ditunda supaya klien lain menang lebih dulu
  const later = (name, ms) => (avoid.some(a => a && name.indexOf(a) !== -1 || a && a.indexOf(name) !== -1) ? ms + 3000 : ms);

  const racers = INNERTUBE_CLIENTS.map((c) =>
    delay(later(c.name, c.delay)).then(async () => {
      if (controller.signal.aborted) throw new Error('aborted');
      let r;
      try { r = await tryInnerTube(c, videoId, controller.signal, opus); }
      catch (e1) {
        if (controller.signal.aborted || (e1 && e1.response && e1.response.status >= 400 && e1.response.status < 500)) throw e1;
        await delay(300);                                   // satu kali ulang untuk gangguan jaringan sesaat
        r = await tryInnerTube(c, videoId, controller.signal, opus);
      }
      const code = await probeUrl(r.audio, 4500);
      if (code !== 200 && code !== 206) { unverified.push(r); throw new Error(`${c.name}: link ditolak (HTTP ${code || 'gagal koneksi'})`); }
      return r;
    }).catch((err) => {
      const detail = err && err.response ? `HTTP ${err.response.status}` : (err && err.message);
      err.__provider = c.name; err.__detail = detail;
      throw err;
    })
  );

  let result;
  try {
    const deadline = new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('deadline'), { errors: [] })), 14000));
    result = await Promise.race([Promise.any(racers), deadline]);
  } catch (aggregateErr) {
    controller.abort();
    if (unverified.length) result = unverified[0];          // jalan terakhir: biarkan proxy-audio resolve ulang bila 403
    else {
      const details = ((aggregateErr && aggregateErr.errors) || []).map(e => `${e.__provider}: ${e.__detail || e.message}`);
      const err = new Error('All providers failed'); err.__details = details;
      console.error('[EXTRACT] Semua klien YouTube Music gagal:', details.join(' | '));
      throw err;
    }
  }
  controller.abort();

  result.videoId = videoId;
  console.log(`[EXTRACT] Winner: ${result.cdn}`);
  const ttlEnd = result.expireAt ? Math.min(result.expireAt - 10 * 60 * 1000, Date.now() + CACHE_TTL) : Date.now() + 90 * 60 * 1000;
  if (ttlEnd > Date.now()) ytCache.set(cacheKey, { data: result, expireAt: ttlEnd });
  if (ytCache.size > 300) ytCache.delete(ytCache.keys().next().value);
  return result;
}

function getDownload(url, fresh, avoid, opus) {
  const key = String(url) + (fresh ? '|f' : '') + (opus ? '|o' : '') + (avoid && avoid.length ? '|a' + avoid.join(',') : '');
  if (inflight.has(key)) return inflight.get(key);
  const p = getDownloadRaw(url, fresh, avoid, opus).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Expose-Headers', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const q = req.query || {};

  const url = String(q.query || q.url || q.id || body.query || body.url || body.id || '').trim();
  if (!url) { res.status(400).json({ status: false, message: 'Parameter query atau id wajib diisi' }); return; }

  const fresh = q.fresh === '1' || body.fresh === true;
  const avoid = String(q.avoid || body.avoid || '').split(',').map(x => x.trim()).filter(Boolean);
  const exclude = String(q.exclude || body.exclude || '').trim();   // id video yang sudah terbukti gagal
  const opus = q.opus === '1' || body.opus === true;
  const debug = q.debug === '1';

  const send = (r) => res.status(200).json({
    status: true,
    result: {
      videoId: r.videoId || null,
      duration: r.duration || null,
      download: { audio: r.audio, proxy: !!r.proxy, source: r.cdn, opus: /^audio\/webm|opus/i.test(r.mime || '') }
    }
  });

  let lastErr = null;
  try {
    if (exclude) {   // cari versi lain lagu yang sama (video asli diblokir wilayah / tanpa audio)
      const ids = (await searchVideoIds(url, 6)).filter(id => id !== exclude);
      for (const id of ids.slice(0, 3)) {
        try { const r = await getDownload(id, true, avoid, opus); if (r && r.audio) return send(r); }
        catch (e) { lastErr = e; }
      }
      throw lastErr || new Error('no alternative');
    }
    const r = await getDownload(url, fresh, avoid, opus);
    if (r && r.audio) return send(r);
  } catch (err) { lastErr = err; }

  console.error('[EXTRACT] Gagal:', (lastErr && lastErr.__details && lastErr.__details.join(' | ')) || (lastErr && lastErr.message));
  res.status(503).json({
    status: false,
    error: 'Lagu ini sedang tidak bisa dimuat dari YouTube Music. Coba lagi sebentar atau pilih lagu lain.',
    ...(debug ? { debug: (lastErr && lastErr.__details) || [lastErr && lastErr.message] } : {})
  });
};

// Dipakai proxy-audio & transcribe: resolve ulang dari server yang sama.
module.exports.getDownload = getDownload;
module.exports.extractVideoId = extractVideoId;
module.exports.streamHeaders = streamHeaders;
