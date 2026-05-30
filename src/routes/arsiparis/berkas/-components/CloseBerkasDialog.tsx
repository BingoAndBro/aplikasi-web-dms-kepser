import { Loader2, Save } from 'lucide-react'

import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  MANUAL_ARCHIVE_RETENTION_LABELS,
  type RetensiLabel,
} from '#/lib/archive/retention'

export type CloseBerkasFormState = {
  nomor_spm: string
  retensi_aktif: string
  retensi_inaktif: string
  closed_at: string
}

export type CloseBerkasRequestBody = {
  nomor_spm: string
  retensi_aktif: string
  retensi_inaktif: string
  closed_at?: string
}

export const EMPTY_CLOSE_BERKAS_FORM: CloseBerkasFormState = {
  nomor_spm: '',
  retensi_aktif: '',
  retensi_inaktif: '',
  closed_at: '',
}

export const EMPTY_BERKAS_CLOSE_MESSAGE =
  'Berkas belum memiliki dokumen. Tambahkan dokumen terlebih dahulu sebelum menutup berkas.'

export function buildCloseBerkasRequestBody(form: CloseBerkasFormState): CloseBerkasRequestBody {
  const body: CloseBerkasRequestBody = {
    nomor_spm: form.nomor_spm.trim(),
    retensi_aktif: form.retensi_aktif as RetensiLabel,
    retensi_inaktif: form.retensi_inaktif as RetensiLabel,
  }

  if (form.closed_at) body.closed_at = form.closed_at

  return body
}

export function isCloseBerkasFormIncomplete(form: CloseBerkasFormState): boolean {
  return !form.nomor_spm.trim() || !form.retensi_aktif || !form.retensi_inaktif
}

export function CloseBerkasDialog({
  open,
  form,
  pending,
  submitDisabled,
  onOpenChange,
  onFormChange,
  onSubmit,
}: {
  open: boolean
  form: CloseBerkasFormState
  pending: boolean
  submitDisabled: boolean
  onOpenChange: (open: boolean) => void
  onFormChange: (form: CloseBerkasFormState) => void
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tutup Berkas</DialogTitle>
          <DialogDescription>
            Isi metadata final sebelum berkas difinalisasi menjadi Arsip Aktif.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900">
            <p className="font-semibold">Berkas akan difinalisasi menjadi Arsip Aktif.</p>
            <p>Setelah ditutup, Jenis Pembayaran ini tidak bisa menerima dokumen baru.</p>
            <p>Dokumen dan file fisik tidak dihapus.</p>
            <p>Status berkas menjadi Ditutup dan status arsip menjadi Aktif.</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-xs font-bold text-on-surface" htmlFor="close-berkas-nomor-spm">
              Nomor SPM <span className="text-error">*</span>
              <input
                id="close-berkas-nomor-spm"
                value={form.nomor_spm}
                onChange={(event) => onFormChange({ ...form, nomor_spm: event.target.value })}
                className="mt-1 w-full rounded-lg border border-outline-variant/60 bg-white px-3 py-2 text-sm font-semibold text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                maxLength={120}
                autoComplete="off"
              />
            </label>
            <label className="block text-xs font-bold text-on-surface" htmlFor="close-berkas-closed-at">
              Tanggal Tutup
              <input
                id="close-berkas-closed-at"
                type="date"
                value={form.closed_at}
                onChange={(event) => onFormChange({ ...form, closed_at: event.target.value })}
                className="mt-1 w-full rounded-lg border border-outline-variant/60 bg-white px-3 py-2 text-sm font-semibold text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="block text-xs font-bold text-on-surface" htmlFor="close-berkas-retensi-aktif">
              Retensi Aktif <span className="text-error">*</span>
              <select
                id="close-berkas-retensi-aktif"
                value={form.retensi_aktif}
                onChange={(event) => onFormChange({ ...form, retensi_aktif: event.target.value })}
                className="mt-1 w-full rounded-lg border border-outline-variant/60 bg-white px-3 py-2 text-sm font-semibold text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">Pilih retensi aktif</option>
                {MANUAL_ARCHIVE_RETENTION_LABELS.map((label) => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-bold text-on-surface" htmlFor="close-berkas-retensi-inaktif">
              Retensi Inaktif <span className="text-error">*</span>
              <select
                id="close-berkas-retensi-inaktif"
                value={form.retensi_inaktif}
                onChange={(event) => onFormChange({ ...form, retensi_inaktif: event.target.value })}
                className="mt-1 w-full rounded-lg border border-outline-variant/60 bg-white px-3 py-2 text-sm font-semibold text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">Pilih retensi inaktif</option>
                {MANUAL_ARCHIVE_RETENTION_LABELS.map((label) => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Batal
          </Button>
          <Button
            type="button"
            className="gap-1.5"
            onClick={onSubmit}
            disabled={submitDisabled}
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Finalisasi Berkas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
