import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState, useCallback } from 'react'
import { DashboardShell } from '#/components/dashboard/DashboardShell'
import { Button } from '#/components/ui/button'
import { KelengkapanChecklist } from '#/components/dokumen/KelengkapanChecklist'
import type { DokumenRow, LampiranUrl } from '#/lib/dokumen-helpers'
import {
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Loader2,
  FileText,
} from 'lucide-react'

export const Route = createFileRoute('/dokumen/$id/edit')({
  component: DokumenEditPage,
})

function DokumenEditPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const [dokumen, setDokumen] = useState<DokumenRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [lampiranUrls, setLampiranUrls] = useState<LampiranUrl[]>([])
  const [missingRequired, setMissingRequired] = useState<any[]>([])

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    setLoading(true)
    try {
      const res = await fetch(`/api/dokumen/${id}`, { credentials: 'include' })
      if (!res.ok) {
        navigate({ to: '/dokumen/saya' })
        return
      }
      const json = await res.json()
      const dok: DokumenRow = json.dokumen

      // Only allow editing if NEED_REVISION + target USER
      if (dok.status !== 'NEED_REVISION' || dok.revision_target !== 'USER') {
        navigate({ to: `/dokumen/${id}` })
        return
      }

      setDokumen(dok)
      setLampiranUrls(dok.lampiran_urls)
    } catch {
      navigate({ to: '/dokumen/saya' })
    } finally {
      setLoading(false)
    }
  }

  const handleKelengkapanComplete = useCallback(
    (lampirans: LampiranUrl[], missing: any[]) => {
      setLampiranUrls(lampirans)
      setMissingRequired(missing)
    },
    []
  )

  async function handleResubmit() {
    if (missingRequired.length > 0) return
    if (lampiranUrls.length === 0) {
      setSubmitError('Minimal upload satu lampiran sebelum mengajukan ulang')
      return
    }

    setSubmitting(true)
    setSubmitError('')

    try {
      // 1. Update lampiran_urls
      const updateRes = await fetch(`/api/dokumen/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ lampiranUrls }),
      })
      const updateJson = await updateRes.json()
      if (!updateRes.ok) {
        setSubmitError(updateJson.error ?? 'Gagal memperbarui lampiran')
        return
      }

      // 2. Submit/resubmit
      const submitRes = await fetch(`/api/dokumen/${id}/submit`, {
        method: 'POST',
        credentials: 'include',
      })
      const submitJson = await submitRes.json()
      if (!submitRes.ok) {
        setSubmitError(submitJson.error ?? 'Gagal mengajukan ulang')
        return
      }

      navigate({ to: '/dokumen/saya' })
    } catch {
      setSubmitError('Terjadi kesalahan. Coba lagi.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <DashboardShell role="PEGAWAI">
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      </DashboardShell>
    )
  }

  if (!dokumen) return null

  return (
    <DashboardShell role="PEGAWAI">
      <div className="space-y-6 max-w-2xl mx-auto">
        {/* Header */}
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
            <FileText size={12} />
            <Link href={`/dokumen/${id}`} className="hover:text-primary">Dokumen</Link>
            <span>/</span>
            <span className="text-primary">Perbaiki & Ajukan Ulang</span>
          </div>
          <h2 className="font-headline text-xl font-extrabold text-on-surface">
            Perbaiki & Ajukan Ulang
          </h2>
          <p className="text-on-surface-variant text-xs mt-1">
            {dokumen.judul}
          </p>
        </div>

        {/* Revision Notes Banner */}
        {dokumen.revision_notes && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl">
            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">
                Catatan dari PPK
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 whitespace-pre-wrap">
                {dokumen.revision_notes}
              </p>
            </div>
          </div>
        )}

        {/* Info Summary */}
        <div className="bg-white rounded-xl border border-outline-variant/30 p-4 shadow-sm">
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-0.5">Fungsi</p>
              <p className="font-semibold text-on-surface">{dokumen.fungsi_nama ?? '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-0.5">Kegiatan</p>
              <p className="font-semibold text-on-surface">{dokumen.kegiatan_nama ?? '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-0.5">Tahun</p>
              <p className="font-semibold text-on-surface">{dokumen.tahun}</p>
            </div>
          </div>
        </div>

        {/* Lampiran Upload */}
        <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
          <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">
            Perbaiki Lampiran
          </p>
          <p className="text-xs text-on-surface-variant mb-4">
            Unggah ulang lampiran yang sesuai dengan catatan PPK di atas.
          </p>

          <KelengkapanChecklist
            kegiatanId={dokumen.kegiatan_jenis_id}
            isKetuaTim={dokumen.is_ketua_tim}
            dokumenId={dokumen.id}
            initialLampirans={dokumen.lampiran_urls}
            onComplete={handleKelengkapanComplete}
          />
        </div>

        {submitError && (
          <div className="flex items-start gap-2 text-error text-xs p-3 bg-error/10 rounded-lg">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            {submitError}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Link href={`/dokumen/${id}`}>
            <Button variant="outline" className="gap-1.5">
              <ChevronLeft size={14} />Kembali
            </Button>
          </Link>
          <Button
            onClick={handleResubmit}
            disabled={submitting || missingRequired.length > 0 || lampiranUrls.length === 0}
            className="flex-1 gap-1.5"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Mengajukan Ulang...
              </>
            ) : (
              <>
                Ajukan Ulang <ChevronRight size={14} />
              </>
            )}
          </Button>
        </div>
      </div>
    </DashboardShell>
  )
}
