import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { StatusBadge } from '#/components/ui/StatusBadge'
import {
  WorkflowMobileCard,
  WorkflowMobileList,
  WorkflowPageHeader,
  WorkflowSearchPanel,
  WorkflowTableShell,
} from '#/components/workflow/PpkPpspmPagePrimitives'
import {
  FileText, ChevronRight, Eye, Banknote,
} from 'lucide-react'
import { formatDate } from '#/lib/utils/format'
import { ApiError, apiFetch } from '#/lib/api-client'

export const Route = createFileRoute('/bendahara/inbox')({ component: BendaharaInboxPage })

type InboxItem = {
  id: string; judul: string; fungsi_nama: string; kegiatan_nama: string
  created_by: string; tahun: number; tanggal: string; created_at: string
  ppk_user_id: string | null; ppk_validated_at: string | null
}

type FungsiOption = { id: string; nama: string }

function BendaharaInboxPage() {
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
      const json = await apiFetch<{ dokumen?: InboxItem[]; error?: string }>('/bendahara/inbox', { query: params })
      setItems(json.dokumen ?? [])
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        setError(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error ?? 'Gagal'
          : 'Gagal')
        return
      }

      setError('Terjadi kesalahan')
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [fungsiFilter])

  return (
    <PageLayout>
      <div className="space-y-6">
        <WorkflowPageHeader
          tone="ppspm"
          eyebrow={
            <>
              <Banknote size={12} />
              <Link to="/bendahara" className="hover:text-orange-900">PPSPM</Link>
              <ChevronRight size={10} />
              <span>Persetujuan Dokumen</span>
            </>
          }
          title="Persetujuan Dokumen"
          description={`${items.length} dokumen Material sudah divalidasi PPK dan menunggu persetujuan PPSPM.`}
        />

        <WorkflowSearchPanel resultLabel={`${items.length} dokumen ditemukan`}>
          <select
            value={fungsiFilter}
            onChange={e => setFungsiFilter(e.target.value)}
            className="h-10 rounded-xl border border-orange-100 bg-[#FFFDF9] px-3 text-sm text-zinc-900 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70"
          >
            <option value="">Semua Fungsi</option>
            {fungsiList.map(f => <option key={f.id} value={f.id}>{f.nama}</option>)}
          </select>
          {fungsiFilter && <Button variant="ghost" size="sm" onClick={() => setFungsiFilter('')}>Reset</Button>}
        </WorkflowSearchPanel>

        {loading ? (
          <LoadingState variant="list" rows={4} />
        ) : error ? (
          <ErrorState
            title="Gagal memuat data"
            description={error}
            variant="page"
            action={<Button variant="outline" size="sm" onClick={fetchData}>Coba Lagi</Button>}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="Tidak ada dokumen"
            description="Dokumen yang menunggu persetujuan PPSPM akan muncul di sini."
            icon={<FileText size={20} />}
          />
        ) : (
          <>
            <WorkflowTableShell>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-orange-50/50 text-left">
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider w-10 text-center">No</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Judul</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Fungsi</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Kegiatan</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center">Tahun</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center">Tanggal</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center">Divalidasi Oleh</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center">Tanggal Validasi</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center">Status</th>
                    <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center w-20">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((d, i) => (
                    <tr key={d.id} className="border-t border-outline-variant/20 hover:bg-orange-50/60 transition-colors">
                      <td className="px-4 py-3 text-center text-outline">{i + 1}</td>
                      <td className="px-4 py-3"><p className="font-semibold text-on-surface line-clamp-1">{d.judul}</p></td>
                      <td className="px-4 py-3 text-on-surface">{d.fungsi_nama ?? '-'}</td>
                      <td className="px-4 py-3 text-on-surface">{d.kegiatan_nama ?? '-'}</td>
                      <td className="px-4 py-3 text-center font-semibold text-on-surface">{d.tahun}</td>
                      <td className="px-4 py-3 text-center text-on-surface-variant">{formatDate(d.tanggal)}</td>
                      <td className="px-4 py-3 text-center text-on-surface-variant">{d.ppk_validated_at ? 'PPK' : '-'}</td>
                      <td className="px-4 py-3 text-center text-on-surface-variant">{d.ppk_validated_at ? formatDate(d.ppk_validated_at) : '-'}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status="IN_BENDAHARA_APPROVAL" className="text-[10px] font-semibold" /></td>
                      <td className="px-4 py-3 text-center">
                        <Link to="/bendahara/dokumen/$id" params={{ id: d.id }}>
                          <Button size="icon-xs" variant="ghost" aria-label={`Lihat detail dokumen ${d.judul}`}><Eye size={14} /></Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </WorkflowTableShell>

            <WorkflowMobileList>
              {items.map((d) => (
                <WorkflowMobileCard
                  key={d.id}
                  title={d.judul}
                  subtitle={d.fungsi_nama ?? '-'}
                  status={<StatusBadge status="IN_BENDAHARA_APPROVAL" className="text-[10px] font-semibold" />}
                  meta={[
                    { label: 'Kegiatan', value: d.kegiatan_nama ?? '-' },
                    { label: 'Tahun', value: d.tahun },
                    { label: 'Tanggal', value: formatDate(d.tanggal) },
                    { label: 'Tanggal Validasi PPK', value: d.ppk_validated_at ? formatDate(d.ppk_validated_at) : '-' },
                  ]}
                  action={
                    <Link to="/bendahara/dokumen/$id" params={{ id: d.id }}>
                      <Button variant="outline" size="sm" className="w-full gap-1.5">
                        <Eye size={14} />
                        Lihat Detail
                      </Button>
                    </Link>
                  }
                />
              ))}
            </WorkflowMobileList>
          </>
        )}
      </div>
    </PageLayout>
  )
}
