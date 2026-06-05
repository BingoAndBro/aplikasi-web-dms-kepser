import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import {
  DocumentListStatusBadge,
  WorkflowMobileCard,
  WorkflowMobileList,
  WorkflowPageHeader,
  WorkflowSearchPanel,
  WorkflowTableShell,
} from '#/components/workflow/PpkPpspmPagePrimitives'
import {
  FileText, ChevronRight, Banknote,
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
  const navigate = useNavigate()
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

  function openDocument(dok: InboxItem) {
    navigate({ to: '/bendahara/dokumen/$id', params: { id: dok.id } })
  }

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
              <Table>
                <TableHeader>
                  <TableRow className="bg-orange-50/50">
                    <TableHead className="w-12 text-center">No</TableHead>
                    <TableHead>Judul</TableHead>
                    <TableHead>Fungsi</TableHead>
                    <TableHead>Kegiatan</TableHead>
                    <TableHead className="text-center">Tanggal</TableHead>
                    <TableHead className="text-center">Divalidasi Oleh</TableHead>
                    <TableHead className="text-center">Tanggal Validasi</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center w-20">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((d, i) => (
                    <TableRow
                      key={d.id}
                      className="group cursor-pointer hover:bg-orange-50/60 transition-colors"
                      onClick={() => openDocument(d)}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openDocument(d)
                        }
                      }}
                      aria-label={`Buka dokumen ${d.judul}`}
                    >
                      <TableCell className="text-center text-xs text-outline">{i + 1}</TableCell>
                      <TableCell><p className="font-semibold text-sm text-on-surface line-clamp-1">{d.judul}</p></TableCell>
                      <TableCell><span className="text-xs text-on-surface">{d.fungsi_nama ?? '-'}</span></TableCell>
                      <TableCell><span className="text-xs text-on-surface">{d.kegiatan_nama ?? '-'}</span></TableCell>
                      <TableCell className="text-center"><span className="text-xs text-on-surface-variant">{formatDate(d.tanggal)}</span></TableCell>
                      <TableCell className="text-center"><span className="text-xs text-on-surface-variant">{d.ppk_validated_at ? 'PPK' : '-'}</span></TableCell>
                      <TableCell className="text-center"><span className="text-xs text-on-surface-variant">{d.ppk_validated_at ? formatDate(d.ppk_validated_at) : '-'}</span></TableCell>
                      <TableCell className="text-center"><DocumentListStatusBadge status="IN_BENDAHARA_APPROVAL" /></TableCell>
                      <TableCell className="text-center">
                        <Button size="icon-xs" variant="ghost" aria-label={`Buka dokumen ${d.judul}`}><ChevronRight size={14} /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </WorkflowTableShell>

            <WorkflowMobileList>
              {items.map((d) => (
                <WorkflowMobileCard
                  key={d.id}
                  title={d.judul}
                  subtitle={d.fungsi_nama ?? '-'}
                  status={<DocumentListStatusBadge status="IN_BENDAHARA_APPROVAL" />}
                  meta={[
                    { label: 'Kegiatan', value: d.kegiatan_nama ?? '-', wide: true },
                    { label: 'Tanggal', value: formatDate(d.tanggal) },
                    { label: 'Tanggal Validasi PPK', value: d.ppk_validated_at ? formatDate(d.ppk_validated_at) : '-' },
                  ]}
                  action={
                    <Link to="/bendahara/dokumen/$id" params={{ id: d.id }}>
                      <Button variant="outline" size="sm" className="w-full gap-1.5">
                        <ChevronRight size={14} />
                        Buka Dokumen
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
