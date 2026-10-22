

---
name: deep-implement
description: Mengimplementasikan kode dari section files yang dihasilkan oleh skill deep-plan, dengan metodologi TDD, code review per section, dan git workflow. Gunakan setelah deep-plan selesai dan sections sudah ada, atau kapanpun ada section file yang siap diimplementasikan. Juga bisa digunakan untuk mengimplementasikan satu section spesifik tanpa harus menjalankan semua section sekaligus.
---

# Deep Implement — Section-by-Section Implementation

Tujuan skill ini: **eksekusi implementation plan dari deep-plan secara sistematis** — satu section per satu, dengan TDD, code review, dan git commit yang rapi di setiap langkah.

Alur kerja:
```
Baca Section → TDD (Write Tests First) → Implementasi → Code Review → Perbaiki → Commit → Lanjut ke Section Berikutnya
```

---

## Prasyarat

Skill ini membutuhkan **sections directory** dari output `deep-plan`, yaitu:
- `sections/index.md` — manifest yang berisi daftar sections dan urutannya
- `sections/section-NN-[nama].md` — satu file per section

Jika belum ada, jalankan skill `deep-plan` terlebih dahulu.

---

## Fase 0: Setup & Preflight

### 0a. Validasi Input

Konfirmasi input yang diterima. Jika tidak ada path ke sections directory, minta ke user:

```
Skill ini membutuhkan path ke sections directory dari deep-plan.

Contoh: sections/ (dari output deep-plan)

Harap berikan path ke direktori sections yang ingin diimplementasikan.
```

### 0b. Baca Section Index

Baca `sections/index.md` dan parse:
- Daftar semua sections yang ada (nama dan urutan)
- Dependency antar sections
- Sections mana yang sudah selesai (jika resume)

### 0c. Tentukan Target Directory

Target directory adalah tempat kode akan ditulis. Tanyakan ke user jika belum jelas:

```
Di mana kode harus ditulis?

1. [Root project saat ini] — Recommended jika sections dari project ini
2. Path lain: ___
```

### 0d. Cek Git Status

Jika project menggunakan git:

```bash
git status --short
git branch --show-current
```

**Jika ada uncommitted changes**, peringatkan user:
```
Perhatian: Working tree masih ada perubahan yang belum di-commit.
Ini bisa menyebabkan commit yang bercampur dengan implementasi baru.

Lanjutkan? [Ya] / [Tidak — saya akan commit/stash dulu]
```

