/* =========================================================
   Fueeru Game — Penampil File (read-only)

   Daftar folder & file diambil langsung dari repo GitHub (commit
   terbaru di branch main) lewat endpoint /api/files/tree, jadi selalu
   sesuai dengan deploy yang sedang live begitu tombol Refresh ditekan.

   Isi file (untuk preview teks) & gambar diambil langsung dari situs
   yang sudah live (same-origin fetch/ <img src>), BUKAN lewat GitHub —
   karena file itu memang sudah tersaji apa adanya oleh Worker.

   Read-only: tidak ada tambah/ganti nama/hapus dari sini.
   ========================================================= */

const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "svg"];
const TEXT_EXT = ["html", "css", "js", "json", "md", "txt", "xml", "csv", "yml", "yaml"];

function fileExt(name) {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx + 1).toLowerCase();
}
function isImageName(name) {
  return IMAGE_EXT.includes(fileExt(name));
}
function isTextName(name) {
  return TEXT_EXT.includes(fileExt(name));
}
function parentOf(path) {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}
function nameOf(path) {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

let vfsMap = {};
let vfsLoaded = false;

function vfsBuildFromItems(items) {
  const map = {};
  items.forEach((it) => {
    map[it.path] = {
      path: it.path,
      name: nameOf(it.path),
      type: it.type,
      isImage: it.type === "file" ? isImageName(it.path) : false,
      isText: it.type === "file" ? isTextName(it.path) : false,
      size: it.type === "file" ? it.size : null
    };
  });
  // Jaga-jaga: pastikan semua folder induk tercatat, meski GitHub tidak
  // mengembalikan entry "tree" untuk sebagiannya.
  Object.keys(map).forEach((p) => {
    let parent = parentOf(p);
    while (parent && !map[parent]) {
      map[parent] = { path: parent, name: nameOf(parent), type: "folder", isImage: false, isText: false, size: null };
      parent = parentOf(parent);
    }
  });
  return map;
}

/** Ambil ulang daftar folder & file terbaru dari GitHub. Return jumlah entri. */
async function vfsRefreshFromServer() {
  const data = await apiCall("GET", "/api/files/tree", undefined, true);
  vfsMap = vfsBuildFromItems(data.items || []);
  vfsLoaded = true;
  return Object.keys(vfsMap).length;
}

/** Ambil daftar folder & file langsung di dalam folderPath ("" = root). */
function vfsList(folderPath) {
  const folders = [];
  const files = [];
  Object.values(vfsMap).forEach((node) => {
    if (parentOf(node.path) === folderPath && node.path !== folderPath) {
      if (node.type === "folder") folders.push(node);
      else files.push(node);
    }
  });
  return { folders, files };
}

function vfsGetNode(path) {
  return vfsMap[path] || null;
}

/** Path relatif ke root situs (dipakai untuk src gambar / fetch isi teks /
 * link download) — situs & Admin Panel berada di root yang sama. */
function vfsRealPath(path) {
  return "/" + path;
}

/** Sumber tampilan gambar: langsung dari file yang sudah live. */
function vfsImageSrc(node) {
  return vfsRealPath(node.path);
}

/** Format byte jadi teks mudah dibaca (KB/MB). */
function formatBytes(bytes) {
  if (bytes == null) return "Tidak diketahui";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

/** Statistik 1 folder: jumlah file & folder langsung di dalamnya, serta
 * total ukuran seluruh isi (rekursif). */
function vfsFolderStats(path) {
  const prefix = path === "" ? "" : path + "/";
  let fileCount = 0;
  let folderCount = 0;
  let totalSize = 0;
  let hasUnknownSize = false;

  Object.values(vfsMap).forEach((node) => {
    if (node.path === path) return;
    const isDirectChild = parentOf(node.path) === path;
    const isDescendant = path === "" ? true : node.path.startsWith(prefix);
    if (isDirectChild) {
      if (node.type === "folder") folderCount++;
      else fileCount++;
    }
    if (isDescendant && node.type === "file") {
      if (node.size == null) hasUnknownSize = true;
      else totalSize += node.size;
    }
  });

  return { fileCount, folderCount, totalSize, hasUnknownSize };
}
