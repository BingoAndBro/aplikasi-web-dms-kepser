import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import {
  ChevronRight, AlertCircle,
  Loader2, CheckCircle2,
  Search, ChevronDown, ChevronLeft,
} from 'lucide-react'
import { ActivityLog } from '#/components/dokumen/ActivityLog'
import { AttachmentViewer } from '#/components/dokumen/AttachmentViewer'
import { cn } from '#/lib/utils'
import { formatDate } from '#/lib/utils/format'
import { ApiError, apiFetch } from '#/lib/api-client'
import { apiMutation } from '#/lib/api-mutation'

export const Route = createFileRoute('/arsiparis/dokumen/$id/')({
  component: ArsiparisDokumenDetailPage,
})

type Klasifikasi = {
  id: string
  nama: string
  kode?: string | null
  is_root?: boolean
  children?: Klasifikasi[]
}

type FlatKlasifikasiOption = {
  id: string
  kode: string | null
  nama: string
  label: string
  node: Klasifikasi
}

const RETENSI_OPTIONS = ['1 Tahun', '3 Tahun', '5 Tahun', '10 Tahun', 'Permanen'] as const

function retensiToYears(retensi: string): number {
  if (retensi === 'Permanen') return 999
  const match = retensi.match(/(\d+)/)
  return match ? parseInt(match[1]) : 1
}

function calcDate(dateStr: string, years: number): string {
  const d = new Date(dateStr)
  if (years === 999) return '9999-12-31'
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().split('T')[0]
}

function compareKode(a: string | null | undefined, b: string | null | undefined): number {
  const aParts = (a ?? '').split('.')
  const bParts = (b ?? '').split('.')
  const maxLength = Math.max(aParts.length, bParts.length)

  for (let index = 0; index < maxLength; index += 1) {
    const aPart = aParts[index] ?? ''
    const bPart = bParts[index] ?? ''
    const comparison = aPart.localeCompare(bPart, undefined, {
      numeric: true,
      sensitivity: 'base',
    })

    if (comparison !== 0) {
      return comparison
    }
  }

  return 0
}

function sortByKode(nodes: Klasifikasi[]): Klasifikasi[] {
  return [...nodes].sort((left, right) => {
    const kodeComparison = compareKode(left.kode, right.kode)
    if (kodeComparison !== 0) {
      return kodeComparison
    }

    return left.nama.localeCompare(right.nama, undefined, { sensitivity: 'base' })
  })
}

function flattenKlasifikasiTree(
  nodes: Klasifikasi[],
  depth = 0,
): FlatKlasifikasiOption[] {
  const flattened: FlatKlasifikasiOption[] = []

  for (const node of sortByKode(nodes)) {
    const indent = depth > 0 ? `${'  '.repeat(depth)} ` : ''
    flattened.push({
      id: node.id,
      kode: node.kode ?? null,
      nama: node.nama,
      label: `${indent}${node.nama}`,
      node,
    })

    if (node.children?.length) {
      flattened.push(...flattenKlasifikasiTree(node.children, depth + 1))
    }
  }

  return flattened
}

function findRootNode(nodes: Klasifikasi[]): Klasifikasi | null {
  if (nodes.length === 1 && nodes[0]?.is_root) {
    return nodes[0]
  }

  return nodes.find(node => node.is_root) ?? null
}

function buildInitialKlasifikasiNodes(nodes: Klasifikasi[]): Klasifikasi[] {
  const rootNode = findRootNode(nodes)
  return sortByKode(rootNode?.children ?? nodes)
}

function findNodeById(nodes: Klasifikasi[], targetId: string): Klasifikasi | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return node
    }

    const childMatch = findNodeById(node.children ?? [], targetId)
    if (childMatch) {
      return childMatch
    }
  }

  return null
}

function findPathToNode(nodes: Klasifikasi[], targetId: string): Klasifikasi[] {
  for (const node of nodes) {
    if (node.id === targetId) {
      return [node]
    }

    const childPath = findPathToNode(node.children ?? [], targetId)
    if (childPath.length > 0) {
      return [node, ...childPath]
    }
  }

  return []
}


