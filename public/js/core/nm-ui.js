/* Musify — Aurora Layer v2 (JS). Semua bagian dibungkus try/catch: kalau gagal, app tetap jalan. */
(function () {
  'use strict';
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $(id) { return document.getElementById(id); }
  function safe(fn) { return function () { try { return fn.apply(this, arguments); } catch (e) {} }; }

  /* ---- Warna cover diredam supaya selaras dengan tema graphite (tidak neon / tidak liar) ---- */
  var probe = document.createElement('span'); probe.style.display = 'none';
  function toRgb(c) { probe.style.color = ''; probe.style.color = c; document.body.appendChild(probe); var v = getComputedStyle(probe).color; probe.remove(); var m = /(\d+)[, ]+(\d+)[, ]+(\d+)/.exec(v); return m ? [+m[1], +m[2], +m[3]] : null; }
  function tame(c) {
    var rgb = toRgb(c); if (!rgb) return null;
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0;
    if (mx !== mn) { var d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
    s = Math.min(Math.max(s * 100, 38), 62); l = Math.min(Math.max(l * 100, 62), 72);
    return 'hsl(' + Math.round(h) + ',' + Math.round(s) + '%,' + Math.round(l) + '%)';
  }
  function hookColors() {
    if (!window.MP || MP.__auroraHooked || typeof MP.applyColors !== 'function') return false;
    var orig = MP.applyColors;
    MP.applyColors = function (colors) {
      var r = orig.apply(this, arguments);
      try {
        if (colors && colors.length) {
          var a = tame(colors[0]), b = tame(colors[1] || colors[0]);
          var root = document.documentElement.style;
          if (a) root.setProperty('--nm-a1', a);
          if (b) root.setProperty('--nm-a2', b);
        }
      } catch (e) {}
      return r;
    };
    MP.__auroraHooked = true;
    return true;
  }

  /* ---- Mini player tidak pernah kosong: judul selalu terisi ---- */
  function syncMiniText() {
    var t = $('mini-title'), a = $('mini-artist');
    if (!t || typeof S === 'undefined' || !S.ct) return;
    var title = (S.ct.title || '').trim(), artist = (S.ct.artist || '').trim();
    var want = title || 'Memuat lagu…';
    if (t.textContent !== want) t.textContent = want;
    if (a && a.textContent !== artist) a.textContent = artist;
  }
  function hookUU() {
    if (typeof window.UU !== 'function' || window.UU.__nm) return false;
    var orig = window.UU;
    var wrapped = function () { var r = orig.apply(this, arguments); safe(syncMiniText)(); return r; };
    wrapped.__nm = true;
    try { window.UU = wrapped; UU = wrapped; } catch (e) {}
    return true;
  }
  setInterval(safe(syncMiniText), 1500);

  /* ---- Transisi halaman: anak-anak view naik berurutan ---- */
  function applyStagger(items) {
    if (reduced) return;
    items.forEach(function (el, idx) {
      if (!el || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
      el.classList.remove('nm-st'); void el.offsetWidth;
      el.style.setProperty('--i', Math.min(idx, 14));
      el.classList.add('nm-st');
    });
    setTimeout(function () { items.forEach(function (el) { if (el) el.classList.remove('nm-st'); }); }, 1700);
  }
  function stagger() {
    var main = $('main-area'); if (!main || reduced) return;
    var view = null;
    for (var i = 0; i < main.children.length; i++) {
      var c = main.children[i];
      if (c.id && c.id.indexOf('view-') === 0 && c.style.display !== 'none') { view = c; break; }
    }
    if (!view || view.id === 'view-home') { safe(homeSweep)(true); return; }
    var items = [];
    function add(n) { for (var k = 0; k < n.children.length && items.length < 26; k++) items.push(n.children[k]); }
    add(view);
    if (items.length <= 3) { var w = items.slice(); items = []; w.forEach(add); }
    else items.slice().forEach(function (n) { if (/\b(grid|flex-wrap)\b/.test(n.className || '') && n.children.length > 1) for (var k = 0; k < Math.min(n.children.length, 8) && items.length < 30; k++) items.push(n.children[k]); });
    applyStagger(items);
  }

  /* ---- Home: kartu muncul berurutan SEKALI per isi baru (tidak diulang saat status play berubah) ---- */
  function homeSweep(force) {
    var home = $('view-home'); if (!home || home.style.display === 'none') return;
    var groups = [['nm-greet', null], ['home-grid', 1], ['home-scroll', 1], ['home-artists', 1]];
    var all = [];
    var greet = home.querySelector('.nm-greet');
    if (greet && (force || !greet.__seen)) { greet.__seen = true; all.push(greet); }
    ['home-grid', 'home-scroll', 'home-artists'].forEach(function (id) {
      var box = $(id); if (!box || !box.children.length) return;
      var img = box.querySelector('img'); if (!img) return;                 // masih skeleton
      var sig = box.children.length + '|' + (img.getAttribute('src') || '');
      if (box.__sig === sig && !force) return;
      box.__sig = sig;
      var kids = Array.prototype.slice.call(box.children, 0, 10);
      kids.forEach(function (k, n) { k.style.setProperty('--i', n); });
      all = all.concat(kids);
    });
    if (all.length) applyStagger(all.map(function (e, n) { return e; }));
  }
  var hs = null;
  function watchHome() {
    var home = $('view-home'); if (!home || home.__nmW) return;
    home.__nmW = true;
    new MutationObserver(function () { clearTimeout(hs); hs = setTimeout(safe(function () { homeSweep(false); }), 140); }).observe(home, { childList: true, subtree: true });
  }

  function hookSwitch() {
    if (!window.App || App.__auroraHooked || typeof App.switch !== 'function') return false;
    var orig = App.switch;
    App.switch = function () { var r = orig.apply(this, arguments); requestAnimationFrame(safe(stagger)); return r; };
    App.__auroraHooked = true;
    return true;
  }

  /* ---- Navbar mengecil halus saat scroll turun ---- */
  function bindScroll() {
    var main = $('main-area'); if (!main || main.__nmScroll) return;
    main.__nmScroll = true;
    var last = 0, ticking = false;
    main.addEventListener('scroll', function () {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () {
        var y = main.scrollTop, wrap = document.querySelector('.nm-dock-wrap');
        if (wrap) { if (y > last + 6 && y > 120) wrap.classList.add('nm-away'); else if (y < last - 4 || y < 60) wrap.classList.remove('nm-away'); }
        last = y; ticking = false;
      });
    }, { passive: true });
  }

  var tries = 0;
  var t = setInterval(safe(function () {
    var a = hookColors(), b = hookSwitch(), c = hookUU();
    bindScroll(); watchHome(); syncMiniText();
    if ((a && b && c) || ++tries > 40) clearInterval(t);
  }), 150);
})();
