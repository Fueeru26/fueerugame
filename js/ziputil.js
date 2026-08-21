/* =========================================================
   Pembaca file .zip murni di browser (tanpa library luar).
   Dipakai fitur "Deploy Website" di Admin Panel: baca isi zip
   yang diupload user, pecah jadi daftar { path, bytes }.
   ========================================================= */

/** Baca ArrayBuffer file .zip -> array of { path, bytes: Uint8Array } */
async function readZipEntries(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

  // Cari End Of Central Directory record (signature 0x06054b50), dicari dari belakang.
  let eocdOffset = -1;
  const maxBack = Math.min(bytes.length, 65557); // ukuran komentar zip maks 65535 + 22 header
  for (let i = bytes.length - 22; i >= bytes.length - maxBack && i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("File bukan .zip yang valid (EOCD tidak ditemukan)");

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);

  const entries = [];
  for (let i = 0; i < totalEntries; i++) {
    const sig = view.getUint32(cdOffset, true);
    if (sig !== 0x02014b50) throw new Error("Central directory rusak/tidak dikenali");

    const compressionMethod = view.getUint16(cdOffset + 10, true);
    const compressedSize = view.getUint32(cdOffset + 20, true);
    const uncompressedSize = view.getUint32(cdOffset + 24, true);
    const fileNameLength = view.getUint16(cdOffset + 28, true);
    const extraLength = view.getUint16(cdOffset + 30, true);
    const commentLength = view.getUint16(cdOffset + 32, true);
    const localHeaderOffset = view.getUint32(cdOffset + 42, true);

    const nameBytes = bytes.subarray(cdOffset + 46, cdOffset + 46 + fileNameLength);
    const path = new TextDecoder("utf-8").decode(nameBytes);

    entries.push({
      path,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      isDir: path.endsWith("/")
    });

    cdOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  const result = [];
  for (const entry of entries) {
    if (entry.isDir || entry.uncompressedSize === 0) continue; // lewati folder & file kosong

    const lh = entry.localHeaderOffset;
    if (view.getUint32(lh, true) !== 0x04034b50) throw new Error("Local file header rusak: " + entry.path);
    const lhNameLen = view.getUint16(lh + 26, true);
    const lhExtraLen = view.getUint16(lh + 28, true);
    const dataStart = lh + 30 + lhNameLen + lhExtraLen;
    const compressedBytes = bytes.subarray(dataStart, dataStart + entry.compressedSize);

    let outBytes;
    if (entry.compressionMethod === 0) {
      outBytes = compressedBytes; // stored (tanpa kompresi)
    } else if (entry.compressionMethod === 8) {
      // deflate mentah (tanpa header zlib/gzip)
      const ds = new DecompressionStream("deflate-raw");
      const stream = new Blob([compressedBytes]).stream().pipeThrough(ds);
      const buf = await new Response(stream).arrayBuffer();
      outBytes = new Uint8Array(buf);
    } else {
      throw new Error("Metode kompresi tidak didukung (" + entry.compressionMethod + ") pada " + entry.path);
    }

    result.push({ path: entry.path, bytes: outBytes });
  }
  return result;
}

/** Konversi Uint8Array -> string base64 (aman untuk file besar, per-chunk). */
function bytesToBase64(bytes) {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
