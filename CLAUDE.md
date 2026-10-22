# CLAUDE.md

Aturan proyek lengkap ada di AGENTS.md:

@AGENTS.md

## Tentang repo ini

Repo pengembangan lanjutan DMS Kepser (privat), disalin dari repo skripsi
`BingoAndBro/skripsi-222212554` beserta riwayatnya. Repo skripsi sudah dikumpulkan
dan tidak boleh diubah; semua pengembangan baru dilakukan di sini.

- Kontribusi Claude (commit, PR, trailer sesi, branch `claude/`) diperbolehkan.
- `CLAUDE.md`, `AGENTS.md`, `.claude/`, `docs/`, `.graphifyignore` ikut di-commit supaya cloud session punya aturan, skill, spec, dan rencana yang sama dengan sesi lokal.
- Jangan meng-commit `.env*` (kecuali `*.example`), `graphify-out/`, `storage/`, dan `ngrok/*.yml`.
- Commit hanya bila diminta, atau bila menjalankan rencana (`deep-implement`) yang memang memerintahkan commit per section.

## Skill proyek (`.claude/skills/`)

- `db-fsm-guard` — wajib sebelum menyentuh DB, status dokumen/berkas, atau rute API yang mengubah data.
- `webapp-testing` — pola unit, integrasi, dan E2E.
- `security-guidance`, `error-handling-patterns` — keamanan dan penanganan galat.
- `designing-frontend`, `ui-ux-pro-max` — UI dengan shadcn/ui + Tailwind.
- `brainstorming`, `deep-project`, `deep-plan`, `deep-implement` — dari ide fitur sampai implementasi.

## graphify

Bila folder `graphify-out/` ada (dibuat lokal dengan `graphify`):
- Baca `graphify-out/GRAPH_REPORT.md` sebelum mencari di file sumber.
- Untuk pertanyaan lintas modul, pakai `graphify query "<pertanyaan>"`, `graphify path "<A>" "<B>"`, atau `graphify explain "<konsep>"`.
- Setelah mengubah kode, jalankan `graphify update .`.
