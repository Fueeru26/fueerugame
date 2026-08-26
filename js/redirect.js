/* Halaman publik /redirect<kode> — baca kode dari path URL, ambil data
 * link + bagian tampilan dari server, lalu render + pasang countdown.
 * Widget countdown & builder HTML-nya ada di js/redirect-widget.js
 * (dipakai bareng dengan Preview Halaman Redirect di Admin Panel). */
(async function () {
  const wrap = document.getElementById("redirectSectionsWrap");
  if (!wrap) return;

  const match = window.location.pathname.match(/\/redirect([A-Za-z0-9]+)/);
  const code = match ? match[1] : null;

  if (!code) {
    wrap.innerHTML = '<p class="redirect-not-found">Kode redirect tidak ditemukan di URL.</p>';
    return;
  }

  let data;
  try {
    data = await resolveRedirectByCode(code);
  } catch (e) {
    wrap.innerHTML = '<p class="redirect-not-found">Link redirect tidak ditemukan atau sudah tidak berlaku.</p>';
    return;
  }

  wrap.innerHTML = buildRedirectSectionsHtml(data.sections);
  reviveRedirectScripts(wrap);
  initRedirectCountdownWidget(wrap, function () {
    window.location.href = data.link.cloudLink;
  });
})();