type DokumenDetail = {
  id: string
  judul: string
  fungsi: { id: string; nama: string }
  fungsi_nama?: string
  kegiatan: { id: string; nama: string }
  kegiatan_nama?: string
  tanggal: string
  tahun: number
  lampiran_urls: any[]
  created_by: { id: string; nama: string }
  status: string
  is_ketua_tim: boolean
  bendahara_approve: { nama: string; tanggal: string } | null
  arsip: { id: string; status_arsip: string; nomor_surat: string } | null
  is_archived: boolean
  nominal_realisasi: number | null
  is_non_material?: boolean
  jenis_permintaan_id?: string | null
  jenis_permintaan_nama?: string
  kategori_permintaan_id?: string | null
  kategori_permintaan_nama?: string
  detail_permintaan_id?: string | null
  detail_permintaan_nama?: string
  jenis_dokumen_nama?: string
  jenis_dokumen_id?: string | null
}

function ArsiparisDokumenDetailPage() {
  const { id } = Route.useParams()
  const [dokumen, setDokumen] = useState<DokumenDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [klasifikasiList, setKlasifikasiList] = useState<Klasifikasi[]>([])
  const [nomorSurat, setNomorSurat] = useState('')
  const [klasifikasi, setKlasifikasi] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [currentNodes, setCurrentNodes] = useState<Klasifikasi[]>([])
  const [selectedNode, setSelectedNode] = useState<Klasifikasi | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPath, setCurrentPath] = useState<Klasifikasi[]>([])
  const [retensiAktif, setRetensiAktif] = useState<string>(RETENSI_OPTIONS[0])
  const [retensiInaktif, setRetensiInaktif] = useState<string>(RETENSI_OPTIONS[0])
  const [masaAktifBerakhir, setMasaAktifBerakhir] = useState('')
  const [masaInaktifBerakhir, setMasaInaktifBerakhir] = useState('')
  const [catatan, setCatatan] = useState('')
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [formLoading, setFormLoading] = useState(false)
  const [formSubmitError, setFormSubmitError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const allKlasifikasiOptions = useMemo(() => {
    const rootNode = findRootNode(klasifikasiList)
    return flattenKlasifikasiTree(rootNode?.children ?? klasifikasiList)
  }, [klasifikasiList])
  const filteredSearchResults = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    if (!normalizedQuery) {
      return []
    }

    return allKlasifikasiOptions.filter((option) => {
      const kode = option.kode?.toLowerCase() ?? ''
      return option.nama.toLowerCase().includes(normalizedQuery) || kode.includes(normalizedQuery)
    })
  }, [allKlasifikasiOptions, searchQuery])
  const visibleNodes = searchQuery.trim() ? [] : currentNodes
  const breadcrumbPath = currentPath.map(node => node.nama).join(' / ')

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    setLoading(true); setFetchError(null)
    try {
      const json = await apiFetch<{ dokumen: DokumenDetail }>(`/arsiparis/dokumen/${id}`)
      setDokumen(json.dokumen)
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        setFetchError(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error ?? 'Dokumen tidak dapat diakses'
          : 'Dokumen tidak dapat diakses')
        return
      }

      setFetchError('Terjadi kesalahan saat mengambil data')
    }
    finally { setLoading(false) }
  }

  useEffect(() => {
    apiFetch<{ klasifikasi?: Klasifikasi[] }>('/arsiparis/klasifikasi')
      .then(json => setKlasifikasiList(json.klasifikasi ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const initialNodes = buildInitialKlasifikasiNodes(klasifikasiList)
    setCurrentNodes(initialNodes)
    setCurrentPath([])

    if (!klasifikasi) {
      setSelectedNode(null)
      return
    }

    const matchedNode = findNodeById(klasifikasiList, klasifikasi)
    setSelectedNode(matchedNode)
  }, [klasifikasiList])

  useEffect(() => {
    if (!dropdownOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false)
        setSearchQuery('')
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [dropdownOpen])

  function recalcDates() {
    if (!dokumen) return
    const archivedAt = dokumen.tanggal || new Date().toISOString().split('T')[0]
    const activeYears = retensiToYears(retensiAktif)
    const inactiveYears = retensiToYears(retensiInaktif)
    setMasaAktifBerakhir(calcDate(archivedAt, activeYears))
    const aktifEndDate = masaAktifBerakhir || calcDate(archivedAt, activeYears)
    setMasaInaktifBerakhir(calcDate(aktifEndDate, inactiveYears))
  }

  useEffect(() => { recalcDates() }, [dokumen, retensiAktif, retensiInaktif])

  async function handleArchive() {
    const errors: Record<string, string> = {}
    if (!nomorSurat.trim()) errors.nomorSurat = 'Nomor surat wajib diisi'
    if (!klasifikasi) errors.klasifikasi = 'Klasifikasi wajib dipilih'
    if (!masaAktifBerakhir) errors.masaAktifBerakhir = 'Masa aktif berakhir wajib diisi'
    if (!masaInaktifBerakhir) errors.masaInaktifBerakhir = 'Masa inaktif berakhir wajib diisi'
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return }

    setFormLoading(true); setFormSubmitError(null)
    try {
      await apiMutation(`/api/arsiparis/dokumen/${id}/archive`, {
        method: 'POST',
        body: {
          nomor_surat: nomorSurat.trim(),
          klasifikasi: selectedNode?.nama ?? '',
          retensi_aktif: retensiAktif,
          retensi_inaktif: retensiInaktif,
          masa_aktif_berakhir: masaAktifBerakhir,
          masa_inaktif_berakhir: masaInaktifBerakhir,
          catatan_arsiparis: catatan.trim() || undefined,
        },
      })
      window.location.href = '/arsiparis/aktif'
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        setFormSubmitError(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error ?? 'Gagal'
          : 'Gagal')
        setFormLoading(false)
        return
      }

      setFormSubmitError('Terjadi kesalahan'); setFormLoading(false)
    }
  }

  function openKlasifikasiDropdown() {
    setDropdownOpen(true)
    setSearchQuery('')

    if (selectedNode) {
      const path = findPathToNode(klasifikasiList, selectedNode.id)
      if (path.length > 0) {
        const parentPath = path.slice(0, -1)
        const parentNode = parentPath[parentPath.length - 1] ?? null
        setCurrentPath(parentPath)
        setCurrentNodes(sortByKode(parentNode?.children ?? buildInitialKlasifikasiNodes(klasifikasiList)))
        return
      }
    }

    setCurrentPath([])
    setCurrentNodes(buildInitialKlasifikasiNodes(klasifikasiList))
  }

  function handleKlasifikasiNodeClick(node: Klasifikasi) {
    const children = sortByKode(node.children ?? [])

    if (children.length > 0) {
      setSearchQuery('')
      setCurrentPath(prev => [...prev, node])
      setCurrentNodes(children)
      return
    }

    setSelectedNode(node)
    setKlasifikasi(node.id)
    setDropdownOpen(false)
    setSearchQuery('')
    setFormErrors(prev => ({ ...prev, klasifikasi: '' }))
  }

  function handleKlasifikasiBack() {
    if (currentPath.length === 0) {
      setCurrentNodes(buildInitialKlasifikasiNodes(klasifikasiList))
      return
    }

    const nextPath = currentPath.slice(0, -1)
    const parentNode = nextPath[nextPath.length - 1] ?? null
    setCurrentPath(nextPath)
    setCurrentNodes(sortByKode(parentNode?.children ?? buildInitialKlasifikasiNodes(klasifikasiList)))
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={24} className="animate-spin text-primary" />
    </div>
  )

  if (fetchError || !dokumen) return (
    <div className="text-center py-20">
      <AlertCircle size={32} className="text-error mx-auto mb-3" />
      <p className="text-sm text-on-surface-variant">{fetchError ?? 'Dokumen tidak ditemukan'}</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={() => window.location.href = '/arsiparis/inbox'}>Kembali ke Inbox</Button>
    </div>
  )

  const isArchived = !!dokumen.arsip

  return (
    <PageLayout>
      <div className="max-w-3xl mx-auto space-y-6">

        <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest">
          <Link to="/arsiparis" className="hover:text-primary">Kepala Sub Bagian Umum</Link>
          <ChevronRight size={10} />
          <Link to="/arsiparis/inbox" className="hover:text-primary">Pemberkasan</Link>
          <ChevronRight size={10} />
          <span className="text-primary">Detail</span>
        </div>

        <h2 className="font-headline text-xl font-extrabold text-on-surface">{dokumen.judul}</h2>

        <div className="flex items-center gap-3">
          <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">COMPLETED</Badge>
          {isArchived && (
            <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs"> Sudah Diarsipkan (#{dokumen.arsip?.nomor_surat})</Badge>
          )}
        </div>

        <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
          <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">Informasi Dokumen</p>
          <div className="grid grid-cols-2 gap-4">
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Fungsi</p><p className="text-sm font-semibold text-on-surface">{dokumen.fungsi.nama ?? '—'}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Kegiatan</p><p className="text-sm font-semibold text-on-surface">{dokumen.kegiatan.nama ?? '—'}</p></div>
            {dokumen.jenis_permintaan_id && (
              <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Jenis Permintaan</p><p className="text-sm font-semibold text-on-surface">{dokumen.jenis_permintaan_nama ?? '—'}</p></div>
            )}
            {dokumen.kategori_permintaan_id && (
              <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Kategori Permintaan</p><p className="text-sm font-semibold text-on-surface">{dokumen.kategori_permintaan_nama ?? '—'}</p></div>
            )}
            {dokumen.detail_permintaan_id && (
              <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Detail Permintaan</p><p className="text-sm font-semibold text-on-surface">{dokumen.detail_permintaan_nama ?? '—'}</p></div>
            )}
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tahun</p><p className="text-sm font-semibold text-on-surface">{dokumen.tahun}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tanggal</p><p className="text-sm font-semibold text-on-surface">{formatDate(dokumen.tanggal)}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Peran</p><p className="text-sm font-semibold text-on-surface">{dokumen.is_ketua_tim ? 'Ketua Tim' : 'Anggota'}</p></div>
            <div className="col-span-2"><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Disetujui Bendahara</p><p className="text-sm font-semibold text-on-surface">{dokumen.bendahara_approve ? `${dokumen.bendahara_approve.nama} — ${formatDate(dokumen.bendahara_approve.tanggal)}` : '—'}</p></div>
            {dokumen.nominal_realisasi !== null && dokumen.nominal_realisasi !== undefined && (
              <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Nominal Realisasi</p><p className="text-sm font-semibold text-on-surface">Rp {dokumen.nominal_realisasi.toLocaleString('id-ID')}</p></div>
            )}
          </div>
        </div>

        {/* Lampiran */}
        <AttachmentViewer dokumen={dokumen as any} lampiranUrls={dokumen.lampiran_urls} />

        <ActivityLog dokumenId={id} />

        {isArchived ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-center gap-3">
            <CheckCircle2 size={20} className="text-green-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-700">Dokumen sudah diarsipkan</p>
              <p className="text-xs text-green-600">Nomor Surat: {dokumen.arsip?.nomor_surat}</p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
            <p className="text-xs font-bold text-outline uppercase tracking-widest mb-4">Formulir Pemberkasan</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1.5">Nomor Surat <span className="text-error">*</span></label>
                <input
                  type="text"
                  value={nomorSurat}
                  onChange={e => { setNomorSurat(e.target.value); setFormErrors(p => ({ ...p, nomorSurat: '' })) }}
                  placeholder="Contoh: 001/ARSIP/2025"
                  className={cn('w-full px-3 py-2 border rounded-lg text-sm text-foreground bg-white outline-none focus:ring-1 focus:ring-ring', formErrors.nomorSurat ? 'border-error' : 'border-border')}
                />
                {formErrors.nomorSurat && <p className="text-[10px] text-error mt-1">{formErrors.nomorSurat}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1.5">Klasifikasi <span className="text-error">*</span></label>
                <div ref={dropdownRef} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      if (dropdownOpen) {
                        setDropdownOpen(false)
                        setSearchQuery('')
                        return
                      }

                      openKlasifikasiDropdown()
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-left text-sm text-foreground outline-none focus:ring-1 focus:ring-ring',
                      formErrors.klasifikasi ? 'border-error' : 'border-border',
                    )}
                  >
                    <div className="min-w-0">
                      {selectedNode ? (
                        <>
                          <p className="truncate font-medium text-on-surface">
                            {selectedNode.nama}
                          </p>
                          <p className="truncate text-[10px] text-on-surface-variant">
                            {selectedNode.kode ?? 'Tanpa kode'}
                          </p>
                        </>
                      ) : (
                        <p className="text-on-surface-variant">Pilih Klasifikasi</p>
                      )}
                    </div>
                    <ChevronDown
                      size={16}
                      className={cn('shrink-0 text-outline transition-transform', dropdownOpen && 'rotate-180')}
                    />
                  </button>

                  {dropdownOpen && (
                    <div className="absolute z-20 mt-2 w-full rounded-xl border border-outline-variant/30 bg-white shadow-lg">
                      <div className="border-b border-outline-variant/20 p-3">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline/50" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Cari nama atau kode klasifikasi"
                            className="w-full rounded-lg border border-border bg-white py-2 pr-3 pl-9 text-xs outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>

                        {!searchQuery.trim() && (
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={handleKlasifikasiBack}
                              disabled={currentPath.length === 0}
                              className="gap-1.5 px-2 text-xs"
                            >
                              <ChevronLeft size={14} />
                              Back
                            </Button>
                            <p className="truncate text-[10px] text-on-surface-variant">
                              {breadcrumbPath || 'Root'}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="max-h-72 overflow-y-auto p-2">
                        {searchQuery.trim() ? (
                          filteredSearchResults.length === 0 ? (
                            <div className="px-3 py-6 text-center text-xs text-on-surface-variant">
                              Tidak ada hasil pencarian.
                            </div>
                          ) : (
                            filteredSearchResults.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => handleKlasifikasiNodeClick(option.node)}
                                className="flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-surface-container-low/40"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-on-surface">{option.nama}</p>
                                  <p className="truncate text-[10px] text-on-surface-variant">{option.kode ?? 'Tanpa kode'}</p>
                                </div>
                              </button>
                            ))
                          )
                        ) : visibleNodes.length === 0 ? (
                          <div className="px-3 py-6 text-center text-xs text-on-surface-variant">
                            Tidak ada klasifikasi pada level ini.
                          </div>
                        ) : (
                          visibleNodes.map((node) => {
                            const hasChildren = (node.children?.length ?? 0) > 0

                            return (
                              <button
                                key={node.id}
                                type="button"
                                onClick={() => handleKlasifikasiNodeClick(node)}
                                className="flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-surface-container-low/40"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-on-surface">{node.nama}</p>
                                  <p className="truncate text-[10px] text-on-surface-variant">{node.kode ?? 'Tanpa kode'}</p>
                                </div>
                                {hasChildren && (
                                  <ChevronRight size={14} className="mt-0.5 shrink-0 text-outline" />
                                )}
                              </button>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {formErrors.klasifikasi && <p className="text-[10px] text-error mt-1">{formErrors.klasifikasi}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1.5">Retensi Aktif <span className="text-error">*</span></label>
                  <select
                    value={retensiAktif}
                    onChange={e => setRetensiAktif(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-white outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                  >
                    {RETENSI_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1.5">Retensi Inaktif <span className="text-error">*</span></label>
                  <select
                    value={retensiInaktif}
                    onChange={e => setRetensiInaktif(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-white outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                  >
                    {RETENSI_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1.5">Masa Aktif Berakhir</label>
                  <input
                    type="date"
                    value={masaAktifBerakhir}
                    onChange={e => setMasaAktifBerakhir(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-white outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                    readOnly
                  />
                  {formErrors.masaAktifBerakhir && <p className="text-[10px] text-error mt-1">{formErrors.masaAktifBerakhir}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1.5">Masa Inaktif Berakhir</label>
                  <input
                    type="date"
                    value={masaInaktifBerakhir}
                    onChange={e => setMasaInaktifBerakhir(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-white outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                    readOnly
                  />
                  {formErrors.masaInaktifBerakhir && <p className="text-[10px] text-error mt-1">{formErrors.masaInaktifBerakhir}</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1.5">Catatan Kepala Sub Bagian Umum <span className="text-outline font-normal">(opsional)</span></label>
                <textarea
                  value={catatan}
                  onChange={e => setCatatan(e.target.value)}
                  placeholder="Catatan tambahan..."
                  rows={3}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-white outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </div>

              {formSubmitError && (
                <div className="flex items-center gap-2 p-3 bg-error/5 border border-error/20 rounded-lg">
                  <AlertCircle size={14} className="text-error shrink-0" />
                  <p className="text-xs text-error">{formSubmitError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button className="flex-1 gap-1.5" onClick={handleArchive} disabled={!!formLoading}>
                  {formLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Terima
                </Button>
              </div>
            </div>
          </div>
        )}

        <Link to="/arsiparis/inbox">
          <Button variant="outline" size="sm" className="gap-1.5"><ChevronRight size={14} className="rotate-180" />Kembali</Button>
        </Link>
      </div>
    </PageLayout>
  )
}
