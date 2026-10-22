---
name: deep-project
description: Breaks down vague feature ideas or system concepts into well-scoped, individually plannable components through structured AI-led interviews. Use this skill whenever the user describes something broadly — "saya mau tambah fitur X", "mau bikin sistem Y", "ada ide untuk Z" — especially when the request is multi-component, touches multiple layers of the stack, or feels too big to implement in one shot. Also use this when the user seems uncertain about scope, or when you suspect their idea has gaps or hidden complexity worth surfacing before coding starts.
---

# Deep Project — Idea Decomposition

Tujuan skill ini sederhana: **jangan mulai coding sampai idenya benar-benar dipahami bersama.**

Prosesnya:
```
Terima Konteks → Interview → Split Analysis → Dependency Mapping → Konfirmasi → Spec Generation
```

---

## Fase 0: Terima Konteks Awal

Baca semua konteks yang sudah diberikan. Sebelum mengajukan pertanyaan apapun, tunjukkan bahwa kamu sudah memahami gambaran besarnya:

```
Baik, saya sudah baca idenya. Sebelum kita mulai, izinkan saya konfirmasi 
pemahaman awal saya:

[Ringkasan 2-3 kalimat dengan kata-katamu sendiri]

Ada yang kurang tepat?
```

Baru setelah dikonfirmasi, masuk ke Fase 1.

---

## Fase 1: Interview — Gali Sampai Dalam

Tujuannya bukan mengisi checklist — tapi membangun pemahaman yang *nyata*. Ajukan pertanyaan satu per satu atau dalam kelompok kecil yang terkait. Jangan dump 10 pertanyaan sekaligus.

### Dimensi yang perlu dipahami

**1. Siapa yang terlibat?**
- Siapa yang menggunakan fitur ini? (user type, role, persona)
- Apakah ada perbedaan akses atau pengalaman antar tipe user?

**2. Apa yang terjadi pada data?**
- Data apa yang masuk, diproses, dan keluar?
- Apakah ada state / status yang berubah?
- Siapa yang bisa trigger perubahan itu?
- Apa yang terjadi jika ada error atau kondisi edge case?

**3. Apa yang berubah di sistem?**
- Apakah ini perlu tabel/model baru, atau modifikasi yang sudah ada?
- Apakah ini perlu endpoint/API baru?
- Apakah ada perubahan di permission / autentikasi?
- Apakah ini menyentuh logic bisnis yang sudah ada?

**4. Apa batasannya?**
- Apa yang *wajib* ada di versi pertama?
- Apa yang bisa ditunda ke iterasi berikutnya?
- Ada dependensi ke fitur lain yang belum jadi?

**5. Apa yang tidak terpikirkan?**
- Apa yang terjadi kalau X gagal?
- Bagaimana jika dua user melakukan hal yang sama bersamaan?
- Apakah ada kasus sudut yang bisa melanggar logika utama?

### Cara bertanya yang baik

- Mulai dari pertanyaan yang paling menentukan arah arsitektur
- Kalau jawabannya sudah jelas dari konteks, skip
- Kalau user menjawab terlalu singkat, probe lebih dalam
- Kalau kamu menemukan celah atau kontradiksi, sampaikan langsung:

```
Menarik — saya perhatikan ada potensi masalah di sini:
[Ceritakan celahnya]
Bagaimana menurut Anda cara terbaik mengatasinya?
```

Stop interview ketika kamu sudah punya cukup untuk mengusulkan split yang masuk akal.

---

## Fase 2: Split Analysis

Evaluasi apakah ide ini perlu dipecah menjadi komponen terpisah.

### Kapan perlu split?

Pecah jika dua atau lebih kondisi ini terpenuhi:
- Menyentuh lebih dari satu domain teknis yang berbeda secara signifikan
- Ada bagian yang bisa dikerjakan secara independen tanpa memblokir yang lain
- Ada bagian yang memiliki risiko atau kompleksitas yang sangat berbeda
- Satu "fitur" sebenarnya adalah beberapa fitur yang kebetulan disebutkan bersama

### Kapan tidak perlu split?

Tetap satu unit jika:
- Semua bagian sangat saling bergantung
- Scope sudah kecil dan terdefinisi jelas
- Memecahnya justru menciptakan overhead koordinasi yang tidak perlu

### Presentasi ke user

```
Berdasarkan diskusi kita, ide ini paling baik dipecah menjadi [N] komponen:

1. [Nama Komponen] — [1 kalimat penjelasan]
   Domain: [backend / frontend / DB / auth / dll]
   Bisa independen? [Ya / Tidak, butuh komponen X dulu]
   
2. [Nama Komponen] — ...

[ATAU jika tidak perlu split:]
"Ini cukup sebagai satu unit karena [alasan]."

Apakah struktur ini masuk akal?
```

