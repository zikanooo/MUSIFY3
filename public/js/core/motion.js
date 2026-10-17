/* ==========================================================
   Musify — Motion Layer v1 (motion.js)
   Dimuat SETELAH player.js dkk. Tidak mengubah logika aplikasi,
   hanya menghaluskan animasi & mengurangi beban render.
   ========================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. Scroll lirik: easing rAF (ganti behavior:'smooth' yang patah-patah) ---------- */
  var scrollAnims = new WeakMap();
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function cancelScrollAnim(el) {
    var rec = scrollAnims.get(el);
    if (rec) { cancelAnimationFrame(rec.id); scrollAnims.delete(el); }
  }

  window.smoothScrollLyricContainer = function (container, targetTop, duration) {
    if (!container) return;
    var max = container.scrollHeight - container.clientHeight;
    targetTop = Math.max(0, Math.min(targetTop, max));
    cancelScrollAnim(container);
    if (duration === 0 || reduced) { container.scrollTop = targetTop; return; }

    var start = container.scrollTop;
    var dist = targetTop - start;
    if (Math.abs(dist) < 1) return;

    var dur = Math.min(720, Math.max(380, Math.abs(dist) * 0.9));
    var t0 = null;
    var rec = {};
    function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      container.scrollTop = start + dist * easeOutCubic(p);
      if (p < 1) rec.id = requestAnimationFrame(step);
      else scrollAnims.delete(container);
    }
    rec.id = requestAnimationFrame(step);
    scrollAnims.set(container, rec);
  };

  // Sentuhan/scroll user langsung menghentikan animasi otomatis
  ['touchstart', 'wheel', 'mousedown'].forEach(function (evt) {
    document.addEventListener(evt, function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var c = t.closest('#lyrics-scroll-container, #full-inline-lyrics-scroll');
      if (c) cancelScrollAnim(c);
    }, { passive: true, capture: true });
  });

  /* ---------- 2. Progress bar 60fps (interval lama hanya 10fps) ---------- */
  var rafId = null;
  var cache = {};
  function el(id) {
    var e = cache[id];
    if (!e || !e.isConnected) { e = document.getElementById(id); cache[id] = e; }
    return e;
  }
  function frame() {
    rafId = requestAnimationFrame(frame);
    var a = window.AU;
    if (!a || a.paused || document.hidden) return;
    // Sinkron lirik: baca waktu audio LANGSUNG tiap frame (timeupdate hanya ~4x/detik)
    if (typeof window.ULH === 'function') { try { window.ULH(a.currentTime); } catch (e) {} }
    var d = a.duration;
    if (!d || !isFinite(d)) return;
    var p = Math.min(100, (a.currentTime / d) * 100);
    var pg = (p / 100).toFixed(4);
    var fp = el('full-progress'); if (fp) fp.style.setProperty('--pg', pg);
    var mc = el('mini-circle-progress');
    if (mc) mc.style.strokeDashoffset = Math.max(0, 131.95 * (1 - p / 100));
  }
  function startFrames() { if (rafId === null) rafId = requestAnimationFrame(frame); }
  function stopFrames() { if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; } }

  function bindAudio() {
    var a = window.AU || document.getElementById('audio-player');
    if (!a) return;
    a.addEventListener('playing', startFrames);
    a.addEventListener('play', startFrames);
    a.addEventListener('pause', stopFrames);
    a.addEventListener('ended', stopFrames);
    a.addEventListener('emptied', stopFrames);
    // Seek / ganti kecepatan / jeda: segarkan lirik saat itu juga dan tengahkan ulang baris aktif
    ['seeked', 'ratechange', 'loadeddata'].forEach(function (ev) {
      a.addEventListener(ev, function () { if (typeof window.ULH === 'function') { try { if (typeof S !== 'undefined') S.cli = -2; window.ULH(a.currentTime, true); } catch (e) {} } });
    });
    a.addEventListener('seeking', function () { if (typeof window.ULH === 'function') { try { window.ULH(a.currentTime); } catch (e) {} } });
    if (!a.paused) startFrames();
  }
  document.addEventListener('visibilitychange', function () {
    document.documentElement.classList.toggle('tab-hidden', document.hidden);
    if (!document.hidden && window.AU && !window.AU.paused) startFrames();
  });
  bindAudio();

  /* ---------- 3. Overlay / bottom-sheet / popup: animasi masuk & keluar ---------- */
  var nativeRemove = Element.prototype.remove;

  function isDynamicOverlay(n) {
    if (!n.classList) return false;
    var c = n.classList;
    return c.contains('fixed') && c.contains('inset-0') && !n.id.match(/^(album|artist)-modal$|^(full-player|lyrics-overlay|nm-loader)$/);
  }

  function animateOverlayIn(n) {
    if (n.__nmAnimated || reduced) return;
    n.__nmAnimated = true;
    var child = n.firstElementChild;
    var hasOwnAnim = child && child.getAttribute('style') && /animation\s*:/.test(child.getAttribute('style'));
    n.classList.add('nm-overlay-in');
    if (child && !hasOwnAnim) {
      child.__nmSheet = true;
      child.classList.add(/rounded-t-/.test(child.className) ? 'nm-sheet-in' : 'nm-pop-in');
    }
  }

  // remove() pada overlay dibuat memudar dulu (id dilepas agar tidak bentrok dengan elemen baru)
  Element.prototype.remove = function () {
    var self = this;
    if (self.__nmAnimated && !self.__nmClosing && self.isConnected && !reduced) {
      self.__nmClosing = true;
      self.removeAttribute('id');
      var ids = self.querySelectorAll('[id]');
      for (var i = 0; i < ids.length; i++) ids[i].removeAttribute('id');
      self.classList.remove('nm-overlay-in');
      self.classList.add('nm-overlay-out');
      var c = self.firstElementChild;
      if (c && c.__nmSheet) { c.classList.remove('nm-sheet-in', 'nm-pop-in'); c.classList.add('nm-modal-out'); }
      setTimeout(function () { nativeRemove.call(self); }, 220);
      return;
    }
    nativeRemove.call(self);
  };

  /* ---------- 4. Gambar: decode async + lazy + fade-in saat termuat ---------- */
  var SKIP_IMG = '#nm-loader, #full-player, #lyrics-overlay, #mini-player, .player-bg-blur-img';

  function prepImg(img) {
    if (img.__nmPrepped) return;
    img.__nmPrepped = true;
    img.decoding = 'async';
    if (img.closest && img.closest(SKIP_IMG)) return;
    if (!img.getAttribute('loading')) img.loading = 'lazy';
    if (img.complete && img.naturalWidth) return;       // sudah ada di cache: tampil biasa
    img.classList.add('nm-img');
    var done = function () { img.classList.add('nm-loaded'); };
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
    setTimeout(done, 4000);                              // failsafe: jangan pernah tertahan transparan
  }

  function handleAdded(n) {
    if (n.nodeType !== 1) return;
    if (isDynamicOverlay(n)) animateOverlayIn(n);
    if (n.tagName === 'IMG') prepImg(n);
    else if (n.querySelectorAll) {
      var imgs = n.querySelectorAll('img');
      for (var i = 0; i < imgs.length; i++) prepImg(imgs[i]);
    }
  }

  new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var added = muts[i].addedNodes;
      for (var j = 0; j < added.length; j++) handleAdded(added[j]);
    }
  }).observe(document.body, { childList: true, subtree: true });

  /* ---------- 5. Modal Album/Artist: animasi tutup (buka sudah lewat keyframe slideUp) ---------- */
  function wrapClose(obj, modalId) {
    if (!obj || typeof obj.close !== 'function' || obj.__nmWrapped) return;
    obj.__nmWrapped = true;
    var origClose = obj.close, origOpen = obj.open, timer = null;
    obj.close = function () {
      var m = document.getElementById(modalId);
      if (!m || m.style.display === 'none' || reduced || timer) return timer ? undefined : origClose.apply(obj, arguments);
      var args = arguments, self = this;
      m.classList.add('nm-modal-out');
      timer = setTimeout(function () {
        timer = null;
        m.classList.remove('nm-modal-out');
        origClose.apply(self, args);
      }, 230);
    };
    if (typeof origOpen === 'function') {
      obj.open = function () {
        if (timer) {            // buka lagi saat animasi tutup berjalan: batalkan tutup lama
          clearTimeout(timer); timer = null;
          var m = document.getElementById(modalId);
          if (m) m.classList.remove('nm-modal-out');
        }
        return origOpen.apply(this, arguments);
      };
    }
  }
  wrapClose(window.Album, 'album-modal');
  wrapClose(window.Artist, 'artist-modal');

  /* ---------- 7. Navbar: pil indikator geser + riak + pop ikon ---------- */
  var NavFX = window.NavFX = {
    first: true,
    update: function (animate) {
      var dock = document.getElementById('nm-dock'), pill = document.getElementById('nm-dock-pill');
      if (!dock || !pill) return;
      var act = dock.querySelector('.nm-nav-item.is-active');
      if (!act) return;
      var x = act.offsetLeft, w = act.offsetWidth;
      if (!w) return;
      var instant = this.first || !animate || reduced;
      if (instant) pill.classList.add('no-anim');
      dock.style.setProperty('--pill-x', x + 'px');
      dock.style.setProperty('--pill-w', w + 'px');
      pill.classList.add('ready');
      if (instant) { void pill.offsetWidth; pill.classList.remove('no-anim'); }
      else { pill.classList.remove('stretch'); void pill.offsetWidth; pill.classList.add('stretch'); }
      if (!this.first && animate && !reduced) {
        act.classList.remove('pop'); void act.offsetWidth; act.classList.add('pop');
      }
      this.first = false;
    }
  };
  document.addEventListener('pointerdown', function (e) {
    var b = e.target.closest && e.target.closest('.nm-nav-item');
    if (!b || reduced) return;
    var r = b.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    var size = Math.ceil(Math.max(Math.hypot(px, py), Math.hypot(r.width - px, py), Math.hypot(px, r.height - py), Math.hypot(r.width - px, r.height - py)) * 2);
    var d = document.createElement('span');
    d.className = 'nm-ripple';
    d.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' + (px - size / 2) + 'px;top:' + (py - size / 2) + 'px';
    b.appendChild(d);
    setTimeout(function () { d.remove(); }, 600);
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (x) {} }
  }, { passive: true });
  var rzT; window.addEventListener('resize', function () { clearTimeout(rzT); rzT = setTimeout(function () { NavFX.first = true; NavFX.update(false); }, 80); });
  window.addEventListener('orientationchange', function () { setTimeout(function () { NavFX.first = true; NavFX.update(false); }, 200); });
  window.addEventListener('load', function () { NavFX.first = true; NavFX.update(false); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { NavFX.first = true; NavFX.update(false); });
  NavFX.update(false);

  /* ---------- 9. State global untuk motion graphics: is-playing / is-loading / keyboard ---------- */
  (function () {
    var a = window.AU || document.getElementById('audio-player');
    var b = document.body;
    function sync() {
      if (!a) return;
      b.classList.toggle('is-playing', !a.paused && !a.ended);
    }
    if (a) {
      ['play', 'playing', 'pause', 'ended', 'emptied'].forEach(function (ev) { a.addEventListener(ev, sync); });
      a.addEventListener('waiting', function () { b.classList.add('is-loading'); });
      ['playing', 'canplay', 'pause', 'error', 'emptied'].forEach(function (ev) { a.addEventListener(ev, function () { b.classList.remove('is-loading'); }); });
      a.addEventListener('loadstart', function () { b.classList.add('is-loading'); });
      sync();
    }
    // Dock turun saat keyboard layar terbuka agar tidak menumpuk di atas input
    var isField = function (t) { return t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !/^(range|checkbox|radio|button)$/i.test(t.type || ''); };
    document.addEventListener('focusin', function (e) { if (isField(e.target)) b.classList.add('kb-open'); });
    document.addEventListener('focusout', function () { setTimeout(function () { if (!isField(document.activeElement)) b.classList.remove('kb-open'); }, 80); });
    // Riak sentuh untuk tombol gaya (tanpa mengubah posisi elemen yang sudah absolute/fixed)
    document.addEventListener('pointerdown', function (e) {
      if (reduced || !e.target.closest) return;
      var el = e.target.closest('.btn-chrome, .filter-tab');
      if (!el) return;
      var r = el.getBoundingClientRect(), size = Math.max(r.width, r.height) * 1.5, px = e.clientX - r.left, py = e.clientY - r.top;
      if (getComputedStyle(el).position === 'static') el.classList.add('nm-ripple-host'); else el.style.overflow = el.style.overflow || 'hidden';
      var d = document.createElement('span'); d.className = 'nm-ripple';
      d.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' + (px - size / 2) + 'px;top:' + (py - size / 2) + 'px';
      el.appendChild(d); setTimeout(function () { d.remove(); }, 600);
    }, { passive: true });
  })();

  /* ---------- 10. Lirik gaya Spotify: fokus per jarak, isi mengalir, titik jeda ---------- */
  (function () {
    var origULH = window.ULH;
    if (typeof origULH !== 'function') return;
    var lastIdx = -99, lastLines = null, lastP = -1;
    var GAP = /^[\s•·.•…\-–—♪♫]+$/;

    function tag(lines) {
      for (var i = 0; i < lines.length; i++) {
        var el = lines[i];
        if (el.__nmTag) continue; el.__nmTag = 1;
        el.style.setProperty('--i', i);
        var txt = (el.firstChild && el.firstChild.nodeType === 3) ? el.firstChild.nodeValue : '';
        if (txt && GAP.test(txt)) {
          var g = document.createElement('span'); g.className = 'lyric-gap'; g.setAttribute('aria-label', 'instrumental');
          g.innerHTML = '<i></i><i></i><i></i>';
          el.replaceChild(g, el.firstChild);
        }
      }
    }
    function look(list, ei) {
      for (var i = 0; i < list.length; i++) {
        var d = i - ei, ad = Math.abs(d), o, b, sc;
        if (d === 0) { o = 1; b = 0; sc = 1; }
        else if (d < 0) { o = Math.max(.2, .62 - (ad - 1) * .13); b = ad <= 1 || ad > 4 ? 0 : Math.min(1.2, (ad - 1) * .4); sc = .97; }
        else { o = d === 1 ? .6 : Math.max(.24, .52 - (ad - 2) * .07); b = ad <= 1 || ad > 4 ? 0 : Math.min(1.2, (ad - 1) * .4); sc = .97; }
        if (ad > 7) { b = 0; }
        var s = list[i].style;
        s.setProperty('--o', o.toFixed(2)); s.setProperty('--b', b.toFixed(2)); s.setProperty('--sc', sc);
      }
    }
    function lists() {
      var out = [], a = document.getElementById('lyrics-content'), b = document.getElementById('full-inline-lyrics-content');
      if (a && a._lyricLines && a._lyricLines.length) out.push(a._lyricLines);
      if (b && b._lyricLines && b._lyricLines.length) out.push(b._lyricLines);
      return out;
    }
    window.ULH = function (ct, force) {
      origULH(ct, force);
      if (typeof S === 'undefined' || !S.ld || !S.ld.lines || S.ld.type === 'plain') return;
      var ls = lists(); if (!ls.length) return;
      var ei = S.cli, lines = S.ld.lines;
      if (ei !== lastIdx || ls[0] !== lastLines || force) {
        lastIdx = ei; lastLines = ls[0]; lastP = -1;
        ls.forEach(function (l) { tag(l); look(l, ei); });
      }
      // isi baris aktif mengalir mengikuti waktu lagu
      if (ei >= 0 && lines[ei]) {
        var st = lines[ei].time, nx = lines[ei + 1] ? lines[ei + 1].time : st + 5;
        var span = Math.max(0.6, Math.min(nx - st, 9)) * 0.88;
        var p = Math.max(0, Math.min(1, (ct - st) / span));
        var pr = Math.round(p * 100);
        if (pr !== lastP) { lastP = pr; ls.forEach(function (l) { if (l[ei]) l[ei].style.setProperty('--p', pr + '%'); }); }
      }
    };
  })();

  /* ---------- 11. Warna cover -> latar lirik (--lc1..3) ---------- */
  (function () {
    function hook() {
      if (typeof MP === 'undefined' || !MP.applyColors || MP.__nmLc) return !!(typeof MP !== 'undefined' && MP.__nmLc);
      MP.__nmLc = true;
      var orig = MP.applyColors;
      MP.applyColors = function (c) {
        try {
          if (c && c.length) {
            var r = document.documentElement.style;
            r.setProperty('--lc1', c[0]); r.setProperty('--lc2', c[1] || c[0]); r.setProperty('--lc3', c[2] || c[0]);
          }
        } catch (e) {}
        return orig.apply(this, arguments);
      };
      return true;
    }
    if (!hook()) { var n = 0, iv = setInterval(function () { if (hook() || ++n > 40) clearInterval(iv); }, 250); }
  })();

  /* ---------- 12. Scroll lirik lebih licin (ease-out quart, durasi mengikuti jarak) ---------- */
  (function () {
    var prev = window.smoothScrollLyricContainer;
    window.smoothScrollLyricContainer = function (container, targetTop, duration) {
      if (!container) return;
      if (duration === 0 || reduced) { cancelScrollAnim(container); container.scrollTop = targetTop; return; }
      var max = container.scrollHeight - container.clientHeight;
      targetTop = Math.max(0, Math.min(targetTop, max));
      cancelScrollAnim(container);
      var start = container.scrollTop, dist = targetTop - start;
      if (Math.abs(dist) < 1) return;
      var dur = Math.min(950, Math.max(560, Math.abs(dist) * 1.05)), t0 = null, rec = {};
      function step(ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - p, 4);
        container.scrollTop = start + dist * e;
        if (p < 1) rec.id = requestAnimationFrame(step); else scrollAnims.delete(container);
      }
      rec.id = requestAnimationFrame(step);
      scrollAnims.set(container, rec);
    };
  })();

  /* ---------- 13. Hati melayang saat Like + parallax scroll ---------- */
  document.addEventListener('click', function (e) {
    if (reduced || !e.target.closest) return;
    var b = e.target.closest('[onclick*="toggleLike"], [onclick*="TLK"], #btn-like, #full-like, #mini-like');
    if (!b) return;
    var r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    for (var i = 0; i < 7; i++) {
      var h = document.createElement('span'); h.className = 'nm-heart'; h.textContent = '❤';
      h.style.cssText = 'left:' + x + 'px;top:' + y + 'px;color:' + (i % 2 ? '#ff4d6d' : '#ff8aa0') + ';--hx:' + ((Math.random() - .5) * 120) + 'px;--hy:' + (-60 - Math.random() * 90) + 'px;--hr:' + ((Math.random() - .5) * 80) + 'deg;animation-delay:' + (i * 35) + 'ms';
      document.body.appendChild(h); setTimeout((function (n) { return function () { n.remove(); }; })(h), 1100);
    }
  }, true);
  /* ---------- 14. Performa: renderProgress + --pg, View enter, scroll flag, mode ringan adaptif ---------- */
  (function () {
    var root = document.documentElement;
    // progress: sinkronkan --pg juga saat jeda/seek (frame() hanya jalan saat bermain)
    var origRP = window.renderProgress;
    if (typeof origRP === 'function') {
      window.renderProgress = function () {
        origRP.apply(this, arguments);
        if (typeof S !== 'undefined' && S.pd > 0) {
          var pg = Math.min(1, S.pt / S.pd).toFixed(4);
          var b = document.getElementById('full-progress');
          if (b) b.style.setProperty('--pg', pg);
        }
      };
    }
    // stagger masuk hanya saat pindah tab
    if (typeof App !== 'undefined' && App.switch && !App.__nmEnter) {
      App.__nmEnter = true;
      var os = App.switch;
      App.switch = function (t) {
        var r = os.apply(this, arguments);
        var v = document.getElementById('view-' + t);
        if (v && !reduced) { v.classList.remove('nm-enter'); void v.offsetWidth; v.classList.add('nm-enter'); setTimeout(function () { v.classList.remove('nm-enter'); }, 800); }
        return r;
      };
    }
    // flag scroll -> animasi dekoratif berhenti sebentar
    var st;
    function onScroll() { if (!root.classList.contains('is-scrolling')) root.classList.add('is-scrolling'); clearTimeout(st); st = setTimeout(function () { root.classList.remove('is-scrolling'); }, 140); }
    var ma = document.getElementById('main-area'); if (ma) ma.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });

    // mode ringan adaptif: ukur FPS 2 detik pertama; perangkat lemah otomatis dapat efek lebih hemat
    var KEY = 'nm_perf_lite';
    var saved = null; try { saved = localStorage.getItem(KEY); } catch (e) {}
    var weak = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
    if (saved === '1' || (saved === null && weak)) root.classList.add('perf-lite');
    if (saved === null && !reduced) {
      setTimeout(function () {
        var n = 0, t0 = performance.now(), worst = 0, last = t0;
        (function probe(ts) {
          n++; worst = Math.max(worst, ts - last); last = ts;
          if (ts - t0 < 2200) return requestAnimationFrame(probe);
          var fps = n / ((ts - t0) / 1000);
          var lite = fps < 48 || worst > 90;
          try { localStorage.setItem(KEY, lite ? '1' : '0'); } catch (e) {}
          root.classList.toggle('perf-lite', lite || root.classList.contains('perf-lite') && fps < 56);
        })(t0);
      }, 3500);
    }
    // hemat daya: tab disembunyikan / baterai rendah
    if (navigator.getBattery) navigator.getBattery().then(function (b) {
      function chk() { if (!b.charging && b.level < 0.15) root.classList.add('perf-lite'); }
      b.addEventListener('levelchange', chk); chk();
    }).catch(function () {});
  })();
})();