**Jika di branch protected** (main, master, release/*), sarankan membuat feature branch:
```
Anda sedang di branch [nama]. Sebaiknya implementasi dilakukan di feature branch.

Lanjutkan di [nama]? [Ya] / [Tidak — saya buat branch baru dulu]
```

### 0e. Print Preflight Report

```
═══════════════════════════════════════════════════════════════
PREFLIGHT REPORT
═══════════════════════════════════════════════════════════════
Sections dir:   [path]
Target dir:     [path]
Branch:         [nama branch atau "bukan git repo"]
Working tree:   [Clean / Dirty (N files)]
Sections:       [N] ditemukan
Selesai:        [M] sudah done (jika resume)
═══════════════════════════════════════════════════════════════

Mulai implementasi?
```

---

## Loop Utama: Per Section

Ulangi langkah-langkah di bawah untuk setiap section yang belum selesai, dalam urutan sesuai `index.md`.

Sebelum memulai setiap section, tampilkan progress:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Section [NN]/[Total]: [nama-section]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### Langkah 1: Baca Section File

Baca `sections/section-NN-[nama].md` secara penuh. Pahami:
- **Objective** — apa yang harus dicapai
- **Prerequisites** — apa yang harus sudah tersedia
- **Implementation Steps** — langkah-langkah yang direncanakan
- **Files to Create/Modify** — file-file yang akan berubah
- **Test Stubs** — daftar test yang harus ada
- **Definition of Done** — kapan section ini dianggap selesai

Jika ada prerequisite section yang belum selesai, **stop dan warning**:
```
Section [NN] bergantung pada [section lain] yang belum selesai.
Selesaikan section tersebut terlebih dahulu.
```

---

### Langkah 1.5: Mandatory Domain Checks (Kewajiban Validasi)

Sebelum menulis kode implementasi untuk sebuah section, identifikasi DOMAIN dari section tersebut. Anda WAJIB menjalankan perintah `view_file` untuk membaca panduan berikut SEBELUM mulai melakukan modifikasi kode:

1. Jika section menyentuh UI/Frontend komponen: WAJIB baca `.claude/skills/ui-ux-pro-max/SKILL.md`
2. Jika section menyentuh status workflow dokumen, basis data, atau hak akses: WAJIB baca `.claude/skills/db-fsm-guard/SKILL.md`
3. Jika section menyentuh manipulasi data atau validasi input: WAJIB baca `.claude/skills/security-guidance/SKILL.md` dan `.claude/skills/error-handling-patterns/SKILL.md`

---

### Langkah 2: TDD — Write Tests First

Sebelum menulis implementasi apapun, tulis test-nya dulu.

Berdasarkan test stubs di section file:

1. **Buat skeleton** untuk file-file yang akan diimplementasi (hanya struktur dasar, fungsi kosong, import)
2. **Tulis test** berdasarkan test stubs:
   - Happy path tests
   - Edge case tests
   - Error/failure tests
3. **Jalankan tests** — ekspektasinya: **MERAH (gagal semua)**

Jika test langsung hijau tanpa implementasi, review test-nya — kemungkinan test tidak menguji hal yang benar.

```
✓ Tests ditulis: [N] test cases
✓ Tests dijalankan: [N] gagal (expected — implementasi belum ada)
```

---

### Langkah 3: Implementasi

Tulis implementasi berdasarkan implementation steps di section file.

**Prinsip:**
- Ikuti langkah yang sudah direncanakan di section file
- Jika ada hal yang ambigu, resolve dengan cara yang paling straightforward
- Jika ada sesuatu yang tidak bisa dilakukan seperti yang direncanakan, catat deviasi-nya
- Jangan gold-plate — implementasi sesuai scope section, tidak lebih

**Jalankan tests setelah implementasi:**

```bash
[perintah test yang relevan untuk project ini]
```

**Jika tests masih merah:**
1. Baca error message dengan cermat
2. Perbaiki implementasi (atau tests jika test-nya ternyata salah)
3. Ulangi — maksimal **3 kali percobaan**

**Jika setelah 3 kali masih gagal**, tanyakan ke user:

```
Tests masih gagal setelah 3 percobaan.

Error terakhir:
[error message]

Pilihan:
1. Saya review bersama Anda (show test + implementasi)
2. Skip section ini dan lanjut ke berikutnya
3. Stop — investigasi manual
```

**Jika tests hijau:**
```
✓ [N] tests passing
```

---

### Langkah 4: Stage Changes

Stage semua perubahan yang dibuat di section ini:

```bash
git add [file-file yang dibuat/dimodifikasi]
```

Tampilkan summary perubahan yang di-stage:
```
Files staged untuk commit:
  [+] path/ke/file-baru.ts  (baru)
  [M] path/ke/file-lama.ts  (dimodifikasi)
  ...
```

---

### Langkah 5: Code Review

Lakukan code review terhadap perubahan yang di-stage.

**5a. Generate diff**

Ambil diff dari staged changes:
```bash
git diff --staged
```

**5b. Review**

Tinjau diff dengan pertanyaan-pertanyaan berikut:

| Aspek | Pertanyaan |
|-------|-----------|
| **Correctness** | Apakah logikanya sudah benar? Ada bug yang terlihat? |
| **Security** | Apakah ada input yang perlu divalidasi? Ada injection risk? |
| **Edge Cases** | Apakah semua edge case yang ada di test stubs sudah ditangani? |
| **Consistency** | Apakah naming, pattern, dan style sudah konsisten dengan codebase? |
| **Simplicity** | Apakah ada yang bisa disederhanakan tanpa kehilangan fungsionalitas? |

**5c. Kategorikan temuan:**

Untuk setiap temuan, putuskan sendiri:
- **Auto-fix:** Obvious improvement, rendah risiko → langsung perbaiki
- **Tanya user:** Keputusan dengan trade-off nyata, security concern → tanyakan
- **Lewati:** Nitpick, preferensi style, bukan blocker → catat tapi tidak perlu diubah

Format pertanyaan ke user (hanya untuk yang perlu input):
```
Code review menemukan [N] hal yang perlu keputusan Anda:

1. [Deskripsi masalah]
   Konteks: [mengapa ini perlu diputuskan]
   Opsi:
   a) [opsi A] — [implikasinya]
   b) [opsi B] — [implikasinya]

2. ...

[Tidak ada yang perlu ditanyakan — semua sudah di-handle] (jika semuanya auto-fix atau lewati)
```

**5d. Simpan review notes**

Tulis catatan code review ke `[planning_dir]/code-reviews/section-NN-review.md` (buat folder jika belum ada):

```markdown
# Code Review: Section [NN] — [nama]

## Auto-fixes Applied
- [deskripsi fix yang langsung diterapkan]

## User Decisions
- [pertanyaan] → [keputusan user]

## Passed / No Action Needed
- [temuan yang dilewati dan alasannya]
```

---

### Langkah 6: Terapkan Perbaikan

Terapkan semua perbaikan — baik auto-fix maupun yang sudah diputuskan user:

1. Buat perubahan di code
2. Jalankan tests lagi — pastikan masih hijau setelah perbaikan
3. Re-stage file yang berubah

```
✓ Perbaikan diterapkan
✓ Tests masih passing: [N] tests
```

---

### Langkah 7: Update Section Documentation

Sebelum commit, update section file untuk mencerminkan apa yang **benar-benar** diimplementasikan (bukan hanya apa yang direncanakan):

Buka `sections/section-NN-[nama].md` dan update:
- File paths yang berbeda dari rencana awal
- Approach yang berubah akibat code review atau kendala teknis
- Test count aktual
- Deviasi dari rencana beserta alasannya

Ini penting agar section files tetap akurat sebagai dokumentasi dari apa yang dibangun.

---

### Langkah 8: Commit

Buat commit untuk section ini (satu commit per section):

Format commit message:
```
feat: implement section [NN] — [nama section]

- [ringkasan singkat apa yang diimplementasikan]
- [poin kedua jika ada]

Section: sections/section-NN-[nama].md
```

```bash
git commit -m "[pesan di atas]"
```

**Jika ada pre-commit hook yang memformat file:**
1. Re-stage file yang diformat
2. Retry commit (maksimal 2 kali)

**Jika commit gagal** karena lint error, tanyakan ke user:
```
Commit gagal karena: [error]

Pilihan:
1. Saya perbaiki error-nya terlebih dahulu
2. Bypass hooks untuk saat ini (git commit --no-verify)
3. Stop dan investigasi manual
```

**Jika berhasil:**
```
✓ Commit: [commit hash singkat] — section [NN] done
```

---

### Langkah 9: Context Check (Setiap 2 Section)

Setelah section ke-2, ke-4, ke-6, dst., pause sebentar:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Progress: [M]/[N] sections selesai
Commit terakhir: [hash]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Context sudah cukup panjang. Pilihan:

1. Lanjutkan (berisiko kehilangan context detail jika terlalu panjang)
2. Stop di sini — lanjutkan manual di sesi baru

Ketik "lanjut" untuk melanjutkan, atau stop dan mulai sesi baru.
```

---

### Langkah 10: Ulangi ke Section Berikutnya

Kembali ke **Loop Utama** untuk section berikutnya.

---

## Fase Final: Setelah Semua Section Selesai

Setelah semua sections di `index.md` selesai diimplementasikan:

### Generate Test & Verification Guide (WAJIB)

Setelah semua section selesai, buat file `TEST_VERIFICATION.md` di direktori yang sama dengan spec (bukan di planning_dir). File ini adalah **guide testing manual** untuk user setelah implementasi.

#### Format File: `TEST_VERIFICATION.md`

```markdown
# Test & Verification Guide: [Nama Komponen]

## Overview
[1-2 kalimat: komponen apa yang baru diimplementasikan]

## Prerequisites
- [Prasyarat sebelum testing, misal: app running di localhost:3000]
- [Login credentials yang dibutuhkan]

---

## Test Cases

### [TC-01] [Nama Test Case — happy path utama]

**Tujuan:** [Apa yang ingin diverifikasi]

**Langkah:**
1. [Langkah 1]
2. [Langkah 2]
3. [Langkah N]

**Ekspektasi:**
- [Hasil yang diharapkan di UI — harus terlihat X]
- [Data yang diharapkan tersimpan — harus ada Y di DB]

**Status:** ⬜ Belum diuji / ✅ Lulus / ❌ Gagal

---

### [TC-02] [Nama Test Case — edge case atau error case]

**Tujuan:** [Apa yang ingin diverifikasi]

**Langkah:**
1. [Langkah 1]
2. [Langkah 2 — termasuk kondisi error故意]
3. [Langkah N]

**Ekspektasi:**
- [Error message yang seharusnya muncul]
- [Data tidak tersimpan / status tetap X]

**Status:** ⬜ Belum diuji / ✅ Lulus / ❌ Gagal

---

[Ulangi TC-0X untuk setiap fitur yang diimplementasikan]

---

## Manual Verification Checklist

Setelah semua test cases dijalankan, isi checklist di bawah:

| # | Fitur | Tested | Pass | Fail | Catatan |
|---|-------|--------|------|------|---------|
| 1 | [Fitur 1] | ⬜ | ⬜ | ⬜ | [Catatan jika ada] |
| 2 | [Fitur 2] | ⬜ | ⬜ | ⬜ | |
| N | [Fitur N] | ⬜ | ⬜ | ⬜ | |

---

## Bug yang Ditemukan

| # | Deskripsi Bug | Severity | Status | Link |
|---|---------------|----------|--------|------|
| 1 | [Deskripsi] | High/Medium/Low | Open/Fixed | — |

---

## Sign-off

- **Tester:** _______________________
- **Tanggal:** _______________________
- **Hasil:** ⬜ Lolos / ⬜ Perlu Perbaikan
```

#### Cara Generate

1. Baca semua section files (`sections/section-*.md`) dan spec (`spec.md`)
2. Identifikasi setiap fitur/user flow yang diimplementasikan
3. Buat test case untuk setiap fitur:
   - **Happy path** — alur normal berhasil
   - **Error/edge case** — apa yang terjadi saat gagal atau kondisi khusus
   - **Role-specific** — tes untuk setiap role yang terlibat
4. Tulis langkah-langkah yang spesifik dan bisa diikuti orang lain
5. Simpan ke `[planning_dir]/TEST_VERIFICATION.md`

```
✓ TEST_VERIFICATION.md dibuat
  → [planning_dir]/TEST_VERIFICATION.md
```

---

### Final Verification

Jalankan full test suite sekali lagi untuk memastikan tidak ada regression:

```bash
[perintah test full suite]
```

Jika ada yang gagal — ini regression. Identifikasi section mana yang menjadi penyebab dan perbaiki.

### Generate Usage Notes

Buat `[planning_dir]/implementation-notes.md`:

```markdown
# Implementation Notes: [Nama Komponen]

## What Was Built
[Ringkasan singkat apa yang diimplementasikan]

## Files Created/Modified
[Daftar semua file yang berubah, dikelompokkan per section]

## How to Use
[Cara menggunakan/menjalankan apa yang baru dibangun]

## Known Deviations from Plan
[Jika ada yang berbeda dari rencana awal dan alasannya]

## Commits
[Daftar commit hash beserta section yang diwakilinya]
```

### Summary

```
╔═══════════════════════════════════════════════════════════════╗
║                   IMPLEMENTASI SELESAI ✅                     ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Sections: [N]/[N] selesai                                    ║
║  Tests:    [N] passing                                        ║
║  Commits:  [N] commits                                        ║
║                                                               ║
║  Files dibuat:     [N] file baru                              ║
║  Files dimodif:    [N] file diubah                            ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║  Langkah selanjutnya:                                         ║
║  1. Review TEST_VERIFICATION.md — jalankan semua test case   ║
║  2. Review implementation-notes.md                            ║
║  3. Jalankan integration/e2e tests jika ada                   ║
║  4. Code review manual jika diperlukan sebelum merge          ║
╚═══════════════════════════════════════════════════════════════╝
```

---

## Error Handling

### Tests Gagal Terus (> 3 percobaan)
Lihat Langkah 3 — tanyakan ke user: review bersama, skip, atau stop.

### Section File Tidak Ditemukan
```
Section file tidak ditemukan: sections/section-NN-[nama].md
Pastikan output deep-plan sudah lengkap sebelum menjalankan deep-implement.
```

### Git Commit Gagal Terus
Staged changes tetap aman. Beri instruksi cara commit manual:
```bash
git commit -m "feat: implement section NN — [nama]"
```

### Prerequisite Belum Selesai
Jangan lompat urutan. Sections yang dependen harus menunggu prerequisites-nya selesai.

---

## Prinsip Utama

1. **TDD, bukan afterthought.** Tests selalu ditulis sebelum implementasi. Ini bukan formalitas — ini cara memastikan kita benar-benar memahami apa yang harus dibangun sebelum mulai menulis kode.

2. **Satu section, satu commit.** Granularity ini membuat history git bisa ditelusuri — setiap commit punya satu tujuan yang jelas.

3. **Review, bukan audit.** Code review di sini bukan untuk mencari semua masalah yang mungkin ada. Fokus pada hal-hal yang benar-benar penting: correctness, security, dan consistency.

4. **Ikuti plan, tapi jangan buta.** Section file adalah panduan, bukan kitab. Jika saat implementasi menemukan cara yang lebih baik, deviasikan — tapi catat alasannya di section documentation.

5. **Stop lebih baik daripada asal jalan.** Jika ada test yang tidak bisa dipassing, atau ada ambiguitas yang tidak bisa diselesaikan sendiri, tanyakan ke user. Implementasi yang tergesa-gesa lebih mahal untuk difix daripada yang ditunda sebentar untuk klarifikasi.

6. **Test verification guide WAJIB dibuat.** Setelah semua section selesai, selalu buat `TEST_VERIFICATION.md` — ini guide manual untuk user agar tahu persis apa yang harus dicoba, langkah-langkahnya, dan ekspektasi hasilnya. Jangan skip langkah ini.
