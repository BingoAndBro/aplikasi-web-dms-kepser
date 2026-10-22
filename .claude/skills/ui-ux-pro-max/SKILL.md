---
name: ui-ux-pro-max
description: "UI/UX design intelligence for TanStack Start web applications. Master guide for Shadcn/UI, Tailwind CSS, accessibility, layout, typography, and interaction patterns suited for the DMS project."
---

# UI/UX Pro Max - Design Intelligence (DMS Web Edition)

Comprehensive design guide tailored for **TanStack Start**, **shadcn/ui**, and **Tailwind CSS**. Contains strict UX guidelines, accessibility rules, performance optimizations, and component best practices specifically aimed at enterprise and data-heavy applications like the Document Workflow Management System (DMS).

## 📍 When to Apply

This Skill should be used whenever the task involves **UI structure, visual design decisions, interaction patterns, or user experience (UX) quality control**.

### Must Use

- Designing new Web Pages (Dashboard, Document Inbox, Admin Panel)
- Creating or refactoring UI components using `shadcn/ui`
- Implementing complex Web Forms (React Hook Form + Zod)
- Managing Tailwind visual hierarchy, spacing, and typography
- Reviewing UI code for accessibility (A11y), contrast, and layout shifts (CLS)
- Implementing TanStack Router navigation elements
- Handling SSR vs Client rendering behaviors smoothly

**Decision criteria**: If the task will change how a feature **looks, feels, moves, or is interacted with by the user** in the browser, MUST adhere to this Skill.

---

## 🎯 Quick Reference by Priority

### 1. Accessibility & Semantic HTML (CRITICAL)
- `focus-visible` - Gunakan ring focus bawaan shadcn (`focus-visible:ring-ring focus-visible:ring-offset-2`). Jangan pernah menghapus outline tanpa memberikan indikator fokus pengganti.
- `aria-labels` - Berikan `aria-label` untuk icon-only buttons (misal: tombol close `X`).
- `keyboard-nav` - Pastikan element yang interaktif selalu menggunakan `<button>` atau `<Link>`, BUKAN `<div onClick={...}>`.
- `contrast-ratio` - Patuhi WCAG 4.5:1. Hindari teks abu-abu yang terlalu tipis di atas latar terang.
- `semantic-tags` - Gunakan `<header>`, `<main>`, `<nav>`, `<aside>`, `<section>` daripada menggunakan `<div>` untuk segalanya.

### 2. Interaction & State Feedback (CRITICAL)
- `hover-vs-tap` - Semua elemen *clickable* harus memiliki `hover:` state (misal `hover:bg-accent` atau `hover:opacity-80`).
- `loading-buttons` - Selalu disable `<Button>` saat form sedang disubmit. Tambahkan ikon *spinner* dari `lucide-react` (`<Loader2 className="animate-spin" />`).
- `cursor-pointer` - Tailwind utility `cursor-pointer` otomatis ada di button, namun untuk elemen netral yang merespon klik (misal baris tabel), pastikan ada interaktivitas sentuh.
- `toast-feedback` - Gunakan *Toast* (`sonner` / komponen bawaan shadcn) setiap kali ada mutasi database yang berhasil/gagal (Submit Dokumen, Approve, Reject).

### 3. Layout & Responsive (HIGH)
- `mobile-first` - Desain `className` dari mobile dulu, lalu override untuk desktop dengan `md:` atau `lg:`. (contoh: `flex-col md:flex-row`).
- `container-width` - Gunakan `container mx-auto max-w-7xl` untuk menjaga halaman tetap proporsional di layar ultrawide.
- `z-index-management` - Gunakan struktur z-index standar: Navigasi (40), Modal/Dialog (50), Popover/Dropdown (50), Toast (100).
- `spacing-rhythm` - Gunakan *Tailwind spacing scale* secara konsisten. Margin/Padding harus kelipatan 4 (`gap-4`, `p-6`, `mb-8`).

### 4. Style Selection: Shadcn/UI & Tailwind (HIGH)
- `semantic-colors` - JANGAN gunakan *hardcoded color* seperti `bg-gray-100` atau `text-blue-500`. Selalu gunakan *theme tokens*: `bg-background`, `text-foreground`, `bg-muted`, `text-primary`, `border-border`.
- `cn-utility` - Selalu gunakan fungsi `cn()` (dari `tailwind-merge` & `clsx`) saat me-meneruskan className ke komponen.
- `icon-consistency` - HANYA gunakan `lucide-react`. JANGAN pakai emoji sebagai ikon arsitektural. Pastikan ukurannya seragam (misal: `size-4` atau `w-5 h-5`).
- `dark-mode-ready` - Karena kita memakai shadcn, aplikasi harus otomatis *dark/light mode ready*. Selalu test komponen dengan *semantic colors* agar tidak buta warna saat tema diubah.

