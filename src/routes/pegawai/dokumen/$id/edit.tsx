import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { AttachmentEditor } from '#/components/dokumen/AttachmentEditor'
import { useUnsavedChangesGuard } from '#/hooks/useUnsavedChangesGuard'
import {
  FileText,
  ChevronRight,
  Loader2,
  Pencil,
} from 'lucide-react'
import type { DokumenRow, LampiranUrl } from '#/lib/dokumen-helpers'
import { formatDate } from '#/lib/utils/format'

export const Route = createFileRoute('/pegawai/dokumen/$id/edit')({
  component: EditDokumenPage,
})


function EditDokumenPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()

  const [dok, setDok] = useState<DokumenRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [keteranganDetail, setKeteranganDetail] = useState('')
  const [originalKeteranganDetail, setOriginalKeteranganDetail] = useState('')
  const [attachmentDirty, setAttachmentDirty] = useState(false)
  const [guardEnabled, setGuardEnabled] = useState(true)

  const isDirty = guardEnabled && (
    keteranganDetail !== originalKeteranganDetail ||
    attachmentDirty
  )

  const { confirmIfDirty } = useUnsavedChangesGuard({
    isDirty,
  })

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/dokumen/${id}`, { credentials: 'include' })
      if (!res.ok) {
        const json = await res.json()
        setError(json.error || `HTTP ${res.status}`)
        setLoading(false)
        return
      }
      const json = await res.json()
      const dokumen = json.dokumen as DokumenRow

      // Check if Non-Material and TERSIMPAN
      const isNonMaterial = dokumen.is_non_material === true ||
        (!dokumen.jenis_permintaan_id && !dokumen.kategori_permintaan_id && !dokumen.detail_permintaan_id)

      if (!isNonMaterial || dokumen.status !== 'TERSIMPAN') {
        setError('Dokumen ini tidak bisa diedit')
        setLoading(false)
        return
      }

      setDok(dokumen)

      // Initialize keterangan detail
      const ketDetail = dokumen.keterangan_detail ?? ''
      setKeteranganDetail(ketDetail)
      setOriginalKeteranganDetail(ketDetail)
      setAttachmentDirty(false)
      setGuardEnabled(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(data: { lampiranUrls: LampiranUrl[]; nominalRealisasi: number | null }) {
    setLoading(true)
    setGuardEnabled(false)
    try {
      const res = await fetch(`/api/dokumen/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lampiranUrls: data.lampiranUrls,
          keteranganDetail: keteranganDetail || null,
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Gagal menyimpan')
      }

      setOriginalKeteranganDetail(keteranganDetail)
      setAttachmentDirty(false)
      setGuardEnabled(false)
      navigate({ to: '/pegawai/dokumen/$id', params: { id } })
    } catch (err) {
      setGuardEnabled(true)
      alert(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  function handleCancel() {
    navigate({ to: '/pegawai/dokumen/$id', params: { id } })
  }

  if (loading && !dok) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout>
        <div className="text-center py-20">
          <p className="text-sm text-error">{error}</p>
          <Link to="/pegawai/dokumen">
            <Button variant="outline" size="sm" className="mt-4">Kembali</Button>
          </Link>
        </div>
      </PageLayout>
    )
  }

  if (!dok) return null

  return (
    <PageLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest">
          <Pencil size={12} />
          <Link to="/pegawai/dokumen" className="hover:text-primary">Dokumen</Link>
          <ChevronRight size={10} />
          <span className="text-primary">Edit</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-headline text-xl font-extrabold text-on-surface">{dok.judul}</h2>
            <p className="text-xs text-on-surface-variant mt-1">
              {dok.fungsi_nama ?? ''} &bull; {dok.kegiatan_nama ?? ''}
            </p>
          </div>
          <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-xs font-semibold shrink-0">
            Tersimpan
          </Badge>
        </div>

        {/* Info */}
        <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tahun</p>
              <p className="font-semibold">{dok.tahun}</p>
            </div>
            <div>
              <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tanggal</p>
              <p className="font-semibold">{dok.tanggal ? formatDate(dok.tanggal) : '—'}</p>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Keterangan Detail</p>
            <textarea
              value={keteranganDetail}
              onChange={e => setKeteranganDetail(e.target.value)}
              placeholder="Masukkan keterangan detail dokumen (opsional)"
              maxLength={500}
              rows={3}
              className="w-full px-3 py-2 border border-outline rounded-lg text-sm bg-surface text-on-surface
                focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                placeholder:text-outline resize-none"
            />
            <p className="text-[10px] text-outline mt-1 text-right">
              {keteranganDetail.length}/500 karakter
            </p>
          </div>
        </div>

        {/* Attachment Editor */}
        <AttachmentEditor
          dokumen={dok}
          lampiranUrls={dok.lampiran_urls as LampiranUrl[] ?? []}
          isNonMaterial={true}
          submitLabel="Simpan Perubahan"
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          onDirtyChange={setAttachmentDirty}
          confirmIfDirty={confirmIfDirty}
        />
      </div>
    </PageLayout>
  )
}