---

## Fase 3: Dependency Mapping

Untuk setiap komponen, petakan:
- Apa yang **harus selesai lebih dulu** sebelum komponen ini bisa dikerjakan?
- Apa yang **dihasilkan** komponen ini dan dibutuhkan komponen lain?
- Apakah ada **shared contract** (tipe, schema, interface) yang perlu disepakati lintas komponen?

Hasilkan urutan eksekusi yang direkomendasikan beserta alasannya.

---

## Fase 4: Konfirmasi User

Jangan lanjut ke spec generation tanpa persetujuan eksplisit. Presentasikan hasil analisis lengkap:

```
Berikut ringkasan hasil analisis:

KOMPONEN:
1. [nama] — [deskripsi singkat]
2. [nama] — ...

URUTAN YANG DIREKOMENDASIKAN:
[Komponen A] → [Komponen B] → ...
(Karena: [alasan])

ASUMSI YANG KITA BUAT:
- [asumsi 1]
- [asumsi 2]

YANG DITUNDA KE ITERASI BERIKUTNYA:
- [fitur/detail yang sengaja dilewati]

Ada yang ingin diubah sebelum saya buat spec-nya?
```

Jika ada perubahan yang diminta, update analisis dan presentasikan ulang.

---

## Fase 5: Spec Generation

Untuk setiap komponen, buat file spec. Simpan di lokasi yang sesuai dengan konvensi project (misalnya `docs/specs/`, `planning/`, atau di root — ikuti struktur yang sudah ada di repo).

Namai file dengan format: `[nn]-[nama-komponen]/spec.md` (contoh: `01-auth-system/spec.md`)

### Template Spec File

```markdown
# Spec: [Nama Komponen]

## Overview
[Apa yang dilakukan komponen ini — 2-3 kalimat]

## Background / Konteks
[Mengapa ini dibutuhkan. Masalah apa yang dipecahkan]

## User Stories
- Sebagai [tipe user], saya ingin [melakukan X], agar [tujuan Y]
- ...

## Scope — Termasuk
- [Hal yang masuk dalam komponen ini]

## Scope — Tidak Termasuk  
- [Hal yang sengaja ditunda / di luar scope]

## Perubahan yang Diperlukan
### Data / Model / Schema
[Tabel, kolom, atau model baru/dimodifikasi]

### API / Endpoints / Server Functions
[Endpoint baru atau yang dimodifikasi]

### UI / Frontend
[Halaman, komponen, atau alur baru]

### Logic / Business Rules
[Aturan bisnis yang perlu diimplementasi]

## Dependensi
- **Bergantung pada:** [komponen / fitur yang harus tersedia dulu]
- **Dibutuhkan oleh:** [komponen yang menunggu ini selesai]

## Definition of Done
- [ ] [kriteria 1]
- [ ] [kriteria 2]
- [ ] Error handling untuk semua failure mode yang diidentifikasi
- [ ] Sudah diuji untuk user type yang relevan

## Estimasi Kompleksitas
[Rendah / Sedang / Tinggi] — [alasan singkat]

## Catatan / Risiko
[Trade-off yang disadari, potensi blocker, hal yang masih ambigu]
```

---

## Fase 6: Summary & Next Steps

```
✅ Decomposition selesai.

Spec yang dibuat:
- [path/01-nama/spec.md]
- [path/02-nama/spec.md]
...

Urutan pengerjaan yang direkomendasikan:
1. [nama] — karena [alasan]
2. [nama] — bisa paralel setelah [kondisi]
...

Langkah selanjutnya:
- Review spec di atas — ada yang perlu direvisi?
- Kalau sudah siap, kita bisa langsung masuk ke planning/implementasi 
  komponen pertama.
```

---

## Prinsip Utama

1. **Jujur, bukan agreeable.** Kalau ada celah dalam ide user, sampaikan — bukan ditelan. Tugas kamu adalah membantu membangun sesuatu yang benar-benar akan berhasil, bukan menyenangkan hati.

2. **Generalize, jangan overfit.** Pertanyaan dan spec yang dihasilkan harus berguna bahkan jika detail spesifiknya sedikit berbeda. Hindari terlalu spesifik pada contoh yang sedang dibahas.

3. **Spec sebelum kode.** Output skill ini adalah pemahaman bersama yang terdokumentasi, bukan implementasi. Tahan godaan untuk langsung menulis kode.

4. **Berhenti ketika sudah cukup.** Interview tidak perlu exhaust semua kemungkinan. Berhenti ketika ada cukup informasi untuk mengusulkan split dan spec yang meaningful.
