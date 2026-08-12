/* =========================================================
   Fueeru Game — Virtual File System (Manajemen File)

   PENTING: karena situs ini tidak punya server/backend, "Manajemen
   File" bekerja di atas salinan virtual struktur folder (disimpan di
   localStorage), BUKAN mengubah file asli di server. Untuk file yang
   memang ada di disk, isi teks aslinya dicoba dimuat lewat fetch()
   (hanya berhasil jika situs dibuka lewat server/http, bukan dengan
   membuka file HTML secara langsung/file://). File/folder baru yang
   dibuat lewat panel ini hanya tersimpan di browser admin yang
   bersangkutan.
   ========================================================= */

const VFS_KEY = "fueeru_vfs_v1";
/* Tanggal tetap yang dipakai sebagai "Tanggal Ditambahkan" untuk semua
   file/folder bawaan (seed) situs — merepresentasikan kapan situs ini
   pertama kali dibuat. */
const SEED_DATE = "2026-08-01T00:00:00.000Z";

const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

function fileExt(name) {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx + 1).toLowerCase();
}
function isImageName(name) {
  return IMAGE_EXT.includes(fileExt(name));
}
function parentOf(path) {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}
function nameOf(path) {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}
function joinPath(parent, name) {
  return parent ? parent + "/" + name : name;
}

/* Struktur folder & file asli di server (real relative path, dipakai
   sebagai src gambar / target fetch() langsung — bukan disalin). */
const SEED_PATHS = [
  { path: "css", type: "folder" },
  { path: "js", type: "folder" },
  { path: "pictures", type: "folder" },
  { path: "postheader", type: "folder" },
  { path: "webpictures", type: "folder" },
  { path: "admin.html", type: "file" },
  { path: "category.html", type: "file" },
  { path: "donasi.html", type: "file" },
  { path: "index.html", type: "file" },
  { path: "lapor.html", type: "file" },
  { path: "post.html", type: "file" },
  { path: "search.html", type: "file" },
  { path: "tentang.html", type: "file" },
  { path: "css/admin.css", type: "file" },
  { path: "css/style.css", type: "file" },
  { path: "js/admin.js", type: "file" },
  { path: "js/data.js", type: "file" },
  { path: "js/main.js", type: "file" },
  { path: "js/vfs.js", type: "file" },
  { path: "pictures/README.txt", type: "file" },
  { path: "webpictures/header.png", type: "file" },
  { path: "webpictures/logo.png", type: "file" }
];
for (let n = 1; n <= 20; n++) {
  SEED_PATHS.push({ path: "postheader/post" + String(n).padStart(3, "0") + ".png", type: "file" });
}

function buildSeedVFS() {
  const map = {};
  SEED_PATHS.forEach((entry) => {
    map[entry.path] = {
      path: entry.path,
      name: nameOf(entry.path),
      type: entry.type,
      isImage: entry.type === "file" ? isImageName(entry.path) : false,
      original: true,
      content: null,
      dataUrl: null,
      dateAdded: SEED_DATE
    };
  });
  return map;
}

