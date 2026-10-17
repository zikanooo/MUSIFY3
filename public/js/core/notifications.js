/* Musify — Pusat Notifikasi.
   - Riwayat notifikasi (disimpan di localStorage, maks. 30) + badge lonceng + badge ikon aplikasi PWA
   - Lembar bawah (bottom sheet) dengan tombol aktif/nonaktif notifikasi perangkat
   - Banner dalam-aplikasi, dan notifikasi perangkat via Service Worker (opt-in) */
(function (w, d) {
  'use strict';

  var C = w.APP_CONFIG || {};
  var KEY = 'musify_notifs', SYS = 'musify_notif_system', SEED = 'musify_notif_seed', MAX = 30;
  var list = [], bannerT = null, lastTrack = '', escHandler = null;

  function load() {
    try { list = JSON.parse(localStorage.getItem(KEY) || '[]'); if (!Array.isArray(list)) list = []; } catch (e) { list = []; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function icons() { try { w.lucide && lucide.createIcons(); } catch (e) {} }
  function say(m) { if (typeof w.showToast === 'function') w.showToast(m); }

  function ago(ts) {
    var s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return 'Baru saja';
    if (s < 3600) return Math.floor(s / 60) + ' mnt lalu';
    if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
    if (s < 604800) return Math.floor(s / 86400) + ' hari lalu';
    return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  }

  var ICON = { update: 'sparkles', music: 'music', info: 'info', system: 'bell-ring', channel: 'message-circle' };

  function unread() { return list.filter(function (n) { return !n.read; }).length; }

  /* ---------- badge ---------- */
  function refresh() {
    var n = unread();
    d.querySelectorAll('[data-nm-badge]').forEach(function (b) {
      b.textContent = n > 9 ? '9+' : String(n);
      b.classList.toggle('on', n > 0);
    });
    try { if ('setAppBadge' in navigator) { n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } } catch (e) {}
    var sheet = d.getElementById('nm-notif-sheet');
    if (sheet) renderList();
  }

  function ringBell() {
    d.querySelectorAll('.nm-bell').forEach(function (b) {
      b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring');
      setTimeout(function () { b.classList.remove('ring'); }, 1000);
    });
  }

  /* ---------- izin & notifikasi perangkat ---------- */
  function supported() { return 'Notification' in w; }
  function permission() { return supported() ? Notification.permission : 'unsupported'; }
  function systemEnabled() {
    var on = false; try { on = localStorage.getItem(SYS) === '1'; } catch (e) {}
    return on && permission() === 'granted';
  }

  function system(n) {
    if (!systemEnabled()) return false;
    var opt = { body: n.body || '', icon: n.icon || '/assets/logo.png', badge: '/assets/logo.png', tag: n.tag || n.id || 'musify', silent: !!n.silent, data: { url: n.url && /^https?:/.test(n.url) ? n.url : '/' } };
    var fallback = function () { try { new Notification(n.title, opt); } catch (e) {} };
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(function (reg) { return reg.showNotification(n.title, opt); }).catch(fallback);
    } else fallback();
    return true;
  }

  function enableSystem() {
    if (!supported()) { say('Browser ini belum mendukung notifikasi'); return Promise.resolve(false); }
    var ask = permission() === 'granted' ? Promise.resolve('granted') : Promise.resolve(Notification.requestPermission());
    return ask.then(function (res) {
      if (res === 'granted') {
        try { localStorage.setItem(SYS, '1'); } catch (e) {}
        system({ title: 'Notifikasi aktif', body: 'Kamu akan menerima kabar dari Musify.', tag: 'musify-welcome', silent: true });
        say('Notifikasi perangkat aktif');
        paintSys();
        return true;
      }
      say(res === 'denied' ? 'Izin ditolak. Aktifkan lewat pengaturan browser.' : 'Izin notifikasi belum diberikan');
      paintSys();
      return false;
    }).catch(function () { say('Gagal meminta izin notifikasi'); return false; });
  }
  function disableSystem() { try { localStorage.setItem(SYS, '0'); } catch (e) {} say('Notifikasi perangkat dimatikan'); paintSys(); }
  function toggleSystem() { return systemEnabled() ? (disableSystem(), Promise.resolve(false)) : enableSystem(); }

  /* ---------- push ---------- */
  function push(n, opts) {
    opts = opts || {};
    var item = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type: n.type || 'info', title: n.title || '', body: n.body || '', url: n.url || '', label: n.label || '',
      time: Date.now(), read: false
    };
    if (opts.store !== false) { list.unshift(item); list = list.slice(0, MAX); save(); refresh(); ringBell(); }
    if (opts.banner) banner(item);
    if (opts.system) system(item);
    return item;
  }

  function act(url) {
    if (!url) return;
    if (url === 'reload') { location.reload(); return; }
    if (/^https?:/.test(url)) w.open(url, '_blank', 'noopener');
  }

  /* ---------- banner dalam-aplikasi ---------- */
  function banner(n) {
    var old = d.getElementById('nm-notif-banner'); if (old) old.remove();
    clearTimeout(bannerT);
    var el = d.createElement('div');
    el.id = 'nm-notif-banner'; el.setAttribute('role', 'status');
    el.innerHTML = '<div class="nmn-ico ' + esc(n.type) + '"><i data-lucide="' + (ICON[n.type] || 'bell') + '" class="w-5 h-5"></i></div>' +
      '<div class="nmn-body"><b>' + esc(n.title) + '</b>' + (n.body ? '<p>' + esc(n.body) + '</p>' : '') + '</div>';
    el.onclick = function () { hideBanner(); n.url ? act(n.url) : open(); };
    d.body.appendChild(el); icons();
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('show'); }); });
    bannerT = setTimeout(hideBanner, 5500);
  }
  function hideBanner() {
    var el = d.getElementById('nm-notif-banner'); if (!el) return;
    el.classList.remove('show'); setTimeout(function () { el.remove(); }, 450);
  }

  /* ---------- lembar bawah ---------- */
  function sysRowHTML() {
    var p = permission(), on = systemEnabled();
    var sub = p === 'unsupported' ? 'Tidak didukung di browser ini.'
      : p === 'denied' ? 'Diblokir. Izinkan lewat pengaturan situs di browser.'
      : on ? 'Aktif.'
      : 'Terima kabar dari Musify.';
    return '<div class="t"><b>Notifikasi perangkat</b><span>' + sub + '</span></div>' +
      '<button class="nmn-switch" role="switch" aria-checked="' + on + '" aria-label="Notifikasi perangkat" data-act="sys"' +
      (p === 'unsupported' || p === 'denied' ? ' disabled' : '') + '></button>';
  }
  function paintSys() { var r = d.getElementById('nmn-sys'); if (r) r.innerHTML = sysRowHTML(); }

  function renderList() {
    var box = d.getElementById('nmn-list'); if (!box) return;
    if (!list.length) {
      box.innerHTML = '<div class="nmn-empty"><i data-lucide="bell-off"></i>Belum ada notifikasi.</div>';
    } else {
      box.innerHTML = list.map(function (n) {
        return '<div class="nmn-item' + (n.read ? '' : ' unread') + '" data-id="' + esc(n.id) + '">' +
          '<div class="nmn-ico ' + esc(n.type) + '"><i data-lucide="' + (ICON[n.type] || 'bell') + '" class="w-5 h-5"></i></div>' +
          '<div class="nmn-body"><b>' + esc(n.title) + '</b>' + (n.body ? '<p>' + esc(n.body) + '</p>' : '') +
          '<div class="nmn-meta"><time>' + ago(n.time) + '</time>' +
          (n.url ? '<button class="go" data-act="go" data-url="' + esc(n.url) + '">' + esc(n.label || 'Buka') + '</button>' : '') +
          '<button class="del" data-act="del" aria-label="Hapus">Hapus</button></div></div></div>';
      }).join('');
    }
    icons();
  }

  function open() {
    if (d.getElementById('nm-notif-sheet')) return;
    var el = d.createElement('div');
    el.id = 'nm-notif-sheet';
    el.innerHTML = '<div class="nmn-scrim" data-act="close"></div>' +
      '<div class="nmn-panel" role="dialog" aria-modal="true" aria-label="Notifikasi">' +
        '<div class="nmn-grab"></div>' +
        '<div class="nmn-head"><h2>Notifikasi</h2><div class="nmn-actions"><button data-act="readall">Tandai dibaca</button><button data-act="clear">Hapus semua</button></div></div>' +
        '<div class="nmn-sys" id="nmn-sys">' + sysRowHTML() + '</div>' +
        '<div class="nmn-list" id="nmn-list"></div>' +
      '</div>';
    d.body.appendChild(el);
    renderList();
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('show'); }); });

    el.addEventListener('click', function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return;
      var a = t.getAttribute('data-act');
      if (a === 'close') close();
      else if (a === 'readall') { markAllRead(); }
      else if (a === 'clear') { list = []; save(); refresh(); }
      else if (a === 'sys') toggleSystem();
      else if (a === 'go') act(t.getAttribute('data-url'));
      else if (a === 'del') {
        var id = t.closest('.nmn-item').getAttribute('data-id');
        list = list.filter(function (n) { return n.id !== id; }); save(); refresh();
      }
    });

    // tarik ke bawah untuk menutup
    var panel = el.querySelector('.nmn-panel'), sy = 0, dy = 0, drag = false;
    var handle = function (e) { return e.target.closest('.nmn-grab, .nmn-head') && !e.target.closest('button'); };
    panel.addEventListener('touchstart', function (e) { if (!handle(e)) return; drag = true; sy = e.touches[0].clientY; dy = 0; panel.classList.add('dragging'); }, { passive: true });
    panel.addEventListener('touchmove', function (e) { if (!drag) return; dy = Math.max(0, e.touches[0].clientY - sy); panel.style.transform = 'translateY(' + dy + 'px)'; }, { passive: true });
    panel.addEventListener('touchend', function () {
      if (!drag) return; drag = false; panel.classList.remove('dragging');
      if (dy > 90) close(); else panel.style.transform = '';
    });

    escHandler = function (e) { if (e.key === 'Escape') close(); };
    d.addEventListener('keydown', escHandler);
  }

  function close() {
    var el = d.getElementById('nm-notif-sheet'); if (!el) return;
    d.removeEventListener('keydown', escHandler);
    markAllRead(true);
    var panel = el.querySelector('.nmn-panel'); if (panel) panel.style.transform = '';
    el.classList.remove('show');
    setTimeout(function () { el.remove(); }, 520);
  }

  function markAllRead(silent) {
    var changed = false;
    list.forEach(function (n) { if (!n.read) { n.read = true; changed = true; } });
    if (changed) { save(); if (silent) { d.querySelectorAll('[data-nm-badge]').forEach(function (b) { b.classList.remove('on'); }); try { 'clearAppBadge' in navigator && navigator.clearAppBadge(); } catch (e) {} } else refresh(); }
  }

  /* ---------- pemutaran: notifikasi perangkat saat aplikasi di latar belakang ---------- */
  function nowPlaying(t) {
    if (!t || !t.title || !d.hidden || !systemEnabled()) return;
    var id = t.videoId || t.id || t.title;
    if (id === lastTrack) return; lastTrack = id;
    system({ title: t.title, body: (t.artist ? t.artist + ' \u2022 ' : '') + 'Sedang diputar', tag: 'musify-now-playing', silent: true,
      icon: typeof t.cover === 'string' && /^https?:/.test(t.cover) ? t.cover : '/assets/logo.png' });
  }

  /* ---------- boot ---------- */
  function boot() {
    var seeded = null; try { seeded = localStorage.getItem(SEED); } catch (e) {}
    if (seeded !== C.version) {
      if (supported() && permission() === 'default') {
        push({ type: 'system', title: 'Aktifkan notifikasi', body: 'Dapatkan kabar terbaru dari Musify.' });
      }
      push({ type: 'channel', title: 'Saluran WhatsApp', body: 'Ikuti untuk info terbaru.', url: C.channel, label: 'Gabung' });
      push({ type: 'info', title: 'Selamat datang di ' + (C.name || 'Musify'), body: 'Selamat mendengarkan.' });
      try { localStorage.setItem(SEED, C.version); } catch (e) {}
    }
    refresh();
  }

  load();

  // jembatan ke player: kirim info lagu tiap metadata media berganti
  d.addEventListener('DOMContentLoaded', function () {
    try {
      if (typeof w.updateMediaSessionMetadata === 'function' && !w.updateMediaSessionMetadata.__nm) {
        var orig = w.updateMediaSessionMetadata;
        w.updateMediaSessionMetadata = function (track) {
          var r = orig.apply(this, arguments);
          try { nowPlaying(track); } catch (e) {}
          return r;
        };
        w.updateMediaSessionMetadata.__nm = 1;
      }
    } catch (e) {}
  });

  // versi baru Service Worker terpasang saat aplikasi sedang terbuka
  w.addEventListener('musify:sw-update', function () {
    push({ type: 'update', title: 'Versi baru tersedia', body: 'Muat ulang untuk memperbarui.', url: 'reload', label: 'Muat ulang' }, { banner: true, system: true });
  });

  w.Notify = {
    push: push, open: open, close: close, boot: boot, refresh: refresh,
    supported: supported, permission: permission, systemEnabled: systemEnabled,
    enableSystem: enableSystem, disableSystem: disableSystem, toggleSystem: toggleSystem,
    unread: unread, markAllRead: markAllRead, nowPlaying: nowPlaying,
    bellHTML: function () {
      var n = unread();
      return '<button onclick="Notify.open()" class="nm-bell w-10 h-10 rounded-2xl bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center text-white/90 hover:text-white hover:bg-black/60 active:scale-95 transition-all shadow-lg" title="Notifikasi" aria-label="Notifikasi">' +
        '<i data-lucide="bell" class="w-5 h-5"></i><span class="nm-bell-badge' + (n ? ' on' : '') + '" data-nm-badge>' + (n > 9 ? '9+' : n) + '</span></button>';
    }
  };
})(window, document);