### 5. Forms & Validation (MEDIUM)
- `inline-validation` - Pesan error validasi Zod harus muncul **di bawah field terkait**, bukan tersembunyi.
- `disabled-states` - Jangan biarkan user submit 2x. Form yang sedang menunggu respons SSR (Server Function) wajib di-disable.
- `progressive-disclosure` - Jika form terlalu panjang, gunakan *Accordion* atau bagi menjadi tahapan Wizard.
- `destructive-emphasis` - Gunakan warna Danger (`variant="destructive"`) untuk tombol yang menghapus/me-reject dokumen, pisahkan letaknya dari tombol primary.

### 6. SSR & Performance (TanStack Start)
- `no-window-on-ssr` - JANGAN langsung memanggil `window` atau `document` atau `localStorage` di main body komponen render. Gunakan `useEffect` atau lakukan pengecekan `typeof window !== 'undefined'`.
- `layout-shift-avoid` - Render *Skeleton* (dari shadcn) sebelum data dari server di-load (melalui `PendingComponent` pada route config) agar *Cumulative Layout Shift (CLS)* tetap nol.

---

## 🛑 Common Rules for Professional Web UI
*Mencegah UI terlihat amatir/tidak rapi.*

| Rule | Do | Don't |
|------|----|----- |
| **No Emojis as Icons** | Gunakan `lucide-react` misal `<CheckCircle className="size-4" />` | Memakai emoji (📝 🚀 ⛔) dalam tombol atau sidebar utama. |
| **Theme System Override** | Gunakan `bg-card` dan `text-card-foreground` | Memaksa `bg-white dark:bg-gray-800` pada seluruh halaman. |
| **Stroke Consistency** | Maintain `lucide-react` stroke width (biasanya default `2px`) | Ikon tercampur antara tebal dan sangat tipis. |
| **Link vs Button** | Jika untuk navigasi pindah halaman, gunakan `<Link>` dari TanStack Router. Jika memicu *action* (Submit, Delete), gunakan `<Button>`. | Memakai `<button>` dibungkus router push event secara sembarangan, atau `<Link>` yang diset tombol form. |
| **Border & Divider** | Pakai utility `border border-border` untuk pemisahan yang halus | Separator yang terlalu kontras (misal `border-black` di light mode). |

---

## 📋 Pre-Delivery UI Checklist
Sebelum melakukan komit atau menyerahkan hasil UI, pastikan Anda sebagai agen memeriksa ini:

### Visual Quality & Shadcn
- [ ] Tidak ada emoji dipakai sebagai elemen struktural (Gunakan `lucide-react`).
- [ ] Warna menggunakan sistem token CSS variabel (`hsl`) Tailwind, BUKAN hexcode atau pallet default (`red-500`).
- [ ] Menggunakan `cn(className, "...")` pada saat *forwarding ref/props*.
- [ ] Semua komponen modular di-import dari `src/ui/` (dump component) sesuai hukum repositori.

### Interaction & UX
- [ ] Button memunculkan `Loader2` saat ditekan apabila proses tersebut *async* / menunggu server.
- [ ] Pesan *Toast* diberikan saat submit/validasi server usai.
- [ ] Element navigasi interaktif selalu dapat dilirik *Tab key* dan memiliki `focus-visible`.
- [ ] *Empty State* (kondisi tabel/Inbox kosong) memiliki pesan dan ilustrasi yang ramah, bukan hanya blank putih.

### Layout & Spacing
- [ ] Grid & Flexbox mematuhi sistem kelipatan 4 (`gap-4`, `p-6`).
- [ ] Tampilan dijamin responsif (Sidebar dilipat/hilang di mobile, navigasi disesuaikan).
- [ ] Tabel data (seperti daftar dokumen/log) bisa di-*scroll horizontaly* di mobile (`overflow-x-auto`).

### SSR / TanStack Safety
- [ ] Tidak ada `window.matchMedia` atau API browser lokal yang memicu Hydration Error / SSR Crash.
- [ ] Jika komponen butuh interaktivitas Client-only, file memiliki directive `"use client"` di baris paling atas (khusus bila dipaksa React 19). Tapi di TanStack Start umumnya *file-based* atau *island architecture*, berhati-hati saat mengakses window. 

---

> **Aksi Agen AI:** "Saya telah membaca `ui-ux-pro-max`, karenanya UI yang akan saya tulis akan dijamin tampak premium, rapi, responsif, accessibility tinggi, serta mematuhi konvensi shadcn/ui dan Tanstack Start sepenuhnya."