function loadVFS() {
  try {
    const raw = localStorage.getItem(VFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
    const seeded = buildSeedVFS();
    localStorage.setItem(VFS_KEY, JSON.stringify(seeded));
    return seeded;
  } catch (e) {
    return buildSeedVFS();
  }
}

function saveVFS(map) {
  try {
    localStorage.setItem(VFS_KEY, JSON.stringify(map));
    return true;
  } catch (e) {
    return false;
  }
}

/** Ambil daftar folder & file langsung di dalam folderPath ("" = root). */
function vfsList(folderPath) {
  const map = loadVFS();
  const folders = [];
  const files = [];
  Object.values(map).forEach((node) => {
    if (parentOf(node.path) === folderPath && node.path !== folderPath) {
      if (node.type === "folder") folders.push(node);
      else files.push(node);
    }
  });
  return { folders, files };
}

function vfsGetNode(path) {
  const map = loadVFS();
  return map[path] || null;
}

function vfsNodeExists(parentPath, name) {
  const map = loadVFS();
  return !!map[joinPath(parentPath, name)];
}

function vfsAddFolder(parentPath, name) {
  const map = loadVFS();
  const path = joinPath(parentPath, name);
  if (map[path]) return false;
  map[path] = {
    path,
    name,
    type: "folder",
    isImage: false,
    original: false,
    content: null,
    dataUrl: null,
    dateAdded: new Date().toISOString()
  };
  saveVFS(map);
  return true;
}

/** Tambah file baru (kosong, atau dari upload dataUrl). */
function vfsAddFile(parentPath, name, opts) {
  opts = opts || {};
  const map = loadVFS();
  const path = joinPath(parentPath, name);
  if (map[path]) return false;
  map[path] = {
    path,
    name,
    type: "file",
    isImage: isImageName(name),
    original: false,
    content: opts.dataUrl ? null : opts.content != null ? opts.content : "",
    dataUrl: opts.dataUrl || null,
    dateAdded: new Date().toISOString()
  };
  saveVFS(map);
  return true;
}

/** Hapus 1 node (dan seluruh isi di dalamnya jika folder). */
function vfsDeleteNode(path) {
  const map = loadVFS();
  const node = map[path];
  if (!node) return false;
  if (node.type === "folder") {
    const prefix = path + "/";
    Object.keys(map).forEach((p) => {
      if (p === path || p.startsWith(prefix)) delete map[p];
    });
  } else {
    delete map[path];
  }
  saveVFS(map);
  return true;
}

/** Simpan hasil edit isi file teks. */
function vfsUpdateFileContent(path, content) {
  const map = loadVFS();
  const node = map[path];
  if (!node) return false;
  node.content = content;
  saveVFS(map);
  return true;
}

/** Ganti gambar (replace) — dipakai saat "Ganti Gambar" pada file gambar. */
function vfsReplaceImage(path, dataUrl) {
  const map = loadVFS();
  const node = map[path];
  if (!node) return false;
  node.dataUrl = dataUrl;
  node.original = false;
  saveVFS(map);
  return true;
}

/** Sumber tampilan gambar: dataUrl (jika ada override) atau path asli di disk. */
function vfsImageSrc(node) {
  return node.dataUrl || (node.original ? node.path : "");
}

/** Ganti nama file/folder. Untuk folder, seluruh path anak ikut disesuaikan. */
function vfsRenameNode(path, newName) {
  const map = loadVFS();
  const node = map[path];
  if (!node) return false;
  const parent = parentOf(path);
  const newPath = joinPath(parent, newName);
  if (map[newPath]) return false;

  if (node.type === "folder") {
    const prefix = path + "/";
    const affected = Object.keys(map).filter((p) => p === path || p.startsWith(prefix));
    affected.forEach((oldP) => {
      const rest = oldP.slice(path.length); // "" atau "/anak/..."
      const newP = newPath + rest;
      const n = map[oldP];
      n.path = newP;
      if (oldP === path) n.name = newName;
      map[newP] = n;
      delete map[oldP];
    });
  } else {
    node.path = newPath;
    node.name = newName;
    map[newPath] = node;
    delete map[path];
  }
  saveVFS(map);
  return true;
}

/** Perkiraan ukuran 1 file dalam byte. null jika tidak diketahui
 * (file asli di server yang belum pernah dibuka/diubah lewat panel ini). */
function vfsFileSizeBytes(node) {
  if (node.dataUrl) {
    const commaIdx = node.dataUrl.indexOf(",");
    const b64 = commaIdx === -1 ? node.dataUrl : node.dataUrl.slice(commaIdx + 1);
    return Math.round((b64.length * 3) / 4);
  }
  if (node.content != null) {
    try {
      return new Blob([node.content]).size;
    } catch (e) {
      return node.content.length;
    }
  }
  return null;
}

/** Format byte jadi teks mudah dibaca (KB/MB). */
function formatBytes(bytes) {
  if (bytes == null) return "Tidak diketahui";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

/** Statistik 1 folder: jumlah file & folder langsung di dalamnya, serta
 * total ukuran seluruh isi (rekursif, sebatas yang ukurannya diketahui). */
function vfsFolderStats(path) {
  const map = loadVFS();
  const prefix = path === "" ? "" : path + "/";
  let fileCount = 0;
  let folderCount = 0;
  let totalSize = 0;
  let hasUnknownSize = false;

  Object.values(map).forEach((node) => {
    if (node.path === path) return;
    const isDirectChild = parentOf(node.path) === path;
    const isDescendant = path === "" ? true : node.path.startsWith(prefix);
    if (isDirectChild) {
      if (node.type === "folder") folderCount++;
      else fileCount++;
    }
    if (isDescendant && node.type === "file") {
      const size = vfsFileSizeBytes(node);
      if (size == null) hasUnknownSize = true;
      else totalSize += size;
    }
  });

  return { fileCount, folderCount, totalSize, hasUnknownSize };
}

/** Best-effort: sebelum me-rename file gambar ASLI (yang belum pernah
 * disentuh, sehingga belum punya dataUrl), coba muat byte aslinya lewat
 * fetch() dan simpan sebagai dataUrl — supaya thumbnail-nya tidak rusak
 * setelah namanya berubah (path aslinya di disk jadi tidak cocok lagi).
 * Hanya berhasil jika situs dibuka lewat server/http; jika gagal (mis.
 * dibuka via file://), rename tetap dilanjutkan apa adanya. */
function vfsTryPreserveImageBytes(path) {
  return new Promise((resolve) => {
    const map = loadVFS();
    const node = map[path];
    if (!node || node.type !== "file" || !node.isImage || node.dataUrl || !node.original) {
      resolve();
      return;
    }
    fetch(node.path)
      .then((res) => {
        if (!res.ok) throw new Error("fetch gagal");
        return res.blob();
      })
      .then(
        (blob) =>
          new Promise((res) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result);
            reader.onerror = () => res(null);
            reader.readAsDataURL(blob);
          })
      )
      .then((dataUrl) => {
        if (dataUrl) {
          const freshMap = loadVFS();
          if (freshMap[path]) {
            freshMap[path].dataUrl = dataUrl;
            saveVFS(freshMap);
          }
        }
        resolve();
      })
      .catch(() => resolve());
  });
}
