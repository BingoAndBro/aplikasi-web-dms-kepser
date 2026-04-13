# Setup Guide — Persiapan Sebelum Implementasi

Dokumen ini menjelaskan langkah-langkah yang perlu Anda lakukan SEBELUM memulai Deep Implementasi.

---

## Langkah 1: Credential Supabase

### 1a. Buka Dashboard Supabase

1. Buka https://supabase.com/dashboard
2. Pilih project Anda
3. Buka **Settings** → **API**

### 1b. Salin Credential

Dari halaman API, salin 3 nilai berikut:

| Field | Dari Mana | Paste ke |
|-------|-----------|----------|
| `SUPABASE_URL` | **Project URL** | `.env` |
| `SUPABASE_ANON_KEY` | **Project API keys** → **anon/public** | `.env` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Project API keys** → **service_role** | `.env` |

> ⚠️ **PERINGATAN:** `SUPABASE_SERVICE_ROLE_KEY` adalah secret. Jangan pernah expose ke client-side (browser).

### 1c. Buat File `.env`

```bash
# Copy .env.example ke .env
cp .env.example .env
```

Buka file `.env` di VS Code, paste credential Anda.

---

## Langkah 2: Setup Supabase Database

### 2a. Link Project (jika belum)

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

> `<your-project-ref>` ada di dashboard Supabase → Settings → General → Reference ID

### 2b. Enable Email Auth

1. Buka https://supabase.com/dashboard → **Authentication** → **Providers**
2. Pastikan **Email** enabled
3. Matikan "Confirm email" jika Anda mau user langsung bisa login tanpa verifikasi email

---

## Langkah 3: Install Dependencies

Sebelum implementasi, pasang paket Supabase yang diperlukan:

```bash
pnpm add @supabase/ssr @supabase/supabase-js
pnpm add -D drizzle-orm drizzle-kit
pnpm add zod
```

---

## Langkah 4: Setup Drizzle Config

(Bagian ini akan ditangani saat implementasi, tapi perlu подготовка)

Pastikan Anda punya folder untuk schema:

```bash
mkdir -p src/lib/db
mkdir -p src/lib/schemas
```

---

## Checklist

```
SEBELUM LANJUT, PASTIKAN:

□ File .env sudah dibuat dengan credential Supabase yang benar
□ supabase link sudah terhubung ke project
□ Email Auth sudah enabled di Supabase Dashboard
□ Paket @supabase/ssr, @supabase/supabase-js, drizzle-orm, drizzle-kit, zod sudah terinstall
□ 'supabase --version' menampilkan versi
```

---

## Troubleshooting

### "supabase: command not found"
```bash
# Pastikan PATH sudah benar
# Jika pakai Scoop:
scoop reset supabase
```

### "Failed to connect to Supabase"
- Cek `SUPABASE_URL` di `.env` sudah benar
- Cek internet connection
- Cek project Supabase tidak dalam maintenance

### "Auth callback error"
- Pastikan `APP_URL` di `.env` sesuai dengan konfigurasi redirect URL di Supabase Dashboard

---

## Setelah Semua Selesai

Bilang saya "sudah selesai" atau "siap" → saya mulai Deep Implementasi Komponen 01.
