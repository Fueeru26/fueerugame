# Folder: postheader

Folder ini berfungsi sebagai **folder backup gambar-gambar header postingan**
yang akan diupload lewat Admin Panel (gambar header/thumbnail untuk tiap
postingan game).

- Folder ini sengaja dikosongkan (tidak berisi gambar bawaan).
- Gambar header postingan yang baru diupload dari Admin Panel disimpan
  sebagai data (base64) di localStorage browser admin, **bukan** disalin
  otomatis ke folder ini — jadi folder ini murni tempat menyimpan salinan
  cadangan (backup) gambar-gambar asli sebelum/​sesudah diupload.
- Selama folder ini kosong, semua postingan akan memakai gambar
  `webpictures/postplaceholder.webp` sebagai gambar placeholder header.
