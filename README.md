# Tab Sleeper — Hemat Memory

Ekstensi Chrome yang otomatis "menidurkan" (discard) tab yang tidak aktif setelah durasi tertentu, supaya memory dan CPU tidak terpakai oleh tab yang tidak sedang Anda lihat. Tab yang tertidur tetap muncul di tab bar dan akan otomatis dimuat ulang begitu Anda klik kembali.

## Cara instal (mode developer / unpacked)

1. Buka Chrome, ketik di address bar: `chrome://extensions`
2. Aktifkan toggle **Developer mode** (pojok kanan atas)
3. Klik **Load unpacked**
4. Pilih folder `tab-sleeper` ini (folder yang berisi `manifest.json`)
5. Ekstensi langsung aktif. Klik ikon bulan di toolbar untuk membuka panel cepat, atau klik kanan ikon → **Options** untuk pengaturan lengkap.

## Fitur

- **Waktu tidur bisa diatur bebas** — mulai dari 5 detik sampai berjam-jam (input angka + pilihan satuan detik/menit), termasuk beberapa preset cepat (5 detik, 30 detik, 5 menit, 15 menit, 30 menit).
- **Pengecualian situs** — tambahkan domain yang tidak ingin pernah ditidurkan, misalnya `youtube.com` atau gunakan wildcard `*.google.com` untuk mengecualikan semua subdomain.
- **Kecualikan cepat dari popup** — tombol "Kecualikan situs ini" langsung menambahkan situs yang sedang dibuka ke daftar pengecualian.
- **Perlindungan otomatis** — tab yang di-pin dan tab yang sedang memutar audio (musik/video) tidak akan ditidurkan secara default (bisa dimatikan di pengaturan).
- **Tab aktif tidak pernah ditidurkan** — hanya tab di background yang akan tertidur.
- **Toggle on/off** — matikan sementara tanpa kehilangan pengaturan.

## Catatan teknis tentang keakuratan waktu

Chrome membatasi seberapa lama service worker ekstensi (Manifest V3) boleh "bangun" di background. Untuk durasi tidur normal (≥ 1 menit) timing akan sangat akurat karena dijadwalkan langsung. Untuk durasi sangat singkat (misalnya 5 detik) saat browser sedang benar-benar idle, ada kemungkinan tab tertidur meleset beberapa detik dari waktu yang diset, karena ekstensi punya mekanisme cadangan (alarm) yang mengecek ulang setiap 30 detik untuk menangkap tab yang seharusnya sudah tertidur. Ini adalah keterbatasan platform Chrome, bukan bug — tab akan tetap tertidur, hanya waktunya bisa sedikit lebih lambat dari yang diset saat kondisi tersebut terjadi.

## Kalau tab masih tidak tertidur

1. **Tes manual dulu**: klik ikon toolbar → tombol **"Tidurkan semua tab tidak aktif sekarang"**. Kalau ini berhasil, extension bekerja dan tinggal soal timing/penjadwalan. Kalau ini juga tidak berhasil, cek poin di bawah.
2. **Cek apakah tab kena aturan pengecualian**: tab yang di-pin, memutar audio, atau domainnya ada di daftar pengecualian tidak akan pernah ditidurkan — ini sengaja.
3. **Lihat log service worker**: buka `chrome://extensions`, cari Tab Sleeper, klik link **"service worker"** (di bagian Inspect views) untuk membuka DevTools khusus background script. Error apa pun akan muncul di sana.
4. **Setelah reload/update extension**, kembali ke `chrome://extensions` dan klik ikon reload pada card extension — service worker lama tidak otomatis memuat kode baru.
5. **Cek `chrome://discards`** untuk melihat status resmi Chrome tiap tab (kolom status akan menunjukkan "Discarded" kalau memang sudah tertidur).

## Struktur file

```
tab-sleeper/
├── manifest.json     # konfigurasi ekstensi (Manifest V3)
├── background.js     # service worker: logika menidurkan tab
├── popup.html/js      # panel cepat saat ikon toolbar diklik
├── options.html/js    # halaman pengaturan lengkap
└── icons/             # ikon ekstensi
```
