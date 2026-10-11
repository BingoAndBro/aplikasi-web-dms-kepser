/**
 * Gaya tombol aksi laporan (Bagikan Tautan, Riwayat Tautan, Ekspor ZIP) beserta
 * dialognya. Semuanya memakai token tema (--brand-*) sehingga ikut berganti saat
 * [data-theme] berubah, dan hover memakai tint tema -- bukan abu-abu bawaan
 * variant `outline`/`ghost` (bg-muted) yang tidak mengikuti tema.
 *
 * Dipakai bersama `<Button variant="outline">` dari #/components/ui/button;
 * class di sini menimpa ukuran bawaan (h-7) lewat tailwind-merge di `cn`.
 */

/** Tombol di footer toolbar (sejajar tinggi dengan dropdown filter, h-10). */
export const TOOLBAR_ACTION_BUTTON_CLASS = [
  'h-10 gap-2 rounded-xl border-brand-border bg-bg-surface px-4 text-sm font-bold text-zinc-950 shadow-sm',
  'hover:border-brand-border-strong hover:bg-brand-surface hover:text-zinc-950',
  'aria-expanded:border-brand-border-strong aria-expanded:bg-brand-surface',
].join(' ')

/** Ikon pada tombol aksi: mengikuti warna ikon tema. */
export const ACTION_BUTTON_ICON_CLASS = 'text-brand-icon'

/** Tombol sekunder di dialog (Batal, Salin, Buka). */
export const DIALOG_SECONDARY_BUTTON_CLASS = [
  'h-10 gap-1.5 rounded-xl border-brand-border bg-bg-surface px-4 text-sm font-bold text-zinc-950',
  'hover:border-brand-border-strong hover:bg-brand-surface hover:text-zinc-950',
].join(' ')

/** Tombol utama di dialog (Buat Tautan, Ekspor Sekarang, Selesai). */
export const DIALOG_PRIMARY_BUTTON_CLASS = [
  'h-10 gap-1.5 rounded-xl bg-brand-solid px-5 text-sm font-extrabold text-white shadow-sm shadow-brand-solid/20',
  'hover:bg-brand-solid-hover active:bg-brand-solid-active',
].join(' ')

/** Varian ringkas untuk baris daftar (Salin/Buka/Cabut di Riwayat Tautan), setinggi input h-9. */
export const COMPACT_ACTION_BUTTON_CLASS = 'h-9 px-3 text-xs'

/** Tombol bahaya (Cabut): tint merah, tetap mengikuti bentuk tombol lain. */
export const DANGER_ACTION_BUTTON_CLASS = [
  'h-9 gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700',
  'hover:border-red-300 hover:bg-red-100 hover:text-red-800',
].join(' ')

/** Input di dialog: fokus memakai cincin tema, sama dengan kolom pencarian toolbar. */
export const DIALOG_INPUT_CLASS = [
  'rounded-xl border-zinc-200 bg-bg-surface text-sm font-medium text-zinc-900',
  'focus-visible:border-brand-border-strong focus-visible:ring-4 focus-visible:ring-brand-border/60',
].join(' ')
