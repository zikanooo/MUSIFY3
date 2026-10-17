/* Musify — konfigurasi pusat. Dimuat paling awal; semua modul membaca dari sini. */
(function (w) {
  'use strict';

  var CFG = {
    name: 'Musify',
    version: '5.2',
    developer: 'zychocuwek',
    channel: 'https://whatsapp.com/channel/0029Vb8gHJ7545uuF9Ox1I2z',
    changelog: [
      { icon: 'music',     title: 'Server YouTube Music', text: 'Pemutaran kini langsung dari YouTube Music, tanpa server perantara.' },
      { icon: 'zap',       title: 'Lebih Stabil',         text: 'Link otomatis diperbarui dan dicoba ulang bila gagal diputar.' },
      { icon: 'sparkles',  title: 'Tampilan Elegan',      text: 'Tema graphite monokrom yang bersih dan ringan.' }
    ]
  };
  w.APP_CONFIG = CFG;

  /* ---- Migrasi data lama ----
     Kunci localStorage lama diganti nama; isinya disalin sekali agar lagu favorit,
     playlist, volume, dll. milik pengguna tidak hilang. Aman dihapus setelah beberapa rilis. */
  var LEGACY = {
    'nanzz_volume': 'musify_volume',
    'nanzz_playback_rate': 'musify_playback_rate',
    'nanzz_auto_next': 'musify_auto_next',
    'nanzz_liked_songs': 'musify_liked_songs',
    'nanzz_liked_artists': 'musify_liked_artists',
    'nanzz_playlists': 'musify_playlists',
    'nanz_bg_glow_enabled': 'musify_bg_glow_enabled'
  };
  try {
    Object.keys(LEGACY).forEach(function (oldKey) {
      var v = localStorage.getItem(oldKey);
      if (v !== null && localStorage.getItem(LEGACY[oldKey]) === null) localStorage.setItem(LEGACY[oldKey], v);
      if (v !== null) localStorage.removeItem(oldKey);
    });
  } catch (e) {}

  /* ---- Banner video ----
     Banner.html() dipakai header tiap halaman. Video hanya diputar saat terlihat
     (IntersectionObserver), dijeda saat tab tersembunyi, dan diganti poster bila
     pengguna memilih "kurangi gerakan". */
  var reduce = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var io = ('IntersectionObserver' in w) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      var v = en.target;
      if (en.isIntersecting && !document.hidden && !reduce) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
      else v.pause();
    });
  }, { threshold: 0.01 }) : null;

  function arm(v) {
    if (v.__nm) return; v.__nm = 1;
    v.muted = true; v.defaultMuted = true;
    if (io) io.observe(v); else if (!reduce) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    v.addEventListener('loadeddata', function () { v.classList.add('is-ready'); });
    if (v.readyState >= 2) v.classList.add('is-ready');
  }

  w.Banner = {
    html: function () {
      return '<div class="nm-banner" aria-hidden="true"><video class="nm-banner-video" src="/assets/banner.mp4" poster="/assets/banner-poster.jpg" ' +
        'autoplay muted loop playsinline preload="auto" disablepictureinpicture disableremoteplayback></video></div>';
    }
  };

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.matches && root.matches('.nm-banner-video')) arm(root);
    var list = root.querySelectorAll('.nm-banner-video');
    for (var i = 0; i < list.length; i++) arm(list[i]);
  }
  document.addEventListener('DOMContentLoaded', function () {
    scan(document);
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var add = muts[i].addedNodes;
        for (var j = 0; j < add.length; j++) if (add[j].nodeType === 1) scan(add[j]);
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  document.addEventListener('visibilitychange', function () {
    document.querySelectorAll('.nm-banner-video').forEach(function (v) {
      if (document.hidden) v.pause();
    });
    /* saat kembali terlihat, IntersectionObserver tidak menembak ulang — mainkan manual yang terlihat */
    if (!document.hidden && !reduce) document.querySelectorAll('.nm-banner-video.is-ready').forEach(function (v) {
      if (v.offsetParent !== null) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    });
  });
})(window);
