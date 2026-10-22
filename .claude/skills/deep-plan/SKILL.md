---
name: deep-plan
description: Transforms a spec (bisa dari deep-project atau dokumen apapun) menjadi implementation plan yang lengkap, terstruktur, dan siap dieksekusi. Gunakan setelah deep-project selesai, atau kapanpun ada satu komponen yang sudah cukup terdefinisi dan siap direncanakan secara detail. Skill ini menghasilkan: research findings, synthesized spec, full implementation plan, test stubs, dan section files yang terpecah dan terurut.
---

# Deep Plan — Full Implementation Planning

Tujuan skill ini: **dari spec yang ada, hasilkan implementation plan yang cukup lengkap sehingga siapapun (atau AI manapun) bisa memulai implementasi tanpa harus bertanya-tanya lagi.**

Prosesnya:
```
Baca Spec → Research → Interview → Synthesize → Write Plan → Self-Review → TDD → Section Split
```

---

## Prasyarat

Skill ini membutuhkan **satu buah spec file** sebagai input — bisa berupa:
- `spec.md` yang dihasilkan dari skill `deep-project`
- Dokumen requirements yang sudah ada
- Bahkan catatan singkat yang sudah cukup terdefinisi

Jika tidak ada spec file, minta user membuatnya terlebih dahulu atau jalankan skill `deep-project` dulu.

---

## Fase 0: Setup & Validasi Input

Konfirmasi input yang diterima:

```
Baik, saya akan membuat implementation plan untuk:
[Nama/judul spec yang diterima]

Lokasi output: [direktori yang sama dengan spec, atau direktori yang sesuai konvensi project]

Fase yang akan dijalankan:
1. Research (codebase + konteks yang relevan)
2. Interview (klarifikasi yang masih dibutuhkan)
3. Spec Synthesis
4. Implementation Plan
5. Self-Review
6. TDD Stubs
7. Section Splitting

Mulai?
```

Tentukan `planning_dir` — direktori tempat semua output akan disimpan. Defaultnya adalah direktori yang sama dengan spec file input.

---

## Fase 1: Research

**Tujuan:** Sebelum menulis rencana, pahami konteks yang sudah ada — jangan reinvent yang sudah ada di codebase.

### 1a. Codebase Research

Pindai bagian-bagian codebase yang relevan dengan spec ini:
- Apakah ada pattern serupa yang sudah diimplementasi?
- Apakah ada abstraksi/utility yang bisa dipakai ulang?
- Apakah ada constraint di level arsitektur yang harus dipatuhi?
- Bagaimana struktur folder, naming convention, dan layer separation yang berlaku?

Tulis temuan ke `[planning_dir]/research-codebase.md`.

### 1b. Tanya tentang Web Research

Tanyakan ke user:

```
Apakah ada topik teknis yang perlu saya riset sebelum membuat plan?

Misalnya:
- Library/framework yang belum familiar?
- Best practice untuk pola tertentu?
- Integrasi dengan layanan eksternal?

[Ya, riset ini: ___] / [Tidak perlu, lanjutkan]
```

Jika ada, lakukan web research menggunakan tool yang tersedia dan tulis hasilnya ke `[planning_dir]/research-web.md`.

Gabungkan semua research ke `[planning_dir]/claude-research.md`.

---

## Fase 2: Interview — Permukaan yang Belum Tertulis

**Tujuan:** Spec tidak pernah 100% lengkap. Interview ini untuk menemukan asumsi tersembunyi, edge case, dan keputusan yang belum dibuat.

Ajukan pertanyaan satu per satu atau dalam kelompok kecil yang terkait. Fokus pada hal-hal yang **belum terjawab oleh spec dan research**.

### Area yang perlu diperjelas

**Tentang perilaku sistem:**
- Apa yang terjadi jika X gagal? Apakah silent fail, error message, atau rollback?
- Bagaimana sistem berperilaku dalam kondisi concurrent? Apakah perlu locking?
- Apakah ada batasan performa yang harus dipenuhi?

**Tentang integrasi:**
- Bagaimana ini berinteraksi dengan bagian sistem yang sudah ada?
- Apakah ada breaking change pada interface yang sudah dipakai pihak lain?
- Siapa konsumen dari output komponen ini?

**Tentang scope:**
- Apa yang dengan sengaja TIDAK termasuk dalam iterasi ini?
- Adakah fitur yang "nice to have" yang harus diidentifikasi secara eksplisit agar tidak creep masuk?

**Tentang keputusan teknis:**
- Apakah ada keputusan arsitektur yang harus dibuat di sini? (pilihan library, approach, pattern)
- Adakah trade-off yang user perlu sadar sebelum implementasi dimulai?

