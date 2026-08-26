/* ---------------------------------------------------------------------
 * Widget bersama untuk Halaman Redirect — dipakai OLEH DUA TEMPAT:
 *   1. Halaman publik redirect.html (lewat js/redirect.js)
 *   2. Preview "Preview Halaman Redirect" di Admin Panel (js/admin.js)
 * Supaya tampilan & logika countdown-nya selalu identik di keduanya.
 * ------------------------------------------------------------------- */

const REDIRECT_COUNTDOWN_SECONDS = 5;

/** Bangun HTML semua bagian (kode HTML bebas + 1 widget countdown terkunci)
 * sebagai satu string, siap dimasukkan ke suatu container via innerHTML. */
function buildRedirectSectionsHtml(sections) {
  return sections
    .map((s) => {
      if (s.locked) {
        return `
          <div class="redirect-bagian-box redirect-countdown-box" data-countdown-box>
            <p class="redirect-countdown-hint" data-countdown-hint>Klik untuk Lanjutkan dan memulai countdown</p>
            <div class="redirect-countdown-circle" data-countdown-circle>
              <span class="rcc-number" data-countdown-number>${REDIRECT_COUNTDOWN_SECONDS}</span>
              <span class="rcc-label">detik</span>
            </div>
            <button type="button" class="redirect-continue-btn btn-primary" data-countdown-btn>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 5 14 12 7 19"/><polyline points="13 5 20 12 13 19"/></svg>
              <span data-countdown-btn-label>Klik untuk lanjutkan</span>
            </button>
          </div>`;
      }
      return `<div class="redirect-bagian-box" data-bagian-id="${s.id}">${s.content || ""}</div>`;
    })
    .join("");
}

/** <script> yang disuntik lewat innerHTML tidak otomatis jalan (batasan
 * browser) — dibuat ulang manual supaya kode iklan yang pakai <script>
 * tetap berfungsi normal. */
function reviveRedirectScripts(container) {
  container.querySelectorAll("[data-bagian-id] script").forEach((oldScript) => {
    const newScript = document.createElement("script");
    Array.from(oldScript.attributes).forEach((attr) => newScript.setAttribute(attr.name, attr.value));
    newScript.text = oldScript.textContent;
    oldScript.parentNode.replaceChild(newScript, oldScript);
  });
}

/** Pasang logika hitung mundur & tombol lanjut pada container yang sudah
 * berisi HTML dari buildRedirectSectionsHtml(). onComplete() dipanggil
 * saat pengunjung menekan tombol SETELAH countdown selesai. */
function initRedirectCountdownWidget(container, onComplete) {
  const hintEl = container.querySelector("[data-countdown-hint]");
  const numberEl = container.querySelector("[data-countdown-number]");
  const btnEl = container.querySelector("[data-countdown-btn]");
  const btnLabelEl = container.querySelector("[data-countdown-btn-label]");
  if (!btnEl) return;

  let started = false;
  let finished = false;
  let remaining = REDIRECT_COUNTDOWN_SECONDS;

  btnEl.addEventListener("click", function () {
    if (finished) {
      if (onComplete) onComplete();
      return;
    }
    if (started) return;
    started = true;
    const timer = setInterval(function () {
      remaining--;
      if (remaining <= 0) {
        clearInterval(timer);
        numberEl.textContent = "0";
        finished = true;
        hintEl.textContent = "Countdown selesai, klik Lanjutkan Sekarang untuk menuju link";
        btnLabelEl.textContent = "Lanjutkan Sekarang";
      } else {
        numberEl.textContent = String(remaining);
      }
    }, 1000);
  });
}
