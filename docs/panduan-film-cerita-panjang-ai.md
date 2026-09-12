# Panduan Membuat Film Cerita Durasi Panjang dengan AI

Studi kasus: **"NABI SULAIMAN: Awal Mula Kerajaan Termegah yang Pernah Ada | Part 1"**
Channel: **Noor Occulta** (https://www.youtube.com/@NoorOcculta)
Video: https://www.youtube.com/watch?v=Fjebv-I1XyM

Dokumen ini membedah video tersebut **dari file videonya langsung** (durasi, jumlah shot, struktur menit demi menit, transkrip narasi, gaya visual, caption, intro dan outro), lalu menurunkannya menjadi tutorial produksi yang bisa diikuti persis, lengkap dengan tools, prompt, link kursus, estimasi waktu, dan biaya.

Sumber data:
- File video 144p (27 menit 15 detik) dianalisis dengan ffmpeg (deteksi cut, ekstraksi frame tiap 20 detik dan tiap 2,5 detik di intro/outro) dan Whisper (transkrip narasi bahasa Indonesia).
- Deskripsi resmi, tanggal rilis, dan jumlah view dari RSS resmi channel.
- Harga tools dari halaman harga publik per September 2026.

Apa pun yang tetap berupa perkiraan ditandai **ESTIMASI**.

---

## 1. Hasil bedah video (data terukur)

### 1.1 Angka utama

| Ukuran | Nilai |
|---|---|
| Durasi | 27 menit 15 detik |
| Resolusi asli | 16:9 (file yang dianalisis 144p, aslinya minimal 1080p) |
| Frame rate | 30 fps |
| Jumlah shot (klip visual) | sekitar 170 sampai 270, tergantung ambang deteksi; angka kerja: **sekitar 200 klip** |
| Panjang shot | median 4 sampai 8 detik, mayoritas 3 sampai 9 detik, beberapa shot lambat 15 sampai 30 detik |
| Transisi | cross dissolve lembut di hampir semua pergantian klip, bukan hard cut |
| Kata narasi | 3.164 kata (538 segmen kalimat) |
| Kecepatan narasi | 118 kata per menit, lambat dan dramatis |
| Narasi menutupi | 1.615 dari 1.635 detik. Hampir tidak ada jeda musik saja, narasi mengalir terus |
| Loudness | rata-rata sekitar -14 dB konstan sepanjang video, ciri khas output CapCut dengan musik dan VO dinormalisasi |
| Software editing | **CapCut** (terlihat di end card 27:14: logo CapCut, "Noor Occulta", teks "BERSAMBUNG...") |
| Rilis | 5 September 2026, sekitar 122.000 view dalam 7 hari |

### 1.2 Struktur menit demi menit

| Waktu | Bagian | Yang terjadi di layar dan narasi |
|---|---|---|
| 0:00 sampai 0:29 | Cold open (hook) | Montase cepat 8 sampai 10 shot paling epik: pasukan, raja di kuda, singgasana, singa di permadani terbang, jin, raja wafat. Narasi: "ia bisa menghentikan ribuan pasukan hanya untuk seekor semut... wafat dalam sunyi, dan satu-satunya saksi terakhirnya hanyalah seekor rayap." Menjual ending seri di detik pertama. |
| 0:29 sampai 0:40 | Janji video | "Pernahkah kalian tahu bagaimana ia memperoleh semua itu? Di sinilah kita akan menyusuri skrip demi skrip jejak langkahnya." |
| 0:40 sampai 0:46 | Title card | Logo "NOOR OCCULTA" muncul dari ledakan cahaya, siluet tokoh berjalan ke portal. Narasi: "Pastikan sudah like dan subscribe Noor Occulta. Mari kita mulai." |
| 0:46 sampai 0:54 | Salam | "Assalamualaikum warahmatullahi wabarakatuh." |
| 0:54 sampai 3:03 | Latar dan nasab | Tanah purba, Daud dan Jalut, kelahiran Sulaiman, ibunya, makna nama Salim, masa kecil di istana Yerusalem. Tombol SUBSCRIBE merah muncul sekitar 1:25 sampai 1:35. |
| 3:03 sampai 7:16 | Babak 1: Pengadilan ladang dan domba | Adegan dialog penuh (petani, peternak, Daud, Sulaiman kecil 11 sampai 12 tahun). Ditutup kutipan Al-Anbiya 78 sampai 79 dengan cutaway gambar Al-Qur'an terbuka di 7:00. |
| 7:16 sampai 10:10 | Babak 2: Masa remaja dan peralihan takhta | Perpustakaan, majelis hukum, Daud wafat, An-Naml 16 dan Sad 30, hadis "para nabi tidak mewariskan dinar dan dirham" dengan cutaway manuskrip di 9:47. Ada shot VFX portal api dan biru (9:08 dan 9:28, klip yang sama dipakai dua kali). |
| 10:10 sampai 14:55 | Babak 3: Kuda-kuda pilihan (Surah Sad) | Adegan paling sinematik: kuda berlari saat golden hour, close-up tangan menyentuh kaki kuda, matahari terbenam. Refleksi: "kuda tetaplah kuda, emas tetaplah emas, takhta tetaplah takhta." |
| 14:55 sampai 19:13 | Babak 4: Ujian jasad di singgasana | Palet berubah ke malam biru gelap. Istri-istri, bayi yang lahir tidak sempurna, jasad di singgasana, sujud dan doa "anugerahkanlah kepadaku kerajaan yang tidak dimiliki siapa pun setelahku." Menolak riwayat cincin dicuri sebagai "dongeng malam". |
| 19:13 sampai 21:44 | Babak 5: Angin ditundukkan | Fajar, teras istana, jubah berkibar, kota Yerusalem dari atas. Ada jeda narasi 9 detik di 19:45 dan 20:40 untuk momen visual. |
| 21:44 sampai 25:11 | Babak 6: Jin, penyelam, tembaga cair | Jin pembangun, jin penyelam bawah laut, jin dirantai, tembaga cair mengalir. |
| 25:11 sampai 26:42 | Hikmah | "Bekerjalah wahai keluarga Daud sebagai bentuk rasa syukur." Kabar kerajaan menyebar lewat kafilah dan pelabuhan. |
| 26:42 sampai 27:12 | Cliffhanger | "Kemampuan yang kelak membuatnya mendengar suara dari makhluk yang begitu kecil... semuanya akan bermula ketika pasukan terbesar Raja Sulaiman meninggalkan Yerusalem." Pasukan berkuda dengan jin bersayap. |
| 27:12 sampai 27:15 | End card | Layar hitam, logo CapCut, "BERSAMBUNG..." |

Pola yang bisa ditiru: **6 babak isi, masing-masing 2,5 sampai 4,5 menit, setiap babak ditutup refleksi hikmah 30 sampai 60 detik sebelum masuk babak berikutnya.**

### 1.3 Gaya visual yang terlihat

- Fotorealis sinematik ala film epik, bukan kartun. Lensa lebar untuk establishing shot, close-up untuk emosi.
- Palet warna per babak: emas hangat (golden hour) untuk istana dan padang kuda, biru gelap kebiruan untuk babak ujian malam, oranye membara untuk tembaga cair. Ini cara mudah membedakan babak tanpa teks.
- Setiap klip bergerak pelan: push-in kamera, jubah berkibar, debu melayang, awan bergerak. Ini ciri image-to-video, bukan gambar diam dengan zoom.
- Adegan ramai (pasar, pengadilan, kafilah, pelabuhan) sering muncul untuk menutupi narasi panjang tanpa tokoh utama.
- Cutaway simbolik saat kutipan dalil: Al-Qur'an terbuka di atas karpet, manuskrip gulungan, tangan menulis. Ini menghindari menampilkan teks ayat mentah di layar.
- Klip VFX abstrak (portal api dan es, energi biru) dipakai sebagai transisi antara "dua amanah", dan klip yang sama dipakai ulang. Menghemat generate.
- **Wajah Nabi Sulaiman dewasa diblur** di sebagian besar shot (contoh 14:00, 16:20, 17:00, 20:20, 25:20). Sulaiman kecil, tokoh pendukung, dan sebagian shot Daud tidak diblur. Ada inkonsistensi (beberapa shot dewasa terlihat jelas dari jauh), tapi kebijakan umumnya: blur wajah nabi saat close-up.
- Jin digambarkan sebagai sosok gelap bertanduk atau bersayap, penyelam bawah laut, dan raksasa di kabut.

### 1.4 Caption, watermark, dan branding

- Caption otomatis gaya CapCut: huruf kapital putih tebal, satu kata kunci per baris diberi kotak highlight biru, posisi bawah tengah, 3 sampai 6 kata per baris. Ini template "Auto captions" dengan efek highlight kata di CapCut.
- Watermark logo channel bulat di kanan bawah, teks "NOOR OCCULTA" dengan ikon YouTube merah di kiri atas sepanjang video.
- Stiker tombol SUBSCRIBE merah beranimasi muncul di kiri bawah sekitar menit 1:25.
- Tidak ada lower third, tidak ada judul bab di layar. Semua struktur dibawa oleh narasi.

### 1.5 Narasi dan naskah

- Bahasa Indonesia baku sastrawi: "menyesakkan keheningan yang dingin", "tamparan yang sunyi". Kalimat pendek, banyak koma, ritme seperti puisi.
- Rumus per babak: deskripsi suasana (visual) > peristiwa > dialog singkat > dalil (ayat atau hadis, disebut surah dan nomor ayat) > refleksi hikmah > kalimat jembatan ke babak berikutnya.
- Dalil yang dibaca langsung di narasi: Al-Anbiya 78 sampai 79, An-Naml 16, Sad 30, hadis Bukhari Muslim tentang warisan nabi, doa Sad 35. Setiap kutipan diawali "Bismillahirrahmanirrahim".
- Riwayat lemah disebut dan ditolak secara eksplisit di dalam narasi, bukan hanya di deskripsi.
- Ajakan like dan subscribe hanya sekali di menit 0:41. Tidak ada iklan atau sponsor.
- Suara: satu narator laki-laki, tempo lambat, tanpa musik menonjol di transkrip. Deskripsi resmi mengatakan ini gabungan rekaman asli dan suara sintetis. Dari transkrip, artikulasi sangat rata dan konsisten sepanjang 27 menit, konsisten dengan voice clone atau speech-to-speech.

### 1.6 Pola rilis channel

Episode panjang: 12 Apr, 19 Apr, 30 Jun, 20 Jul, 13 Agu, 21 Agu, 5 Sep 2026. Rata-rata **satu episode 25 sampai 30 menit tiap 2 sampai 3 minggu** oleh 2 orang (suami istri, dari video Behind The Scene 23 Juli 2026). Di antara episode panjang mereka mengisi dengan Shorts dari topik yang sama (cincin Sulaiman, jin dalam botol) berbulan-bulan sebelum episode utamanya tayang.

---

## 2. Tools yang dipakai (stack lengkap + harga 2026)

Yang terkonfirmasi dari video: **CapCut** untuk editing dan caption. Yang lain adalah pilihan tools yang menghasilkan gaya persis seperti di video. Harga bisa berubah. Pilih satu per baris.

### 2.1 Riset dan naskah
| Tool | Fungsi | Harga | Link |
|---|---|---|---|
| ChatGPT / Claude / Gemini | Outline, drafting narasi, pembagian adegan, shot list | Gratis sampai USD 20/bln | https://chatgpt.com, https://claude.ai, https://gemini.google.com |
| Quran.com + Tafsir | Verifikasi ayat dan tafsir | Gratis | https://quran.com |
| Sunnah.com | Verifikasi hadis | Gratis | https://sunnah.com |
| Google Docs / Sheets | Naskah dan shot list | Gratis | https://docs.google.com |

### 2.2 Suara narasi (voice over)
| Tool | Fungsi | Harga | Link |
|---|---|---|---|
| ElevenLabs | TTS bahasa Indonesia, voice cloning, speech-to-speech (rekam sendiri lalu dirapikan), sound effects | Free, Starter USD 6, Creator USD 22 (cloning profesional), Pro USD 99 | https://elevenlabs.io |
| Fish Audio | Alternatif TTS dan cloning lebih murah | Free sampai USD 11 | https://fish.audio |
| Gemini TTS (Google AI Studio) | TTS murah | Gratis kuota | https://aistudio.google.com |
| Adobe Podcast Enhance | Bersihkan noise rekaman mic murah | Gratis | https://podcast.adobe.com/enhance |

Cara yang paling mirip video ini: rekam suara sendiri dengan tempo lambat (target 115 sampai 125 kata per menit), lalu ElevenLabs Speech-to-Speech dengan clone suara sendiri. Hasilnya tetap intonasi manusia tapi artikulasi rata seperti di video.

### 2.3 Gambar (keyframe tiap shot)
| Tool | Fungsi | Harga | Link |
|---|---|---|---|
| Midjourney | Kualitas sinematik paling dekat dengan video ini, Omni Reference untuk konsistensi tokoh | Basic USD 10, Standard USD 30 | https://www.midjourney.com |
| Leonardo AI | Alternatif murah, fitur karakter konsisten | Free, Essential USD 12, Premium USD 30 | https://leonardo.ai |
| Nano Banana (model gambar Gemini di AI Studio) | Edit gambar dengan instruksi teks, jaga wajah tokoh sama | Gratis kuota | https://aistudio.google.com |
| Flux (via Freepik / fal.ai) | Fotorealis, murah per gambar | Pay-per-use | https://www.freepik.com/ai, https://fal.ai |

### 2.4 Video (menganimasikan gambar)
| Tool | Fungsi | Harga | Link |
|---|---|---|---|
| Kling AI 3.0 | Image-to-video, klip sampai 15 detik, "Elements" untuk tokoh konsisten | Standard USD 6,99, Pro USD 25,99, Premier USD 64,99 | https://klingai.com |
| Google Veo 3.1 (Flow) | Realisme dan kepatuhan prompt terbaik, "ingredients to video" | Google AI Pro USD 19,99 (1.000 kredit), Ultra USD 99,99 sampai 199,99 | https://labs.google/flow |
| Hailuo (MiniMax) | Gerakan kamera dramatis, murah | Standard USD 9,99 | https://hailuoai.video |
| Runway Gen-4.5 | Kontrol kamera dan motion brush paling detail | USD 12 sampai 76 | https://runwayml.com |

Gerak di video ini pelan dan halus (push-in, jubah, debu). Semua tool di atas sanggup. Rekomendasi pemula: Kling Standard atau Pro sebagai mesin utama.

### 2.5 Musik dan SFX
| Sumber | Catatan | Link |
|---|---|---|
| Infraction (inaudio.org) | Dipakai channel ini di episode lain. Gratis dengan kredit | https://inaudio.org |
| Soundridemusic | Dipakai channel ini. Cek usage policy | https://soundridemusic.com |
| Cold Cinema | Dipakai channel ini. Musik epik gratis dengan kredit | https://www.youtube.com/@ColdCinema |
| Lahar | CC BY 3.0 | https://www.youtube.com/@musicbylahar |
| YouTube Audio Library | Gratis, aman monetisasi | https://studio.youtube.com |
| Suno / Udio | Buat scoring sendiri (cek lisensi komersial) | https://suno.com, https://udio.com |
| Pixabay / Freesound / ElevenLabs SFX | Angin, kuda, keramaian, api, air | https://pixabay.com/sound-effects, https://freesound.org |
| Epidemic Sound / Artlist | Berbayar, paling aman (USD 10 sampai 20/bln) | https://www.epidemicsound.com, https://artlist.io |

### 2.6 Editing, caption, thumbnail
| Tool | Fungsi | Harga | Link |
|---|---|---|---|
| **CapCut Desktop** | Terkonfirmasi dipakai. Editing, auto caption bahasa Indonesia dengan highlight kata, stiker subscribe, end card | Gratis, Pro sekitar USD 10/bln | https://www.capcut.com |
| DaVinci Resolve | Alternatif kelas pro untuk color grading | Gratis | https://www.blackmagicdesign.com/products/davinciresolve |
| Topaz Video AI | Upscale klip 720p ke 4K (opsional) | USD 299 sekali beli | https://www.topazlabs.com |
| Canva / Photoshop | Judul emas 3D di thumbnail | Gratis / USD 23 | https://www.canva.com |

### 2.7 Paket biaya bulanan
| Paket | Isi | Total per bulan |
|---|---|---|
| Hemat | ChatGPT gratis, ElevenLabs Starter, Leonardo Essential, Kling Standard, CapCut gratis, musik gratis | sekitar USD 26 (Rp 420 ribu) |
| Serius (mirip channel ini) | ChatGPT Plus, ElevenLabs Creator, Midjourney Standard, Kling Pro, Google AI Pro, CapCut Pro | sekitar USD 128 (Rp 2 juta) |
| Pro | Semua di atas + Kling Premier + Epidemic Sound | sekitar USD 190 (Rp 3 juta) |

Dengan sekitar 200 klip final dan rasio sukses 50 persen, satu episode butuh sekitar 400 generate video 5 sampai 10 detik. Di Kling Pro (3.000 kredit/bln, sekitar 20 sampai 35 kredit per klip 5 detik standar) itu 1 sampai 2 bulan kuota, jadi realistisnya paket Serius plus top-up kredit, atau campur Kling dan Veo.

---

## 3. Alur kerja langkah demi langkah (mengikuti video ini)

Target: satu episode 25 sampai 28 menit, sekitar 200 klip, 3.000 sampai 3.300 kata narasi.

### Tahap 0. Tentukan kisah dan batas episode (1 hari)
1. Pilih tokoh, bagi jadi beberapa part. Part 1 video ini: lahir sampai angin, jin, dan tembaga. Part 2 (dijanjikan di cliffhanger): semut, Hud-hud, Balqis.
2. Setiap part wajib punya: cold open yang menjual momen terbesar seluruh seri (video ini menjual kematian dan rayap yang baru dibahas di part terakhir), dan cliffhanger yang menyebut peristiwa part berikutnya.
3. Buat folder: `01-riset`, `02-naskah`, `03-karakter`, `04-gambar`, `05-video`, `06-audio`, `07-edit`, `08-publish`.

### Tahap 1. Riset (2 sampai 3 hari)
1. Kumpulkan ayat: untuk Sulaiman Part 1 video ini memakai Al-Anbiya 78 sampai 79, An-Naml 16, Sad 30 sampai 40, Saba 12 sampai 13.
2. Baca tafsir Ibnu Katsir per ayat. Catat status tiap riwayat: sahih, tafsir, Israiliyat, diperselisihkan.
3. Tabel: Peristiwa | Sumber | Status | Cara menyebut di narasi ("sebagian riwayat menyebut...", "hanyalah dongeng malam").
4. AI hanya untuk merangkum. Verifikasi setiap ayat di quran.com.

### Tahap 2. Naskah narasi (3 sampai 5 hari)
1. Panjang: 118 kata per menit terukur di video ini. Episode 27 menit = sekitar 3.200 kata. Episode 20 menit = sekitar 2.400 kata.
2. Struktur persis video: Cold open (30 detik, 60 sampai 70 kata) > Janji dan CTA (15 detik) > Salam > Latar (2 menit) > 6 babak masing-masing 2,5 sampai 4,5 menit > Hikmah (1,5 menit) > Cliffhanger (30 detik).
3. Rumus tiap babak: suasana > peristiwa > dialog singkat > dalil > refleksi > jembatan.
4. Gaya kalimat: pendek, koma sebagai jeda napas, diksi sastrawi ("sunyi", "membisu", "menyesakkan"). Pengulangan retoris ("Kuda tetaplah kuda. Emas tetaplah emas.").
5. Setiap dalil diawali "Bismillahirrahmanirrahim", dibaca terjemahannya, ditutup "Quran Surah X ayat Y".
6. Tandai adegan: `[ADEGAN 07: Padang kuda, sore, golden hour]`.

### Tahap 3. Shot list (2 hari)
1. Satu klip menutupi 1 sampai 2 kalimat narasi (5 sampai 9 detik). Episode 27 menit = sekitar 200 klip. Tambah 30 klip cadangan.
2. Google Sheet: No | Adegan | Kalimat narasi | Visual (subjek, aksi, latar, cahaya) | Tipe shot | Gerak kamera | Tokoh | Blur wajah? | Prompt gambar | Prompt video | Status.
3. Variasi: wide > medium > close-up > detail > wide. Video ini sering menyisipkan detail (tangan, kaki kuda, gulungan) di antara wide.
4. Siapkan 5 sampai 8 klip "serbaguna" yang bisa dipakai ulang (kota dari atas, awan, portal cahaya, kerumunan). Video ini memakai ulang klip portal dua kali.
5. Untuk dalil: siapkan 3 klip cutaway (Al-Qur'an terbuka, manuskrip, tangan menulis).

### Tahap 4. Character bible dan style guide (1 sampai 2 hari)
1. Paragraf fisik tetap per tokoh: Sulaiman kecil (11 sampai 12 tahun), Sulaiman remaja, Sulaiman raja (jubah maroon, ikat kepala emas), Daud (tua, mahkota, janggut abu), petani, peternak, jin.
2. Generate 6 sampai 10 gambar referensi per tokoh. Simpan yang terbaik sebagai reference image.
3. Style guide global untuk disalin ke semua prompt: `cinematic photoreal, epic biblical era, 35mm anamorphic, volumetric light, film grain, muted warm palette`.
4. Palet per babak: emas hangat (istana, kuda), biru malam (ujian jasad), fajar keemasan (angin), oranye membara (tembaga).
5. Lokasi tetap: istana Yerusalem (batu kapur, pilar cedar), padang kuda, teras tinggi istana, bawah laut.

### Tahap 5. Generate gambar keyframe (3 sampai 5 hari)
1. Per babak, agar cahaya konsisten. Generate 4 variasi per shot, pilih 1, upscale.
2. Nama file `B03_S07.png` (babak 3, shot 7).
3. Lampirkan reference image untuk tokoh.
4. Cek: jari, teks acak, simbol salib atau bulan sabit, bangunan modern, kubah (video ini sendiri kecolongan kubah dan menara Ottoman di 9:22 dan 9:56).
5. Target: 200 gambar final dari sekitar 800 generate.

### Tahap 6. Image-to-video (4 sampai 7 hari, tahap terlama)
1. Prompt gerak pendek saja. Gerakan yang dipakai video ini: slow push-in, jubah dan rambut tertiup, debu dan partikel, awan bergerak, kuda berlari, air bergerak.
2. 5 detik untuk close-up dan detail, 10 detik untuk wide dan establishing.
3. Rasio sukses 40 sampai 60 persen. Anggarkan 2 kali generate per klip.
4. Shot penting (cold open, sujud, angin, cliffhanger) pakai mode kualitas tertinggi dan multi-referensi.
5. Unduh 1080p, nama sama dengan gambar sumber.

### Tahap 7. Voice over (1 sampai 2 hari)
1. Rekam sendiri, tempo 115 sampai 125 kata per menit, ruangan sunyi.
2. Adobe Podcast Enhance, lalu opsional ElevenLabs Speech-to-Speech dengan clone suara sendiri.
3. Jika full TTS: per paragraf, Stability 45, Similarity 80, Style 15. Dengarkan tiap paragraf.
4. Ekspor WAV 48 kHz. Durasi VO final harus sekitar 27 menit.

### Tahap 8. Editing di CapCut (4 sampai 6 hari)
1. Radio edit: VO masuk dulu, potong jeda, tandai tiap `[ADEGAN]`.
2. Masukkan klip mengikuti kalimat. Klip 10 detik boleh dipotong ke 5 sampai 7 detik.
3. Transisi: cross dissolve 10 sampai 15 frame di hampir semua sambungan, seperti video ini. Hard cut hanya di cold open.
4. Musik: 1 lagu per babak emosional. Video ini memakai 6 sampai 8 lagu per episode (dari kredit episode lain). Volume musik -18 sampai -22 dB di bawah VO.
5. SFX ambience per adegan: angin, kuda, keramaian, api, air. -25 dB.
6. Color grade: satu LUT warm cinematic global, lalu koreksi per babak (biru untuk malam).
7. Blur wajah nabi dewasa: CapCut > efek Blur > masking wajah, atau lebih mudah: generate shot nabi dewasa dari belakang, siluet, atau tertutup cahaya sejak awal.
8. Caption: CapCut Auto captions bahasa Indonesia > template huruf kapital putih tebal > efek highlight kata warna biru > posisi bawah tengah > koreksi manual nama Arab (Whisper dan CapCut sama-sama salah menulis "Sulaiman", "Daud", "Jalut").
9. Overlay: logo channel kanan bawah, teks channel + ikon YouTube kiri atas, stiker Subscribe beranimasi di menit 1 sampai 1,5.
10. Intro: montase cold open 30 detik dari 8 sampai 10 shot terbaik seluruh seri > title card logo channel dengan efek ledakan cahaya (5 detik) > salam.
11. Outro: cliffhanger visual pasukan bergerak > layar hitam "BERSAMBUNG..." 3 detik. Video ini tidak memakai end screen YouTube.
12. Ekspor 1080p atau 4K, 30 fps, H.264, 16 sampai 20 Mbps, AAC 320 kbps.

### Tahap 9. Thumbnail, judul, deskripsi (1 hari)
1. Thumbnail: tokoh besar di kiri, elemen ikonik (singa, Hud-hud), judul emas 3D kapital di kanan, subjudul di plakat merah. Buat 3 versi, uji A/B di YouTube Studio.
2. Judul: NAMA TOKOH kapital + klaim besar + "Part 1".
3. Deskripsi ikuti kerangka channel ini: pertanyaan hook, ringkasan, "Video ini merupakan BAGIAN PERTAMA", daftar poin, paragraf metodologi riset dan disclaimer riwayat, ajakan support, Referensi Utama Riset Naskah, Catatan Audio, Catatan Visual, kredit musik, hashtag.
4. Centang label "altered or synthetic content" di YouTube Studio.

### Tahap 10. Publikasi dan seri
1. Rilis tiap 2 sampai 3 minggu, hari dan jam tetap.
2. Buat 3 sampai 5 Shorts dari topik episode berikutnya jauh sebelum episodenya tayang (channel ini merilis Shorts cincin Sulaiman di April, episode panjangnya September).
3. Video pendek "sedang dipersiapkan" atau Behind The Scene di sela produksi.

---

## 4. Kumpulan prompt siap pakai

Ganti bagian dalam kurung siku. Prompt gambar dan video dalam bahasa Inggris.

### 4.1 Prompt riset
```
Kamu peneliti sejarah Islam yang teliti. Tokoh: [Nabi Sulaiman AS].
Buat tabel kronologis: Peristiwa | Sumber (surah:ayat atau kitab hadis + nomor) | Status (Al-Qur'an / hadis sahih / tafsir klasik / Israiliyat / diperselisihkan) | Cara aman menyebutnya di narasi.
Jangan mengarang sumber. Jika tidak yakin tulis "perlu verifikasi". Bahasa Indonesia.
```

### 4.2 Prompt naskah narasi (meniru gaya video ini)
```
Kamu penulis naskah dokumenter sinematik Islam untuk YouTube. Gaya: narator film epik, kalimat pendek, koma sebagai jeda napas, diksi sastrawi ("sunyi", "membisu", "menyesakkan"), pengulangan retoris, tidak menggurui.
Tulis naskah Part 1 tentang [Nabi Sulaiman AS], target 3.200 kata (27 menit pada 118 kata per menit).
Struktur wajib:
1. COLD OPEN 60 sampai 70 kata: sebutkan 4 momen paling besar dari SELURUH seri (termasuk ending), tutup dengan "Namun pernahkah kalian tahu bagaimana ia memperoleh semua itu?"
2. JANJI + CTA 1 kalimat: "Di sinilah kita akan menyusuri skrip demi skrip jejak langkahnya. Pastikan sudah like dan subscribe [channel]. Mari kita mulai."
3. SALAM: "Assalamualaikum warahmatullahi wabarakatuh."
4. LATAR 250 kata: tanah, nasab, kelahiran, makna nama.
5. ENAM BABAK masing-masing 350 sampai 550 kata: [daftar babak dari tabel riset]. Setiap babak: suasana > peristiwa > dialog singkat (maksimal 4 baris) > dalil > refleksi hikmah > kalimat jembatan.
6. HIKMAH 200 kata.
7. CLIFFHANGER 60 kata yang menyebut peristiwa Part 2: [Lembah Semut, Hud-hud, Balqis].
Aturan dalil: maksimal 6 kutipan, setiap kutipan diawali "Bismillahirrahmanirrahim", terjemahan Kemenag, diakhiri "Quran Surah X ayat Y". Riwayat lemah disebut lalu ditolak dengan sopan.
Tandai pergantian adegan dengan [ADEGAN nn: lokasi, waktu, palet warna].
Output naskah saja.
```

### 4.3 Prompt shot list
```
Berikut naskah dengan tanda [ADEGAN]. Pecah jadi shot list untuk image-to-video AI.
Aturan: satu shot menutupi 1 sampai 2 kalimat (5 sampai 9 detik). Variasikan wide, medium, close-up, detail. Saat dalil dibacakan, pakai cutaway simbolik (Al-Qur'an terbuka, manuskrip). Tandai shot yang bisa memakai klip serbaguna (kota dari atas, awan, kerumunan).
Kolom: No | Adegan | Kalimat | Visual (subjek, aksi, latar, cahaya) | Tipe shot | Gerak kamera | Tokoh | Blur wajah (ya/tidak) | Palet.
Tokoh nabi dewasa: dari belakang, siluet, atau wajah diblur. Output CSV.
```

### 4.4 Prompt character bible
```
Buat character bible untuk gambar AI, bahasa Inggris, 60 sampai 80 kata per tokoh, spesifik (usia, wajah, rambut, janggut, kulit, pakaian dengan warna dan bahan, aksesori).
Tokoh: Solomon age 11, Solomon age 17, King Solomon age 30 (deep maroon robe with gold embroidery, thin gold circlet, long dark wavy hair, short beard), King David age 65 (grey beard, bronze crown, white and gold robe), farmer, shepherd, palace advisor, jinn builder (tall dark horned figure), jinn diver.
Era: Levant sekitar 1000 SM. Hindari pakaian Arab abad ke-7, kubah, menara, salib, bulan sabit, benda modern.
```

### 4.5 Formula prompt gambar
```
[TIPE SHOT], [KARAKTER dari bible], [AKSI], [LATAR], [CAHAYA dan PALET babak], cinematic photoreal, epic biblical era, 35mm anamorphic, volumetric light, film grain, muted warm palette --ar 16:9 --style raw
```
Contoh 1, cold open (0:12 di video, singa di permadani terbang):
```
Epic wide shot, a robed king seated on a flying ornate carpet beside a majestic white lion, soaring above clouds at golden hour, birds flying alongside, ancient city far below, cinematic photoreal, epic biblical era, 35mm anamorphic, volumetric light --ar 16:9 --style raw
```
Contoh 2, pengadilan ladang (3:20, wajah anak boleh terlihat):
```
Medium shot, a boy of 12 (Solomon, curly dark hair, simple teal tunic) watching from behind a stone pillar as two angry men (a dusty farmer and a nervous shepherd) argue before an elderly bearded king on a bronze throne, sunlit palace courtroom, dust in sunbeams, warm golden light, cinematic photoreal, 35mm --ar 16:9 --oref [URL referensi Solomon kecil] --ow 100
```
Contoh 3, kuda-kuda pilihan (12:20):
```
Low angle wide shot, dozens of magnificent Arabian horses galloping across a sunlit plain at sunset, golden dust clouds, long manes flowing, epic scale, motion blur, anamorphic lens flare, cinematic photoreal --ar 16:9
```
Contoh 4, ujian malam (17:00, wajah tidak terlihat):
```
Wide shot from behind, a king in a dark embroidered robe standing alone before an empty golden throne in a vast moonlit stone hall, a small shrouded figure lying on the throne, cold blue moonlight through tall windows, single candle glow, somber, cinematic photoreal --ar 16:9
```
Contoh 5, angin (20:20):
```
Medium shot from behind, a king on a high palace terrace at dawn raising one hand as a powerful wind lifts his flowing cream robe, banners bending, the ancient city of Jerusalem spread below in golden morning haze, birds scattering, cinematic photoreal --ar 16:9
```
Contoh 6, jin penyelam (23:00):
```
Underwater wide shot, tall shadowy horned figures descending into deep dark sea, faint blue light rays from above fading into blackness, bubbles, ancient ruins on the seabed, eerie, cinematic photoreal --ar 16:9
```
Contoh 7, cutaway dalil (7:00):
```
Close-up, an open ancient Quran manuscript on a red patterned carpet, oil lamp light, dust particles, shallow depth of field, warm tones, cinematic photoreal --ar 16:9
```
Negative prompt (Leonardo / Flux): `text, watermark, extra fingers, deformed hands, modern clothing, dome, minaret, cross, crescent, blurry, cartoon`

### 4.6 Prompt video (image-to-video)
Hanya gerakan. Gerakan yang dipakai video ini:
```
Slow push-in, robe and hair move in gentle wind, dust particles drift in light, stable camera, no morphing
```
```
Slow aerial pull-back revealing the city and valley, mist drifting, birds crossing frame, steady, cinematic
```
```
Handheld tracking shot following galloping horses, dust kicking up, slight camera shake, high energy
```
```
Static camera, candle flame flickers, subject breathes slowly, shadows move gently, somber mood
```
```
Slow tilt up from the open book to the lamp, dust particles, shallow focus shift
```
Negative (Kling): `distortion, extra limbs, morphing face, flicker, text`

### 4.7 Arahan suara (ElevenLabs v3 dengan tag)
```
[calm, deep, slow storytelling] Ia bisa menghentikan ribuan pasukan, [pause] hanya untuk seekor semut. [pause] Memindahkan singgasana ratu dalam sekejap mata. [slower] Namun, pernahkah kalian tahu bagaimana ia memperoleh semua itu?
```
Stability 45, Similarity 80, Style 15, Speaker boost on. Target 118 kata per menit.

### 4.8 Prompt thumbnail
```
YouTube thumbnail composition, 16:9, left third: majestic bearded king in ornate bronze armor and maroon robe seated beside a giant white lion, right third open sky and distant palace for text, a hoopoe bird on a rock, dramatic golden light, ultra detailed, cinematic photoreal --ar 16:9
```
Teks di Canva: judul kapital serif tebal emas dengan bevel, subjudul di plakat merah gelap.

### 4.9 Prompt deskripsi YouTube
```
Tulis deskripsi YouTube bahasa Indonesia dengan struktur: paragraf hook pertanyaan; ringkasan; kalimat "Video ini merupakan BAGIAN PERTAMA..." dan daftar isi Part 2; "Pada bagian pertama ini kita akan melihat:" (bullet); paragraf metodologi riset dan disclaimer riwayat; ajakan like, komentar hikmah, subscribe; "Referensi Utama Riset Naskah" (bullet); "Catatan Audio"; "Catatan Visual"; kredit musik; 10 hashtag.
Bahan: [naskah dan tabel riset].
```

---

## 5. Estimasi waktu

Untuk satu episode 27 menit, sekitar 200 klip, 3.200 kata, kualitas seperti video ini.

| Tahap | Solo, pertama kali | Solo, sudah lancar | Tim 2 orang, lancar |
|---|---|---|---|
| Riset | 3 hari | 2 hari | 2 hari |
| Naskah 3.200 kata | 5 hari | 3 hari | 3 hari |
| Shot list dan character bible | 3 hari | 2 hari | 1 hari |
| Gambar (sekitar 800 generate) | 6 hari | 4 hari | 3 hari |
| Video (sekitar 400 generate) | 8 hari | 5 hari | 4 hari |
| Voice over 27 menit | 2 hari | 1 hari | 1 hari |
| Editing CapCut, caption, musik | 7 hari | 5 hari | 4 hari |
| Thumbnail, deskripsi, QC | 2 hari | 1 hari | 1 hari |
| **Total hari kerja** | **36 hari (7 minggu)** | **23 hari (4 sampai 5 minggu)** | **19 hari kerja, dikerjakan paralel: 2 sampai 3 minggu kalender** |
| **Total jam** | 180 sampai 220 jam | 120 sampai 150 jam | 120 sampai 150 jam dibagi 2 |

Kolom tim 2 orang cocok dengan bukti nyata: channel ini merilis episode 25 sampai 30 menit tiap 2 sampai 3 minggu, dan naskah Kilic Ali Pasa dari "sedang dimatangkan" (23 Juli) ke rilis (13 Agustus) memakan 3 minggu.

Yang paling sering membuat molor: klip video gagal (wajah berubah, tangan rusak) dan revisi naskah setelah visual dibuat. Kunci naskah dan VO dulu, baru generate.

---

## 6. Link kursus dan bahan belajar

**Kursus terstruktur (Inggris)**
- Curious Refuge, kursus gratis pengantar AI filmmaking: https://curiousrefuge.com/start-here
- Curious Refuge, AI Filmmaking: https://curiousrefuge.com/ai-filmmaking
- Curious Refuge, Advanced AI Filmmaking 2.0: https://curiousrefuge.com/advanced-ai-filmmaking
- Curious Refuge, AI Documentary (paling dekat dengan format ini): https://curiousrefuge.com/ai-documentary
- Semua kursus Curious Refuge (membership sekitar USD 149/bln): https://curiousrefuge.com/courses
- Udemy, topik Filmmaking (cari "AI filmmaking", sering diskon USD 10 sampai 20): https://www.udemy.com/topic/filmmaking/
- Udemy, topik AI berbahasa Indonesia: https://www.udemy.com/id/topic/artificial-intelligence/

**Tutorial YouTube berbahasa Indonesia (gratis, format kisah nabi dengan AI)**
- Cara Buat Konten Kisah Nabi Pakai AI yang Cepat Viral & Bisa Monetisasi (Maret 2026): https://www.youtube.com/watch?v=0TObKwQ5-Sk
- CUMA 1 VIDEO KISAH NABI LANGSUNG MONET! Full Panduan AI + FREE PROMPT: https://www.youtube.com/watch?v=FZB78K9WtGo
- Tutorial Cara Buat Video Kisah Nabi Menggunakan AI: https://www.youtube.com/watch?v=utpfVcQ47z0
- Cara membuat gambar ilustrasi dan animasi kisah sahabat: https://www.youtube.com/watch?v=UF8Q_bMOnHk

**Dokumentasi resmi tools**
- CapCut auto captions dan template: https://www.capcut.com/tools/auto-captions
- Kling AI, panduan generator video 2026: https://kling.ai/blog/best-ai-video-generator-2026-kling-ai
- Google Flow (Veo): https://labs.google/flow
- ElevenLabs docs: https://elevenlabs.io/docs
- Midjourney docs (Omni Reference, parameter): https://docs.midjourney.com
- Panduan karakter konsisten di video AI: https://elements.envato.com/learn/ai-video-consistent-character
- Panduan alur produksi film AI 2026: https://www.imagine.art/blogs/ai-filmmaking-guide
- Workflow naskah ke storyboard ke film: https://mstudio.ai/blog/ai-filmmaking/script-to-storyboard-to-film-ai-workflow

Catatan: tidak ditemukan kursus berbayar berbahasa Indonesia yang khusus membahas film AI panjang dengan kualitas terverifikasi. Tutorial YouTube di atas gratis, isinya belum diverifikasi satu per satu.

---

## 7. Hal penting sebelum mulai

1. **Wajah nabi.** Video ini memblur wajah Sulaiman dewasa di close-up tapi menampilkan Sulaiman kecil dan sebagian shot Daud. Lebih aman dan lebih hemat kerja: generate nabi dari belakang, siluet, atau tertutup cahaya sejak awal, jadi tidak perlu masking blur di CapCut.
2. **Kebijakan monetisasi YouTube** menolak konten tidak autentik yang diproduksi massal. Yang membuat channel ini lolos: naskah orisinal 3.000 kata hasil riset, suara sendiri, editing manual 200 klip, nilai edukasi. Jangan pakai template naskah yang sama berulang.
3. **Label konten sintetis** wajib dicentang saat upload.
4. **Kredit musik** wajib di deskripsi untuk musik gratis. Simpan bukti lisensi.
5. **Disclaimer** riwayat yang diperselisihkan, di narasi dan di deskripsi.
6. **Anakronisme.** Video ini sendiri kecolongan kubah dan menara gaya Ottoman di Yerusalem era 1000 SM. Masukkan larangan itu ke negative prompt.
7. **Backup** semua gambar, klip, naskah, dan reference image per episode di Google Drive. Tokoh yang sama dibutuhkan lagi di Part 2.
