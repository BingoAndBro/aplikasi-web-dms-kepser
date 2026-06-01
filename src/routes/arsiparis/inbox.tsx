import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  ArchiveMobileCard,
  ArchiveMobileList,
  ArchivePageHeader,
  ArchivePanel,
  ArchiveTableShell,
} from '#/components/archive/ArchivePagePrimitives'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { ApiError, apiFetch } from '#/lib/api-client'
import {
  ChevronRight, Eye,
  Banknote, Clock,
} from 'lucide-react'
import { formatDate } from '#/lib/utils/format'

export const Route = createFileRoute('/arsiparis/inbox')({ component: ArsiparisInboxPage })

type InboxItem = {
  id: string
  judul: string
  fungsi_id: string
  fungsi_nama: string
  kegiatan_jenis_id: string
  kegiatan_nama: string
  nama_pegawai: string
  tahun: number
  tanggal: string
  created_at: string
  bendahara_approve_at: string | null
}

type ArsiparisInboxResponse = {
  inbox?: InboxItem[]
  error?: string
}

type FungsiOption = { id: string; nama: string }

function ArsiparisInboxPage() {
  const [items, setItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fungsiList, setFungsiList] = useState<{ id: string; nama: string }[]>([])
  const [fungsiFilter, setFungsiFilter] = useState('')

  useEffect(() => {
    apiFetch<FungsiOption[]>('/master-fungsi')
      .then(data => { setFungsiList(data) })
      .catch(() => { setFungsiList([]) })
  }, [])

  async function fetchData() {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams()
      if (fungsiFilter) params.set('fungsi_id', fungsiFilter)
      const json = await apiFetch<ArsiparisInboxResponse>('/arsiparis/inbox', { query: params })
      setItems(json.inbox ?? [])
    } catch (error) {
      if (error instanceof ApiError) {
        const payload = error.payload
        if (payload && typeof payload === 'object' && 'error' in payload) {
          setError(typeof payload.error === 'string' ? payload.error : 'Gagal')
        } else {
          setError('Gagal')
        }
      } else {
        setError('Terjadi kesalahan')
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [fungsiFilter])


  return (
    <PageLayout>
      <div className="space-y-6">
        <ArchivePageHeader
          eyebrow={
            <>
              <Banknote size={13} />
              <Link to="/arsiparis" className="hover:text-orange-900">Kepala Sub Bagian Umum</Link>
              <ChevronRight size={10} />
              Pengklasifikasian Dokumen
            </>
          }
          title="Pengklasifikasian Dokumen"
          description={`${items.length} dokumen selesai PPSPM menunggu pemilihan Jenis Pembayaran. Metadata final seperti Nomor SPM dan retensi tetap diisi saat Tutup Berkas.`}
        />

        <ArchivePanel className="p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <select
            value={fungsiFilter}
            onChange={e => setFungsiFilter(e.target.value)}
              className="h-10 rounded-xl border border-orange-100 bg-[#FFFDF9] px-3 text-sm font-semibold text-zinc-900 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70"
          >
            <option value="">Semua Fungsi</option>
            {fungsiList.map(f => <option key={f.id} value={f.id}>{f.nama}</option>)}
          </select>
            <div className="flex items-center gap-2 text-xs text-zinc-600">
              <span className="font-semibold">{items.length} dokumen ditampilkan</span>
              {fungsiFilter && <Button variant="ghost" size="sm" onClick={() => setFungsiFilter('')}>Reset</Button>}
            </div>
          </div>
        </ArchivePanel>

        {loading ? (
          <LoadingState variant="list" label="Memuat dokumen pengklasifikasian" />
        ) : error ? (
          <ErrorState
            title="Gagal memuat dokumen"
            description={error}
            action={<Button variant="outline" size="sm" onClick={fetchData}>Coba Lagi</Button>}
            variant="page"
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="Tidak ada dokumen"
            description="Dokumen yang telah disetujui PPSPM dan belum diklasifikasikan akan muncul di sini."
            icon={<Clock size={22} />}
          />
        ) : (
          <>
            <ArchiveTableShell>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-orange-50/60 text-left">
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider w-10 text-center">No</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Judul</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Fungsi</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Kegiatan</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center">Tahun</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center">Tanggal Approve</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center w-20">Proses</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((d, i) => (
                    <tr key={d.id} className="border-t border-outline-variant/20 hover:bg-primary/5 transition-colors">
                      <td className="px-4 py-3 text-center text-outline">{i + 1}</td>
                      <td className="px-4 py-3"><p className="font-semibold text-on-surface line-clamp-1">{d.judul}</p></td>
                      <td className="px-4 py-3 text-on-surface">{d.fungsi_nama ?? '—'}</td>
                      <td className="px-4 py-3 text-on-surface">{d.kegiatan_nama ?? '—'}</td>
                      <td className="px-4 py-3 text-center font-semibold text-on-surface">{d.tahun}</td>
                      <td className="px-4 py-3 text-center text-on-surface-variant">
                        {d.bendahara_approve_at ? formatDate(d.bendahara_approve_at) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link to="/arsiparis/dokumen/$id" params={{ id: d.id }}>
                          <Button size="icon-xs" variant="ghost" aria-label={`Lihat detail dokumen ${d.judul}`}><Eye size={14} /></Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ArchiveTableShell>
            <ArchiveMobileList>
              {items.map((d) => (
                <ArchiveMobileCard
                  key={d.id}
                  title={d.judul}
                  subtitle={`Diajukan oleh ${d.nama_pegawai}`}
                  meta={[
                    { label: 'Fungsi', value: d.fungsi_nama ?? '-' },
                    { label: 'Kegiatan', value: d.kegiatan_nama ?? '-' },
                    { label: 'Tahun', value: d.tahun },
                    { label: 'Tanggal approve', value: d.bendahara_approve_at ? formatDate(d.bendahara_approve_at) : '-' },
                  ]}
                  action={
                    <Link to="/arsiparis/dokumen/$id" params={{ id: d.id }}>
                      <Button size="sm" variant="outline" className="w-full gap-1.5">
                        <Eye size={14} />
                        Klasifikasikan
                      </Button>
                    </Link>
                  }
                />
              ))}
            </ArchiveMobileList>
          </>
        )}
      </div>
    </PageLayout>
  )
}