Stop interview ketika tidak ada lagi pertanyaan kritis yang jawabannya akan mengubah rencana implementasi secara signifikan.

Tulis transcript ke `[planning_dir]/claude-interview.md`.

---

## Fase 3: Spec Synthesis

**Tujuan:** Gabungkan spec awal + research + interview menjadi satu dokumen yang koheren.

Tulis ke `[planning_dir]/claude-spec.md`:

```markdown
# Synthesized Spec: [Nama Komponen]

## Problem Statement
[Masalah apa yang dipecahkan, dan mengapa ini penting]

## Goals
[Apa yang harus dicapai, terukur jika mungkin]

## Non-Goals (Explicit Exclusions)
[Apa yang sengaja tidak termasuk]

## Context & Constraints
[Constraint dari arsitektur, codebase existing, atau keputusan bisnis]

## Key Decisions Made
[Keputusan teknis yang sudah disepakati selama interview]

## Assumptions
[Asumsi yang diambil — jika asumsi ini salah, plan harus direvisi]

## Open Questions (jika masih ada)
[Hal yang masih ambigu dan akan ditandai di plan]
```

---

## Fase 4: Implementation Plan

**Tujuan:** Dokumen prose yang fully self-contained — siapapun yang membacanya harus bisa memahami *apa* yang dibangun, *mengapa*, dan *bagaimana*, tanpa harus membaca kode atau bertanya.

**Aturan penting:**
- Plan ditulis sebagai **prose**, bukan sebagai daftar kode
- **TIDAK ADA implementasi kode lengkap** — itu tugas fase implementasi
- Pseudocode boleh, tapi hanya untuk menjelaskan logic yang kompleks
- Tulis untuk pembaca yang tidak familiar dengan konteks diskusi kita

Tulis ke `[planning_dir]/claude-plan.md`:

```markdown
# Implementation Plan: [Nama Komponen]

## Overview
[Ringkasan 1 paragraf tentang apa yang dibangun dan bagaimana pendekatannya]

## Architecture
[Gambaran keseluruhan: komponen apa saja, bagaimana hubungannya, data flow utama]

## Implementation Steps

### Step 1: [Nama Step]
**What:** [Apa yang dilakukan]
**Why:** [Mengapa ini perlu dan mengapa dengan cara ini]
**How:** [Pendekatan teknis — prose, bukan kode]
**Files affected:** [File yang dibuat/dimodifikasi]
**Dependencies:** [Step lain atau kondisi yang harus terpenuhi dulu]

### Step 2: [Nama Step]
...

## Edge Cases & Error Handling
[Edge case yang sudah diidentifikasi dan bagaimana cara mengatasinya]

## Integration Points
[Bagaimana komponen ini berinteraksi dengan bagian sistem lain]

## Migration / Compatibility Notes
[Jika ada breaking change atau migration yang perlu dilakukan]

## Open Questions (jika ada)
[Hal yang masih ambigu — tandai agar tidak terlewat saat implementasi]
```

---

## Fase 5: Self-Review

**Tujuan:** Tinjau plan yang baru ditulis dari perspektif kritis sebelum diserahkan ke user.

Lakukan review internal dan tanyakan:

1. **Completeness:** Apakah setiap step cukup jelas untuk dieksekusi tanpa informasi tambahan?
2. **Consistency:** Apakah ada kontradiksi antar step?
3. **Risk:** Apakah ada step yang berisiko tinggi yang perlu flagged?
4. **Gaps:** Apakah ada glue code atau plumbing yang terlupakan?
5. **Assumptions:** Apakah semua asumsi sudah eksplisit?

Update `claude-plan.md` jika ada yang perlu diperbaiki.

Kemudian tunjukkan plan ke user:

```
Plan sudah selesai. Anda bisa review claude-plan.md sekarang.

Jika ada yang ingin diubah, sampaikan dan saya akan update sebelum lanjut ke TDD dan section splitting.

[Lanjutkan] / [Ada yang perlu direvisi: ___]
```

Tunggu konfirmasi sebelum lanjut.

---

## Fase 6: TDD Stubs

**Tujuan:** Definisikan test stubs sebelum implementasi dimulai — ini membantu memastikan setiap bagian plan punya definisi "done" yang konkret.

Tulis ke `[planning_dir]/claude-plan-tdd.md`:

Untuk setiap step di implementation plan, tulis:

```markdown
## Tests for: [Nama Step]

### Happy Path
- [ ] [Deskripsi test: kondisi normal yang harus work]
- [ ] ...

### Edge Cases
- [ ] [Deskripsi test: edge case yang sudah diidentifikasi]
- [ ] ...

### Error Cases
- [ ] [Deskripsi test: kondisi error dan expected behavior]
- [ ] ...
```

**Catatan:** Ini adalah test *stubs*, bukan implementasi test. Tulis dalam bahasa natural, bukan kode — kode test akan ditulis saat implementasi.

---

## Fase 7: Section Splitting

**Tujuan:** Pecah implementation plan menjadi unit-unit yang bisa dikerjakan secara mandiri — setiap section harus self-contained dan tidak bergantung pada section lain yang belum selesai (kecuali yang memang sequentially dependent).

### Kriteria Section yang Baik

- Bisa diselesaikan dalam satu sesi kerja yang fokus
- Punya definisi "done" yang jelas
- Tidak terlalu kecil (trivial) atau terlalu besar (overwhelming)
- Dependency antar section eksplisit

### Buat Section Index

Tulis `[planning_dir]/sections/index.md`:

```markdown
# Section Index: [Nama Komponen]

## Execution Order
[Urutan yang direkomendasikan dan alasannya]

## Sections

| # | File | Deskripsi | Depends On | Parallelizable? |
|---|------|-----------|------------|-----------------|
| 01 | section-01-[nama].md | [Apa yang dilakukan] | - | - |
| 02 | section-02-[nama].md | [Apa yang dilakukan] | 01 | No |
| 03 | section-03-[nama].md | [Apa yang dilakukan] | 01 | Yes (with 04) |
...
```

### Tulis Setiap Section File

Untuk setiap section, buat `[planning_dir]/sections/section-[nn]-[nama].md`:

```markdown
# Section [nn]: [Nama]

## Context
[Apa yang sudah selesai sebelum section ini dimulai]

## Objective
[Apa yang harus selesai di akhir section ini]

## Prerequisites
- Section(s) yang harus selesai dulu: [list atau "none"]
- Files/modules yang harus sudah tersedia: [list atau "none"]

## Implementation Steps
[Detail langkah-langkah — prose, spesifik, actionable]

## Files to Create/Modify
- `[path/ke/file]` — [apa yang dilakukan pada file ini]
- ...

## Test Stubs (dari TDD plan)
[Copy test stubs yang relevan dari claude-plan-tdd.md]

## Definition of Done
- [ ] [Kriteria konkret yang menandai section ini selesai]
- [ ] Semua test stubs di section ini sudah diimplementasi dan passing
- [ ] Tidak ada regression pada section sebelumnya
```

---

## Fase 8: Summary

```
✅ Deep Plan selesai.

Output yang dihasilkan:
- [planning_dir]/claude-research.md     — Research findings
- [planning_dir]/claude-interview.md    — Interview transcript
- [planning_dir]/claude-spec.md         — Synthesized specification
- [planning_dir]/claude-plan.md         — ★ Implementation plan (main deliverable)
- [planning_dir]/claude-plan-tdd.md     — Test stubs
- [planning_dir]/sections/index.md      — Section index & execution order
- [planning_dir]/sections/section-01-[nama].md
- [planning_dir]/sections/section-02-[nama].md
  ...

Langkah selanjutnya:
1. Review claude-plan.md — apakah sudah sesuai ekspektasi?
2. Mulai implementasi dari section pertama: sections/section-01-[nama].md
3. Setiap section adalah unit kerja yang mandiri — bisa dikerjakan satu per satu
   atau section yang parallelizable bisa dikerjakan bersamaan.
```

---

## Prinsip Utama

1. **Plan adalah prose, bukan kode.** Resistensi terhadap keinginan menulis implementasi langsung adalah inti dari skill ini. Kode bisa berubah; reasoning di balik kode jauh lebih berharga untuk didokumentasikan.

2. **Self-contained.** Setiap output dokumen harus cukup informatif sehingga orang yang tidak ikut dalam diskusi kita pun bisa memahami konteksnya.

3. **Explicit over implicit.** Lebih baik menuliskan asumsi yang ternyata benar daripada meninggalkan asumsi tak tertulis yang ternyata salah.

4. **Review sebelum lanjut.** Jangan skip ke section splitting sebelum user sudah mereview dan menyetujui plan. Waktu yang diinvestasikan untuk review di sini jauh lebih murah daripada rework setelah implementasi.

5. **Sections harus actionable.** Setiap section file harus cukup jelas sehingga bisa langsung dieksekusi oleh implementor — tanpa harus baca ulang seluruh plan atau bertanya tentang konteks.
