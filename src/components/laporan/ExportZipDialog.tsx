import { Download, Loader2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'

export const EXPORT_ZIP_MAX_DOCUMENTS = 500

export function ExportZipDialog({
  open,
  onOpenChange,
  documentCount,
  description,
  pending,
  error,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentCount: number
  description: string
  pending: boolean
  error: string
  onConfirm: () => void
}) {
  const overLimit = documentCount > EXPORT_ZIP_MAX_DOCUMENTS

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!pending) onOpenChange(nextOpen)
    }}>
      <DialogContent className="border-brand-border bg-[#FFFAF6] shadow-2xl shadow-zinc-950/10 sm:max-w-md sm:rounded-3xl">
        <DialogHeader>
          <DialogTitle>Ekspor ZIP Dokumen</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {overLimit ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            Filter menghasilkan {documentCount} dokumen. Maksimal {EXPORT_ZIP_MAX_DOCUMENTS} per ekspor — persempit periode atau kegiatan.
          </p>
        ) : (
          <p className="rounded-xl border border-[#F1E5DA] bg-bg-surface px-4 py-3 text-sm font-semibold text-zinc-700">
            {documentCount} dokumen akan diunduh sebagai satu berkas ZIP.
          </p>
        )}

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          {!overLimit && (
            <Button
              type="button"
              className="gap-1.5"
              disabled={pending || documentCount === 0}
              onClick={onConfirm}
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {pending ? 'Menyiapkan ZIP...' : 'Ekspor Sekarang'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
