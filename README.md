# Musify v5.1

Web music player berbasis YouTube Music (pencarian, streaming, lirik) yang bisa dipasang sebagai PWA.
Developer: **zychocuwek** · Saluran WhatsApp: https://whatsapp.com/channel/0029Vb8gHJ7545uuF9Ox1I2z

## Struktur proyek

```
api/                 handler (req, res) — dipakai Vercel Functions DAN server.js
public/
├─ index.html        kerangka halaman (tanpa CSS/JS inline)
├─ manifest.json     konfigurasi PWA
├─ sw.js             service worker (cache, offline, klik notifikasi) — harus di root
├─ assets/           logo.png, banner.mp4, banner-poster.jpg
├─ css/              base · motion · nm-ui · banner · loader · notifications · utilities (statis, pengganti Tailwind CDN) · elegant
└─ js/
   ├─ core/          config · sw-register · player · loader · notifications · app · motion · nm-ui
   ├─ pages/         home · search · library · liked · profile · artist · album
   └─ ui/            miniplayer · fullplayer
scripts/lint.js      cek sintaks semua berkas JS (npm run lint)
server.js            server Express untuk dev lokal / VPS / Railway / Render
vercel.json          rewrite SPA, CORS, maxDuration 30 dtk
```

Pengaturan pusat (nama, versi, developer, link saluran, daftar "yang baru") ada di
`public/js/core/config.js`. Naikkan `version` di sana setiap rilis agar popup update dan
notifikasi muncul lagi.

## Menjalankan

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint       # cek sintaks
```

Cek kesehatan server: `GET /api/health`.

## Deploy

- **Vercel**: import repo, tanpa build command. `api/*.js` otomatis jadi Function.
  Catatan: di Vercel semua path jatuh ke `index.html`, jadi preview OG dinamis
  (`/play/:id?title=...`) hanya aktif lewat `server.js`.
- **VPS / Railway / Render**: `npm start` (pakai `PORT` dari environment).

## Pemutaran lagu

`/api/ytplay` mengadu beberapa klien YouTube Music / YouTube (InnerTube: ANDROID_MUSIC, ANDROID_VR, IOS_MUSIC, IOS, ANDROID, TV/WEB embed)
dan memakai yang tercepat. Server perantara lama (vidssave, savetube, Piped, Invidious) sudah dihapus. URL googlevideo terikat IP, jadi diputar lewat `/api/proxy-audio`.
Setiap link diuji dulu dari server (Range 0-1) sebelum dikirim ke pemutar. Bila putar gagal,
klien meminta link baru dengan menghindari provider yang barusan gagal, memaksa lewat proxy,
dan terakhir mencari versi lain lagu yang sama.

## v5.0 — perubahan

**Fitur baru**
- **Pusat Notifikasi**: ikon lonceng + badge di beranda (juga badge di ikon aplikasi PWA). Lembar bawah berisi riwayat, tandai dibaca, hapus, dan tarik ke bawah untuk menutup. Ada kartu "Pusat Notifikasi" di halaman Profil.
- **Notifikasi perangkat (opsional)**: saklar di lembar notifikasi (atau tombol di popup update). Saat aktif, lagu yang sedang diputar dan pembaruan versi muncul ketika aplikasi di latar belakang; ketukan membuka kembali aplikasi.
- **Deteksi pembaruan**: bila Service Worker versi baru terpasang saat aplikasi terbuka, muncul banner "Pembaruan siap" dengan tombol Muat ulang.
- **Popup "Versi 5.0"** menampilkan daftar perubahan dari `config.js`.

**Tampilan**
- **Animasi loading gaya iOS**: ikon squircle muncul dengan blur-ke-tajam, progres tipis, keluar dengan zoom halus memakai kurva iOS (`cubic-bezier(.32,.72,0,1)`); aplikasi "terbuka" dengan zoom lembut. Bar tipis di atas layar untuk setiap permintaan API. Mendukung `prefers-reduced-motion`.
- **Banner MP4**: header Beranda, Pustaka, Disukai, dan Profil memakai video (`assets/banner.mp4`, tanpa suara) dengan poster cadangan. Video hanya diputar saat terlihat dan dijeda saat tab tersembunyi.

**Identitas**
- Developer menjadi **zychocuwek**; seluruh nama lama dihapus dari UI, API (`creator`), metadata, manifest, dan paket.
- Nama aplikasi menjadi **Musify**. Link saluran WhatsApp diganti ke saluran baru.
- Versi: **5.0** (UI/popup/notifikasi) dan `5.0.0` (`package.json`).

**Struktur & perawatan**
- File datar di `public/` dipisah ke `css/`, `js/core|pages|ui/`, `assets/`; CSS inline `index.html` dipindah ke `css/base.css`; tiga lapis aturan splash yang saling menimpa diganti satu `loader.css`.
- Cache Service Worker naik ke v51 (cache lama otomatis dihapus). Video dan permintaan Range tidak lagi lewat cache agar kompatibel dengan Safari/iOS.
- Data pengguna aman: kunci localStorage lama (favorit, playlist, volume, dll.) disalin otomatis ke nama baru sekali saja (tabel di `config.js`, boleh dihapus setelah beberapa rilis).

## Riwayat singkat

- **v9**: header pencarian dirapikan (satu tombol X), navbar riak/kilau penuh, animasi dekoratif dijeda saat tab tersembunyi.
- **v8**: progres lagu tunggal, pencarian real-time dengan cache klien/server, bitrate tertinggi + Opus, `content-visibility` pada daftar hasil.

## v5.1 — tampilan elegan & performa

- Tailwind CDN dihapus (kompilasi di browser = penyebab utama lag). Gantinya `public/css/utilities.css`,
  CSS statis hasil `npm run css` (`scripts/twgen.py`). **Jalankan `npm run css` setiap menambah class
  utilitas baru di JS/HTML** (butuh Python 3).
- `css/elegant.css` (dimuat terakhir): tema graphite monokrom, aksen mutiara mengikuti cover.
- Dihapus: latar aurora blur bergerak, border dock berputar, kilau/float berulang, glow `mix-blend`,
  filter blur pada animasi masuk, `backdrop-filter` pada dock/mini player/pencarian.
- Loading page baru (`loader.css`, `loader.js`): logo dalam cincin progres, wordmark bertahap, tirai terbuka.
- Perbaikan bug: efek riak tombol memakai variabel `px`/`py` yang tidak terdefinisi.
- Cache Service Worker naik ke v52.

## v5.2 — server YouTube Music

- Pemutaran, unduhan, dan transkripsi kini hanya memakai YouTube Music (InnerTube) langsung; provider pihak ketiga dihapus.
- Pencarian id memakai YouTube Music (dengan cadangan tanpa filter); satu kali ulang otomatis per klien untuk gangguan sesaat.
- Bila uji server gagal untuk semua klien, link tetap dikirim dan `/api/proxy-audio` me-resolve ulang saat 403.
- Cache Service Worker naik ke v53. Debug: `/api/ytplay?query=<videoId>&debug=1`.
- Perbaikan "lagu belum bisa dimuat": probe & proxy-audio kini memakai User-Agent/Origin sesuai klien pembuat link (c= di URL googlevideo), plus visitorData anonim.
