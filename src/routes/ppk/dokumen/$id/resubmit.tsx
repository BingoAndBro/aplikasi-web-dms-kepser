import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { DashboardShell } from '#/components/dashboard/DashboardShell'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import {
  FileText,
  ChevronRight,
  Upload,
  Eye,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  X,
  FileEdit,
  FileCheck,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import { FileUploadButton } from '#/components/dokumen/FileUploadButton'
import type { LampiranUrl } from '#/lib/dokumen-helpers'

export const Route = createFileRoute('/ppk/dokumen/$id/resubmit')({
  component: PpkResubmitPage,
})

type DokumenResubmit = {
  id: string; judul: string; fungsi_nama: string; kegiatan_nama: string
  is_ketua_tim: boolean; status: string; revision_notes: string | null
  lampiran_urls: LampiranUrl[]; tahun: number; tanggal: string; created_at: string
}

function formatDate(str: string) {
  try { return new Date(str).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return str }
}

function PpkResubmitPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const [dokumen, setDokumen] = useState<DokumenResubmit | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [lampiranUrls, setLampiranUrls] = useState<LampiranUrl[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    setLoading(true)
    try {
      const res = await fetch(`/api/ppk/resubmit/${id}`, { credentials: 'include' })
      if (!res.ok) {
        const json = await res.json()
        setFetchError(json.error ?? 'Gagal mengambil data')
        setLoading(false)
        return
      }
      const json = await res.json()
      setDokumen(json.dokumen)
      setLampiranUrls(json.dokumen.lampiran_urls ?? [])
    } catch {
      setFetchError('Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  async function handleResubmit() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/ppk/resubmit/${id}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lampiranUrls }),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(json.error ?? 'Gagal resubmit')
        return
      }
      navigate({ to: '/ppk/revisi' })
    } catch {
      alert('Terjadi kesalahan saat resubmit')
    } finally {
      setSubmitting(false)
    }
  }

  function handleUploaded(lampiran: LampiranUrl) {
    setLampiranUrls(prev => {
      const existing = prev.findIndex(l => l.kelengkapan_id === lampiran.kelengkapan_id)
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = lampiran
        return next
      }
      return [...prev, lampiran]
    })
  }

  function handleRemoved(kelengkapanId: string) {
    setLampiranUrls(prev => prev.filter(l => l.kelengkapan_id !== kelengkapanId))
  }

  function handlePreview(index: number) {
    window.open(`/api/ppk/dokumen/${id}/preview/${index}?iframe=true`, '_blank', 'width=800,height=600')
  }

  if (loading) {
    return (
      <DashboardShell role="PPK" showHero={false}>
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      </DashboardShell>
    )
  }

  if (fetchError || !dokumen) {
    return (
      <DashboardShell role="PPK" showHero={false}>
        <div className="text-center py-20">
          <AlertTriangle size={32} className="text-error mx-auto mb-3" />
          <p className="text-sm text-on-surface-variant">{fetchError ?? 'Dokumen tidak ditemukan'}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate({ to: '/ppk/revisi' })}>
            Kembali ke Revisi
          </Button>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell role="PPK" showHero={false}>
      <div className="space-y-6 max-w-3xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
              <FileEdit size={12} />
              <Link to="/ppk" className="hover:text-primary">PPK</Link>
              <ChevronRight size={10} />
              <Link to="/ppk/revisi" className="hover:text-primary">Revisi Dokumen</Link>
              <ChevronRight size={10} />
              <span className="text-primary">Resubmit</span>
            </div>
            <h2 className="font-headline text-xl font-extrabold text-on-surface">{dokumen.judul}</h2>
          </div>
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800 text-xs font-semibold shrink-0">
            Revisi dari Bendahara
          </Badge>
        </div>

        {/* Catatan Revisi Banner */}
        {dokumen.revision_notes && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl">
            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">Catatan dari Bendahara</p>
              <p className="text-xs text-amber-700 dark:text-amber-300">{dokumen.revision_notes}</p>
            </div>
          </div>
        )}

        {/* Info Grid */}
        <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Fungsi</p>
              <p className="text-sm font-semibold text-on-surface">{dokumen.fungsi_nama ?? '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Kegiatan</p>
              <p className="text-sm font-semibold text-on-surface">{dokumen.kegiatan_nama ?? '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tahun</p>
              <p className="text-sm font-semibold text-on-surface">{dokumen.tahun}</p>
            </div>
            <div>
              <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tanggal</p>
              <p className="text-sm font-semibold text-on-surface">{formatDate(dokumen.tanggal)}</p>
            </div>
          </div>
        </div>

        {/* Lampiran Section */}
        <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
          <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">
            Lampiran ({lampiranUrls.length})
          </p>
          <p className="text-[10px] text-on-surface-variant mb-4">
            Hapus file yang salah dan upload file yang baru. File lama tidak dihapus dari storage.
          </p>

          <div className="space-y-3">
            {lampiranUrls.length === 0 ? (
              <p className="text-xs text-on-surface-variant text-center py-4">Belum ada lampiran.</p>
            ) : (
              lampiranUrls.map((lamp, i) => (
                <div key={lamp.kelengkapan_id} className="flex items-center gap-3 p-3 bg-surface-container-low/20 rounded-lg">
                  <FileText size={16} className="text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-on-surface truncate">{lamp.nama}</p>
                  </div>
                  <Button size="icon-xs" variant="ghost" onClick={() => handlePreview(i)} aria-label="Pratinjau">
                    <Eye size={14} />
                  </Button>
                  <FileUploadButton
                    kelengkapanId={lamp.kelengkapan_id}
                    namaDokumen={lamp.nama}
                    initialLampiran={lamp}
                    onUploaded={handleUploaded}
                    onRemoved={() => handleRemoved(lamp.kelengkapan_id)}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Link to="/ppk/revisi">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ChevronRight size={14} className="rotate-180" />Batal
            </Button>
          </Link>
          <Button
            size="sm"
            className="gap-1.5 flex-1"
            onClick={handleResubmit}
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <FileCheck size={14} />
            )}
            Resubmit ke Bendahara
          </Button>
        </div>
      </div>
    </DashboardShell>
  )
}