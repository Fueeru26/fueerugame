/* =========================================================
   Fueeru Game — Peringatan Konten Dewasa (18+)
   Muncul di setiap kunjungan KECUALI pengunjung centang "Ingat saya"
   (baru disimpan ke localStorage kalau dicentang).
   ========================================================= */

(function () {
  const REMEMBER_KEY = "fueeru_age_verified";

  if (localStorage.getItem(REMEMBER_KEY) === "1") return; // sudah pernah "diingat"

  function buildGate() {
    const backdrop = document.createElement("div");
    backdrop.id = "ageGateBackdrop";
    backdrop.innerHTML = `
      <div class="age-gate-box">
        <img src="${window.ASSET_BASE || ""}webpictures/logo.webp" alt="Logo" class="age-gate-logo">
        <h2>Konfirmasi Umur</h2>
        <p>Situs ini berisi konten yang hanya ditujukan untuk pengunjung berusia <strong>18 tahun ke atas</strong>. Apakah kamu sudah berumur 18 tahun atau lebih?</p>
        <div class="age-gate-error" id="ageGateError"></div>
        <div class="age-gate-actions">
          <button type="button" id="ageGateNo">Belum</button>
          <button type="button" id="ageGateYes">Sudah</button>
        </div>
        <label class="age-gate-remember">
          <input type="checkbox" id="ageGateRemember">
          <span>Ingat saya</span>
        </label>
      </div>`;
    document.body.appendChild(backdrop);
    document.documentElement.style.overflow = "hidden";

    document.getElementById("ageGateYes").addEventListener("click", function () {
      if (document.getElementById("ageGateRemember").checked) {
        localStorage.setItem(REMEMBER_KEY, "1");
      }
      document.documentElement.style.overflow = "";
      backdrop.remove();
    });

    document.getElementById("ageGateNo").addEventListener("click", function () {
      document.getElementById("ageGateError").textContent =
        "Maaf, kamu belum cukup umur untuk melihat konten-konten di website ini.";
    });
  }

  if (document.body) buildGate();
  else document.addEventListener("DOMContentLoaded", buildGate);
})();
