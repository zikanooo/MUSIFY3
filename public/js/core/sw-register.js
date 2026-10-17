/* Musify — pendaftaran Service Worker + deteksi pembaruan. */
(function () {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').then(function (reg) {
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          // versi baru terpasang sementara halaman masih memakai berkas lama
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent('musify:sw-update'));
          }
        });
      });
    }).catch(function (err) { console.error('SW gagal didaftarkan:', err); });
  });
})();
