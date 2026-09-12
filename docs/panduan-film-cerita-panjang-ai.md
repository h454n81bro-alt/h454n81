# Panduan Membuat Film Cerita Durasi Panjang dengan AI

Studi kasus: **"NABI SULAIMAN: Awal Mula Kerajaan Termegah yang Pernah Ada | Part 1"**
Channel: **Noor Occulta** (https://www.youtube.com/@NoorOcculta)
Video: https://www.youtube.com/watch?v=Fjebv-I1XyM

Dokumen ini membedah bagaimana video seperti itu dibuat, tools apa yang dipakai, prompt yang bisa langsung dipakai, link kursus, serta estimasi waktu dan biaya untuk membuat satu episode utuh.

> Catatan kejujuran data: YouTube memblokir pembacaan otomatis durasi video dari server. Judul, deskripsi lengkap, tanggal rilis, jumlah view, dan thumbnail berhasil dibaca dari RSS resmi channel. Semua yang dicap **"ESTIMASI"** di bawah adalah perkiraan berdasarkan pola channel dan praktik umum, bukan pernyataan dari pembuatnya.

---

## 1. Apa yang sebenarnya ada di video ini (hasil pembedahan)

| Fakta | Nilai |
|---|---|
| Judul | NABI SULAIMAN: Awal Mula Kerajaan Termegah yang Pernah Ada, Part 1 |
| Channel | Noor Occulta, tagline "A Historical Imagination" |
| Tanggal rilis | 5 September 2026 |
| Views (per 12 Sep 2026) | sekitar 122.000 dalam 7 hari |
| Format | Dokumenter naratif sinematik, seri bersambung (Part 1, Part 2 menyusul) |
| Tim | Sepasang suami istri, "studio kecil", klip disusun manual (dari video Behind The Scene mereka, 23 Juli 2026) |
| Audio | Deskripsi resmi: "perpaduan rekaman suara asli dan bantuan suara digital sintetis" |
| Visual | Deskripsi resmi: "ilustrasi artistik dan dramatisasi sinematik", gaya fotorealis epik (lihat thumbnail: Sulaiman, singa, burung Hud-hud, istana di kejauhan) |
| Musik | Musik bebas royalti dengan kredit: Infraction (inaudio.org), Soundridemusic, Cold Cinema, Lahar (CC BY), MokkaMusic, Alexi Action |
| Riset naskah | Al-Qur'an (Al-Anbiya, Sad, An-Naml, Saba), Shahih Bukhari, Shahih Muslim, Tafsir Ibnu Katsir, Ath-Thabari, Al-Qurthubi |
| Struktur Part 1 | Masa muda Sulaiman, peralihan dari Daud, kuda-kuda pilihan (Surah Sad), "jasad" di singgasana, doa memohon kerajaan, angin dan jin ditundukkan |

**Pola rilis channel (episode panjang saja):** 12 Apr, 19 Apr, 30 Jun, 20 Jul, 13 Agu, 21 Agu, 5 Sep 2026. Artinya rata-rata **satu episode panjang tiap 2 sampai 3 minggu** untuk tim 2 orang yang sudah mahir. Antara video Behind The Scene (23 Juli, naskah Kilic Ali Pasa "sedang dimatangkan") dan rilis episodenya (13 Agustus) hanya **3 minggu**.

**Kesimpulan pipeline mereka (ESTIMASI, disimpulkan dari bukti di atas):**

1. Riset dari kitab, tulis naskah narasi sendiri (bukan AI mentah, karena ada daftar referensi dan disclaimer riwayat).
2. Rekam suara asli, lalu diperhalus atau digabung dengan suara sintetis AI (voice clone / speech-to-speech).
3. Buat gambar per adegan dengan generator gambar AI, lalu dianimasikan menjadi klip 5 sampai 10 detik dengan generator video AI (image-to-video).
4. Susun ratusan klip secara manual di software editing mengikuti narasi, tambah musik epik gratis, SFX, subtitle.
5. Thumbnail: karakter AI + judul emas 3D + subjudul merah.
6. Deskripsi panjang dengan referensi, disclaimer audio dan visual, kredit musik.

---

## 2. Tools yang dipakai (stack lengkap + harga 2026)

Harga di bawah dari halaman harga publik per September 2026, bisa berubah. Pilih **satu** tool per baris, jangan beli semuanya.

### 2.1 Riset dan naskah
| Tool | Fungsi | Harga | Link |
|---|---|---|---|
| ChatGPT / Claude / Gemini | Outline, drafting narasi, pembagian adegan, shot list | Gratis sampai USD 20/bln | https://chatgpt.com, https://claude.ai, https://gemini.google.com |
| Quran.com + Tafsir | Verifikasi ayat dan tafsir | Gratis | https://quran.com |
| Sunnah.com | Verifikasi hadis | Gratis | https://sunnah.com |
| Google Docs / Notion | Naskah dan tabel shot list | Gratis | https://docs.google.com |

### 2.2 Suara narasi (voice over)
| Tool | Fungsi | Harga | Link |
|---|---|---|---|
| ElevenLabs | Text-to-speech bahasa Indonesia, voice cloning, speech-to-speech (rekam suara sendiri lalu "dirapikan"), sound effects | Free, Starter USD 6, Creator USD 22 (cloning profesional), Pro USD 99 | https://elevenlabs.io |
| Fish Audio | Alternatif TTS + cloning lebih murah | Free sampai USD 11 | https://fish.audio |
| Gemini TTS (Google AI Studio) | TTS multi-speaker, murah | Gratis kuota | https://aistudio.google.com |
| Adobe Podcast Enhance | Bersihkan noise rekaman mic murah | Gratis | https://podcast.adobe.com/enhance |

Cara yang paling mirip Noor Occulta: **rekam suara sendiri**, lalu pakai ElevenLabs Speech-to-Speech dengan voice clone kamu sendiri untuk merapikan artikulasi. Hasilnya tetap intonasi manusia tapi bersih.

### 2.3 Gambar (keyframe tiap adegan)
| Tool | Fungsi | Harga | Link |
|---|---|---|---|
| Midjourney | Kualitas sinematik terbaik, Omni Reference untuk konsistensi wajah | Basic USD 10, Standard USD 30 | https://www.midjourney.com |
| Leonardo AI | Alternatif murah, ada fitur karakter konsisten | Free, Essential USD 12, Premium USD 30 | https://leonardo.ai |
| Nano Banana (model gambar Gemini di AI Studio) | Edit gambar dengan instruksi teks, jaga wajah karakter sama di adegan lain | Gratis kuota | https://aistudio.google.com |
| Flux (via Freepik / fal.ai) | Fotorealis, murah per gambar | Pay-per-use | https://www.freepik.com/ai, https://fal.ai |

### 2.4 Video (menganimasikan gambar)
| Tool | Fungsi | Harga | Link |
|---|---|---|---|
| Kling AI 3.0 | Image-to-video, klip sampai 15 detik, "Elements" untuk karakter konsisten, audio native | Standard USD 6,99, Pro USD 25,99, Premier USD 64,99 | https://klingai.com |
| Google Veo 3.1 (Flow) | Realisme dan kepatuhan prompt terbaik, "ingredients to video" (masukkan gambar karakter, latar, properti) | Google AI Pro USD 19,99 (1.000 kredit), Ultra USD 99,99 sampai 199,99 | https://labs.google/flow |
| Hailuo (MiniMax) | Gerakan kamera dramatis, murah | Standard USD 9,99 (1.000 kredit) | https://hailuoai.video |
| Runway Gen-4.5 | Kontrol kamera dan motion brush paling detail | USD 12 sampai 76 | https://runwayml.com |

Rekomendasi untuk pemula: **Kling Standard atau Pro** sebagai mesin utama, Veo lewat Google AI Pro untuk adegan yang butuh realisme tinggi.

### 2.5 Musik dan SFX
| Sumber | Catatan | Link |
|---|---|---|
| Infraction (inaudio.org) | Dipakai Noor Occulta. Gratis dengan kredit di deskripsi | https://inaudio.org |
| Soundridemusic | Dipakai Noor Occulta. Cek usage policy | https://soundridemusic.com |
| Cold Cinema | Dipakai Noor Occulta. Musik epik sinematik gratis dengan kredit | https://www.youtube.com/@ColdCinema |
| Lahar | CC BY 3.0 | https://www.youtube.com/@musicbylahar |
| YouTube Audio Library | Gratis, aman monetisasi | https://studio.youtube.com |
| Suno / Udio | Buat scoring sendiri (cek lisensi komersial) | https://suno.com, https://udio.com |
| Pixabay / Freesound / ElevenLabs SFX | Efek suara angin, kuda, pedang, keramaian pasar | https://pixabay.com/sound-effects, https://freesound.org |
| Epidemic Sound / Artlist | Berbayar, paling aman untuk monetisasi (USD 10 sampai 20/bln) | https://www.epidemicsound.com, https://artlist.io |

### 2.6 Editing, subtitle, thumbnail
| Tool | Fungsi | Harga | Link |
|---|---|---|---|
| CapCut Desktop | Editing, auto caption bahasa Indonesia, mudah | Gratis, Pro sekitar USD 10/bln | https://www.capcut.com |
| DaVinci Resolve | Editing dan color grading kelas pro | Gratis | https://www.blackmagicdesign.com/products/davinciresolve |
| Adobe Premiere Pro | Standar industri | USD 22,99/bln | https://www.adobe.com/products/premiere.html |
| Topaz Video AI | Upscale klip 720p ke 4K, hilangkan jitter | USD 299 sekali beli (opsional) | https://www.topazlabs.com |
| Canva / Photoshop | Teks judul emas 3D di thumbnail | Gratis / USD 23 | https://www.canva.com |

### 2.7 Paket biaya bulanan yang masuk akal
| Paket | Isi | Total per bulan |
|---|---|---|
| Hemat | ChatGPT gratis, ElevenLabs Starter, Leonardo Essential, Kling Standard, CapCut gratis, musik gratis | sekitar USD 26 (Rp 420 ribu) |
| Serius (mirip channel ini) | ChatGPT Plus, ElevenLabs Creator, Midjourney Standard, Kling Pro, Google AI Pro, CapCut Pro | sekitar USD 128 (Rp 2 juta) |
| Pro | Semua di atas + Kling Premier + Epidemic Sound | sekitar USD 190 (Rp 3 juta) |

---

## 3. Alur kerja langkah demi langkah (eksplisit)

Target contoh: **satu episode 20 sampai 25 menit**, 16:9, 1080p, narasi bahasa Indonesia.

### Tahap 0. Tentukan kisah dan batas episode (1 hari)
1. Pilih tokoh dan rentang kisah. Contoh: Nabi Sulaiman, bagi jadi 2 sampai 3 part. Part 1 = kelahiran sampai anugerah angin dan jin. Part 2 = semut, Hud-hud, Balqis. Part 3 = wafat dan rayap.
2. Setiap part harus punya satu pertanyaan pembuka (hook) dan satu cliffhanger penutup. Lihat kalimat pertama deskripsi Noor Occulta: selalu diawali "Bagaimana seorang ... justru ...?".
3. Buat folder proyek: `01-riset`, `02-naskah`, `03-karakter`, `04-gambar`, `05-video`, `06-audio`, `07-edit`, `08-publish`.

### Tahap 1. Riset (2 sampai 3 hari)
1. Kumpulkan semua ayat yang menyebut tokoh (untuk Sulaiman: Al-Anbiya 78 sampai 82, Sad 30 sampai 40, An-Naml 15 sampai 44, Saba 12 sampai 14).
2. Baca tafsir Ibnu Katsir untuk tiap ayat, catat mana yang sahih, mana yang Israiliyat atau diperselisihkan.
3. Buat tabel: Peristiwa, Sumber, Status (sahih / tafsir / ilustrasi naratif). Tabel ini nanti jadi bahan disclaimer di deskripsi, persis seperti yang Noor Occulta tulis.
4. Gunakan AI hanya untuk merangkum dan menyusun, bukan sebagai sumber. Verifikasi setiap ayat di quran.com.

### Tahap 2. Naskah narasi (3 sampai 5 hari)
1. Panjang: narasi sinematik bahasa Indonesia berjalan sekitar 130 sampai 140 kata per menit. Episode 20 sampai 25 menit = **2.800 sampai 3.500 kata**.
2. Struktur 5 babak: Hook (0 sampai 1 menit) > Latar (1 sampai 4) > Konflik dan ujian (4 sampai 15) > Titik balik (15 sampai 21) > Hikmah dan cliffhanger (21 sampai 25).
3. Tulis dengan kalimat pendek, banyak jeda, gaya "bercerita di depan api unggun". Hindari daftar dan istilah teknis.
4. Sisipkan kutipan ayat dengan terjemahan, jangan lebih dari 1 ayat per 2 menit agar tidak berat.
5. Tandai di naskah setiap pergantian adegan dengan `[ADEGAN 07: Istana Daud, malam]`. Ini jadi dasar shot list.

### Tahap 3. Shot list dan storyboard (2 hari)
1. Satu adegan sekitar 30 sampai 60 detik narasi. Satu klip visual sekitar 5 sampai 8 detik. Jadi episode 25 menit butuh **200 sampai 300 klip**.
2. Buat Google Sheet dengan kolom: No, Adegan, Kalimat narasi, Deskripsi visual, Tipe shot (wide / medium / close-up), Gerakan kamera, Karakter yang muncul, Prompt gambar, Prompt video, Status.
3. Aturan variasi: jangan 2 shot berurutan dengan ukuran sama. Pola aman: wide > medium > close-up > detail > wide.
4. Untuk adegan tokoh nabi, tentukan kebijakan penggambaran wajah sejak awal (lihat bagian 7).

### Tahap 4. Character bible dan style guide (1 sampai 2 hari)
1. Buat 1 paragraf deskripsi fisik tetap untuk setiap tokoh (usia, wajah, rambut, janggut, pakaian, warna, aksesori). Paragraf ini **disalin persis** ke setiap prompt.
2. Generate 6 sampai 10 gambar referensi per tokoh (depan, samping, close-up, full body, berbagai ekspresi). Simpan yang terbaik sebagai **reference image**.
3. Buat 1 paragraf style guide global (misal: "cinematic photoreal, 35mm, golden hour, volumetric light, epic biblical era, muted warm palette"). Disalin ke semua prompt.
4. Lakukan hal yang sama untuk lokasi utama (istana, padang kuda, tepi sungai) dan properti (singgasana, cincin, tongkat).

### Tahap 5. Generate gambar keyframe (3 sampai 5 hari)
1. Kerjakan per adegan, bukan per klip acak, supaya pencahayaan konsisten.
2. Setiap klip: generate 4 variasi, pilih 1, upscale. Simpan dengan nama `A07_S03.png` (adegan 7, shot 3).
3. Untuk karakter, selalu lampirkan reference image (Midjourney: Omni Reference; Leonardo: Character Reference; Nano Banana: upload gambar lalu instruksi edit).
4. Cek kesalahan umum AI: jari, teks acak, simbol agama yang salah, arsitektur anakronistik. Buang, ulang.
5. Target: 200 sampai 300 gambar final = sekitar 1.000 generate.

### Tahap 6. Image-to-video (4 sampai 7 hari, ini tahap terlama)
1. Upload gambar keyframe ke Kling / Veo / Hailuo, tulis prompt gerak **pendek** (gerakan kamera + gerakan subjek saja, jangan ulang deskripsi visual).
2. Durasi 5 detik untuk close-up, 10 detik untuk wide dan establishing shot.
3. Rasio sukses realistis 40 sampai 60 persen. Anggarkan 2 sampai 3 kali generate per klip.
4. Untuk shot penting (opening, klimaks), pakai fitur multi-referensi (Kling Elements, Veo ingredients) dan pakai mode kualitas tertinggi.
5. Unduh semua di 1080p, nama file sama dengan gambar sumbernya.

### Tahap 7. Voice over (1 sampai 2 hari)
1. Rekam sendiri di ruangan sunyi (selimut di dinding cukup), mic USB apa saja.
2. Bersihkan dengan Adobe Podcast Enhance.
3. Opsional: masukkan ke ElevenLabs Speech-to-Speech dengan clone suara sendiri untuk konsistensi tone.
4. Jika full TTS: pecah naskah per paragraf, generate satu per satu, setting stability 40 sampai 55, similarity 75 sampai 85, style 10 sampai 25. Dengarkan tiap paragraf, ulang yang salah tekanan.
5. Ekspor WAV 48kHz.

### Tahap 8. Editing (4 sampai 6 hari)
1. **Radio edit dulu**: masukkan VO ke timeline, potong jeda, tandai setiap `[ADEGAN]`.
2. Masukkan klip video mengikuti naskah. Klip 8 detik boleh dipotong jadi 4 sampai 6 detik supaya ritme rapat.
3. Tambahkan gerak tambahan ke gambar diam yang gagal jadi video (Ken Burns zoom 105 persen ke 110 persen) sebagai cadangan.
4. Musik: 1 lagu per babak emosional (tenang, tegang, epik, haru). Volume musik -18 sampai -22 dB di bawah VO. Ducking otomatis di CapCut atau Resolve.
5. SFX ambience di setiap adegan (angin, burung, keramaian, api) di -25 dB.
6. Transisi: cut biasa dan cross dissolve 10 sampai 15 frame. Hindari efek ramai.
7. Color grade satu LUT warm cinematic untuk seluruh video supaya klip dari tool berbeda terlihat satu kesatuan.
8. Subtitle otomatis lalu koreksi manual (nama Arab sering salah).
9. Tambahkan intro 5 detik dengan logo, outro 20 detik dengan end screen ke episode berikutnya.
10. Ekspor 1080p H.264, 16 sampai 20 Mbps, audio AAC 320 kbps.

### Tahap 9. Thumbnail, judul, deskripsi (1 hari)
1. Thumbnail: 1 karakter besar di kiri, elemen ikonik (singa, Hud-hud), judul emas 3D di kanan, subjudul di plakat merah. Buat 3 versi, uji A/B di YouTube Studio.
2. Judul: NAMA TOKOH dalam kapital + klaim besar + "Part 1".
3. Deskripsi ikuti kerangka Noor Occulta: hook pertanyaan, ringkasan, daftar poin yang dibahas, paragraf metodologi riset, ajakan support, referensi, catatan audio, catatan visual, kredit musik, hashtag.
4. Centang label **"altered or synthetic content"** di YouTube Studio karena visual dan sebagian audio sintetis.

### Tahap 10. Publikasi dan seri
1. Rilis tiap 2 sampai 3 minggu, hari dan jam tetap.
2. Buat 3 sampai 5 Shorts dari momen terbaik untuk mengarahkan ke episode panjang (Noor Occulta melakukan ini: Shorts "cincin Sulaiman", "jin dalam botol" rilis April, episode panjang rilis September).
3. Video pendek "sedang dipersiapkan" atau Behind The Scene di sela produksi untuk menjaga algoritma.

---

## 4. Kumpulan prompt siap pakai

Ganti bagian dalam kurung siku. Pakai bahasa Inggris untuk prompt gambar dan video karena modelnya lebih patuh.

### 4.1 Prompt riset (ChatGPT / Claude / Gemini)
```
Kamu adalah peneliti sejarah Islam yang teliti. Tokoh: [Nabi Sulaiman AS]. 
Buat tabel semua peristiwa hidupnya dengan kolom: Peristiwa | Sumber utama (surah:ayat atau kitab hadis + nomor) | Status (Al-Qur'an / hadis sahih / tafsir klasik / Israiliyat / diperselisihkan) | Catatan perbedaan riwayat.
Jangan mengarang sumber. Jika tidak yakin, tulis "perlu verifikasi". 
Urutkan kronologis. Bahasa Indonesia.
```

### 4.2 Prompt naskah narasi
```
Kamu penulis naskah dokumenter sinematik Islam untuk YouTube, gaya seperti narator film epik: kalimat pendek, jeda dramatis, suasana kuat, tidak menggurui.
Tulis naskah narasi Part 1 tentang [Nabi Sulaiman AS], durasi 22 menit (sekitar 3.000 kata).
Wajib:
- Buka dengan 1 pertanyaan hook, contoh gaya: "Bagaimana seorang nabi sekaligus raja dianugerahi kerajaan yang tak tertandingi?"
- Cakup peristiwa berikut secara berurutan: [daftar dari tabel riset].
- Kutip maksimal 8 ayat dengan terjemahan Kemenag, sebutkan surah dan ayat.
- Saat riwayat diperselisihkan, katakan secara jujur "sebagian ulama berpendapat...".
- Tandai pergantian adegan dengan [ADEGAN nn: lokasi, waktu, suasana].
- Tutup dengan hikmah 3 paragraf dan cliffhanger ke Part 2 tentang [Hud-hud dan Ratu Balqis].
Output: naskah saja, tanpa judul bagian selain tanda adegan.
```

### 4.3 Prompt shot list dari naskah
```
Berikut naskah dengan tanda [ADEGAN]. Pecah menjadi shot list untuk video AI.
Aturan: satu shot 5 sampai 8 detik narasi; variasikan wide, medium, close-up, detail; tulis untuk setiap shot:
No | Adegan | Kalimat narasi yang ditutupi | Deskripsi visual singkat (subjek, aksi, latar, cahaya) | Tipe shot | Gerakan kamera | Karakter | 
Tokoh nabi digambarkan [dari belakang / siluet / wajah lengkap] sesuai kebijakan channel.
Output dalam tabel CSV.
```

### 4.4 Prompt character bible
```
Buat deskripsi fisik tetap (character bible) untuk gambar AI, bahasa Inggris, 1 paragraf 60 sampai 80 kata per tokoh, konsisten dan spesifik (usia, bentuk wajah, rambut, janggut, warna kulit, pakaian dengan warna dan bahan, aksesori khas). 
Tokoh: Sulaiman muda (usia 20an), Daud (60an), penasihat istana, prajurit Bani Israil.
Era: Levant kuno sekitar 1000 SM, hindari pakaian Arab abad ke-7 dan hindari simbol modern.
```

### 4.5 Formula prompt gambar (Midjourney / Leonardo / Flux)
```
[TIPE SHOT], [KARAKTER dari character bible], [AKSI], [LATAR dari location bible], [CAHAYA dan WAKTU], [STYLE GUIDE global], [PARAMETER]
```
Contoh 1, wide establishing:
```
Epic wide establishing shot, ancient Jerusalem palace of King David at dawn, limestone walls, cedar wood columns, morning mist over the valley, golden hour light, cinematic photoreal, 35mm anamorphic, volumetric light, muted warm palette, highly detailed --ar 16:9 --style raw
```
Contoh 2, medium dengan tokoh (wajah terlihat, pakai reference):
```
Medium shot, young Solomon (mid-20s, long dark wavy hair, short beard, bronze skin, embroidered deep maroon robe with gold trim, thin gold circlet), standing in a stone courtroom listening to two farmers arguing, dust in sunbeams, warm afternoon light, cinematic photoreal, 35mm, shallow depth of field --ar 16:9 --oref [URL gambar referensi] --ow 100
```
Contoh 3, kuda-kuda pilihan (Surah Sad):
```
Low angle wide shot, dozens of magnificent Arabian war horses galloping across a sunlit plain at late afternoon, dust clouds glowing gold, riders in ancient Israelite armor, epic scale, cinematic photoreal, motion blur, anamorphic lens flare --ar 16:9
```
Contoh 4, angin dan jin (abstrak, tanpa wajah jin):
```
Wide shot from behind, a robed king standing on a high stone terrace as a powerful wind bends the trees and lifts banners, faint towering shadowy silhouettes of giant builders in the desert haze far away, dramatic storm light, cinematic photoreal, awe and mystery --ar 16:9
```
Negative prompt (Leonardo / Flux): `text, watermark, logo, extra fingers, deformed hands, modern clothing, cars, cross, crescent symbol, blurry, cartoon`

### 4.6 Prompt video (image-to-video di Kling / Veo / Hailuo)
Prompt video hanya berisi **gerakan**, bukan deskripsi ulang gambar.
```
Slow push-in, subject turns head slightly and breathes, hair and cloth move in gentle wind, dust particles drift in light, cinematic, stable camera, no morphing
```
```
Slow aerial drone pull-back revealing the palace and valley, mist drifting, birds crossing frame, steady, cinematic
```
```
Handheld tracking shot following the horses, dust kicking up, camera slightly shaking, high energy
```
Tambahkan di Kling: negative `distortion, extra limbs, morphing face, flicker`. Durasi 5 detik untuk close-up, 10 detik untuk wide.

### 4.7 Prompt arahan suara (ElevenLabs v3 mendukung tag emosi)
```
[calm, deep, storytelling tone] Bagaimana seorang nabi sekaligus raja... [pause] dianugerahi kerajaan yang tak tertandingi? [slow] Inilah kisah Nabi Sulaiman 'alaihissalam.
```
Setting: Stability 45, Similarity 80, Style 15, Speaker boost on. Model Multilingual v2 atau v3, bahasa Indonesia.

### 4.8 Prompt thumbnail
```
YouTube thumbnail composition, 16:9, left third: majestic bearded king in ornate bronze armor and maroon robe seated beside a giant white lion, right third empty sky and distant palace for text, a hoopoe bird on a rock, dramatic golden light, ultra detailed, cinematic photoreal --ar 16:9
```
Lalu tambahkan teks di Canva: judul kapital font serif tebal warna emas dengan bevel, subjudul di plakat merah gelap.

### 4.9 Prompt deskripsi YouTube
```
Tulis deskripsi YouTube bahasa Indonesia dengan struktur: 1 paragraf hook pertanyaan; 1 paragraf ringkasan; kalimat "Video ini merupakan BAGIAN PERTAMA..."; daftar poin "Pada bagian ini kita akan melihat:"; paragraf metodologi riset dan disclaimer bahwa detail dialog dan suasana adalah ilustrasi naratif; ajakan like, komentar hikmah, subscribe; "Referensi Utama Riset Naskah" (daftar); "Catatan Audio"; "Catatan Visual"; kredit musik; 10 hashtag.
Bahan: [tempel naskah dan tabel riset].
```

---

## 5. Estimasi waktu (ESTIMASI, jujur)

Untuk satu episode 20 sampai 25 menit, sekitar 250 klip, kualitas seperti Noor Occulta.

| Tahap | Solo, pertama kali | Solo, sudah lancar | Tim 2 orang, lancar |
|---|---|---|---|
| Riset | 3 hari | 2 hari | 2 hari |
| Naskah | 5 hari | 3 hari | 3 hari |
| Shot list dan character bible | 3 hari | 2 hari | 1 hari |
| Gambar (sekitar 1.000 generate) | 6 hari | 4 hari | 3 hari |
| Video (500 sampai 750 generate) | 8 hari | 5 hari | 4 hari |
| Voice over | 2 hari | 1 hari | 1 hari |
| Editing, musik, subtitle | 7 hari | 5 hari | 4 hari |
| Thumbnail, deskripsi, QC | 2 hari | 1 hari | 1 hari |
| **Total hari kerja** | **36 hari (7 minggu)** | **23 hari (4 sampai 5 minggu)** | **19 hari kalender, 2 orang paralel: sekitar 2 sampai 3 minggu** |
| **Total jam kerja** | sekitar 180 sampai 220 jam | sekitar 120 sampai 150 jam | sekitar 120 sampai 150 jam dibagi 2 |

Angka tim 2 orang cocok dengan bukti nyata: Noor Occulta merilis episode panjang tiap 2 sampai 3 minggu, dan naskah Kilic Ali Pasa dari "sedang dimatangkan" ke rilis memakan 3 minggu.

Yang paling sering membuat molor: klip video yang gagal (wajah berubah, tangan rusak) dan revisi naskah setelah visual sudah dibuat. Kunci naskah dulu sebelum generate apa pun.

---

## 6. Link kursus dan bahan belajar

**Kursus terstruktur (Inggris)**
- Curious Refuge, kursus gratis pengantar AI filmmaking: https://curiousrefuge.com/start-here
- Curious Refuge, AI Filmmaking (kursus utama): https://curiousrefuge.com/ai-filmmaking
- Curious Refuge, Advanced AI Filmmaking 2.0: https://curiousrefuge.com/advanced-ai-filmmaking
- Curious Refuge, AI Documentary (paling dekat dengan format Noor Occulta): https://curiousrefuge.com/ai-documentary
- Semua kursus Curious Refuge: https://curiousrefuge.com/courses (membership sekitar USD 149/bln, akses semua kursus)
- Udemy, topik Filmmaking (cari "AI filmmaking", sering diskon USD 10 sampai 20): https://www.udemy.com/topic/filmmaking/
- Udemy, topik AI (bahasa Indonesia tersedia sebagian): https://www.udemy.com/id/topic/artificial-intelligence/

**Tutorial YouTube berbahasa Indonesia (gratis, format kisah nabi dengan AI)**
- Cara Buat Konten Kisah Nabi Pakai AI yang Cepat Viral & Bisa Monetisasi (Maret 2026): https://www.youtube.com/watch?v=0TObKwQ5-Sk
- CUMA 1 VIDEO KISAH NABI LANGSUNG MONET! Full Panduan AI + FREE PROMPT: https://www.youtube.com/watch?v=FZB78K9WtGo
- Tutorial Cara Buat Video Kisah Nabi Menggunakan AI: https://www.youtube.com/watch?v=utpfVcQ47z0
- Cara membuat gambar ilustrasi dan animasi kisah sahabat: https://www.youtube.com/watch?v=UF8Q_bMOnHk

**Dokumentasi resmi tools**
- Kling AI, panduan memilih generator video 2026: https://kling.ai/blog/best-ai-video-generator-2026-kling-ai
- Google Flow (Veo): https://labs.google/flow
- ElevenLabs docs: https://elevenlabs.io/docs
- Midjourney docs (Omni Reference, parameter): https://docs.midjourney.com
- Panduan karakter konsisten di video AI: https://elements.envato.com/learn/ai-video-consistent-character
- Panduan alur produksi film AI 2026: https://www.imagine.art/blogs/ai-filmmaking-guide
- Workflow naskah ke storyboard ke film: https://mstudio.ai/blog/ai-filmmaking/script-to-storyboard-to-film-ai-workflow

Catatan: saya tidak menemukan kursus berbayar berbahasa Indonesia yang khusus membahas film AI panjang dengan kualitas terverifikasi. Tutorial YouTube di atas gratis dan membahas format yang sama, tapi kualitas isinya belum saya verifikasi satu per satu.

---

## 7. Hal penting sebelum mulai

1. **Penggambaran wajah nabi.** Banyak ulama melarang menggambarkan wajah nabi. Noor Occulta menampilkan wajah di thumbnail, dan itu keputusan mereka. Alternatif yang lebih aman untuk penonton Indonesia: nabi selalu dari belakang, siluet, atau dengan cahaya menutupi wajah. Tentukan di awal karena ini memengaruhi semua prompt.
2. **Kebijakan monetisasi YouTube 2025 ke atas** menolak konten "tidak autentik" yang diproduksi massal. Yang membuat channel seperti ini lolos: naskah orisinal hasil riset, narasi dengan suara sendiri, editing manual, dan nilai edukasi. Jangan pakai template naskah yang sama berulang.
3. **Label konten sintetis** wajib dicentang saat upload.
4. **Kredit musik** wajib ditulis di deskripsi untuk musik gratis seperti Infraction dan Cold Cinema. Simpan bukti lisensinya.
5. **Disclaimer** riwayat yang diperselisihkan, seperti yang Noor Occulta tulis, melindungi kamu dari komentar dan laporan.
6. **Backup**: semua gambar, klip, dan naskah simpan di Google Drive per episode. Kamu akan butuh karakter yang sama lagi di Part 2.
