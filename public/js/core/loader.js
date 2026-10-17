/* Musify — Loader: layar pembuka (cincin progres + persentase + tirai) dan bar loading global untuk permintaan API. */
(function (w, d) {
  'use strict';

  var el = d.getElementById('nm-loader');
  var fill = d.getElementById('nmL-fill');   // <circle> progres
  var pct = d.getElementById('nmL-pct');
  var CIRC = 376.99;                          // keliling cincin (r=60)
  var bar = d.getElementById('nm-topbar');
  var barFill = bar && bar.firstElementChild;

  var MIN_SHOW = 1500;              // cukup agar animasi masuk (logo, wordmark) tampil utuh
  var FAILSAFE = 4500;              // tidak pernah menahan pengguna lebih lama dari ini
  var t0 = Date.now(), p = 0, target = 0.12, finished = false, timer = null;

  var lastTxt = -1;
  function paint() {
    if (fill) fill.style.strokeDashoffset = (CIRC * (1 - p)).toFixed(2);
    var n = Math.round(p * 100);
    if (pct && n !== lastTxt) { lastTxt = n; pct.textContent = n + '%'; }
  }

  function tick() {
    target = Math.min(0.9, target + 0.012);         // merayap pelan sampai 90% selama menunggu
    p += (target - p) * 0.22;
    paint();
  }
  function bump(to) { if (to > target) target = to; }

  function done() {
    if (finished || !el) return;
    var wait = MIN_SHOW - (Date.now() - t0);
    if (wait > 0) { setTimeout(done, wait); return; }
    finished = true;
    clearInterval(timer);
    p = 1; paint();
    setTimeout(function () {
      el.classList.add('is-leaving');
      setTimeout(function () { d.body.classList.add('nm-enter'); d.dispatchEvent(new Event('musify:ready')); }, 380);
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1000);
    }, 340);                                         // biarkan cincin penuh (100%) terlihat sesaat
  }

  if (el) {
    paint();
    timer = setInterval(tick, 100);
    if (d.readyState !== 'loading') bump(0.4); else d.addEventListener('DOMContentLoaded', function () { bump(0.4); });
    if (d.readyState === 'complete') bump(0.7); else w.addEventListener('load', function () { bump(0.7); });
    setTimeout(done, FAILSAFE);
  }

  /* ---------- Bar loading global: tampil bila permintaan API > 180 ms ---------- */
  var inflight = 0, startT = null, trickle = null, bp = 0, on = false;

  function setBar(v) { if (barFill) barFill.style.transform = 'scaleX(' + v + ')'; }
  function barStart() {
    if (on || !bar) return; on = true; bp = 0.1;
    barFill.style.transition = 'none'; setBar(0); void barFill.offsetWidth; barFill.style.transition = '';
    bar.classList.add('on'); setBar(bp);
    trickle = setInterval(function () { bp += (0.92 - bp) * 0.09; setBar(bp.toFixed(3)); }, 260);
  }
  function barEnd() {
    if (!on) return; on = false; clearInterval(trickle);
    setBar(1);
    setTimeout(function () { if (!on) bar.classList.remove('on'); }, 260);
  }
  function dec() {
    inflight = Math.max(0, inflight - 1);
    if (inflight === 0) { clearTimeout(startT); startT = null; barEnd(); }
  }

  var _fetch = w.fetch;
  if (_fetch && bar) {
    w.fetch = function (input) {
      var url = '';
      try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch (e) {}
      // audio/gambar/saran ketik punya indikator sendiri; jangan ikut dihitung
      var track = finished && /\/api\//.test(url) && !/proxy-audio|proxy-image|suggest|ytplay|transcribe/.test(url);
      if (!track) return _fetch.apply(this, arguments);
      if (++inflight === 1) startT = setTimeout(function () { if (inflight > 0) barStart(); }, 180);
      return _fetch.apply(this, arguments).then(function (r) { dec(); return r; }, function (e) { dec(); throw e; });
    };
  }

  w.Loader = { done: done, progress: bump, barStart: barStart, barEnd: barEnd };
})(window, document);
