import { createFileRoute, Link, useBlocker } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArchivePanel } from '#/components/archive/ArchivePagePrimitives'
import { WorkflowPanel } from '#/components/workflow/PpkPpspmPagePrimitives'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { ConfirmDialog } from '#/components/ui/ConfirmDialog'
import { Badge } from '#/components/ui/badge'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { StatusBadge } from '#/components/ui/StatusBadge'
import {
  ChevronRight, AlertCircle,
  Loader2, CheckCircle2,
  Search, ChevronDown, ChevronLeft,
  FileText, History, Info, Banknote, Archive,
} from 'lucide-react'
import { ActivityLog } from '#/components/dokumen/ActivityLog'
import { AttachmentViewer } from '#/components/dokumen/AttachmentViewer'
import { cn } from '#/lib/utils'
import { formatDate } from '#/lib/utils/format'
import { ApiError, apiFetch } from '#/lib/api-client'
import { apiMutation } from '#/lib/api-mutation'

export const Route = createFileRoute('/kasubag/dokumen/$id/')({
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
  ppspm_approve: { nama: string; tanggal: string } | null
  arsip: { id: string; status_arsip: string; nomor_surat: string | null } | null
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
  komponen_id?: string | null
  komponen_nama?: string
  nama_dokumen?: string | null
}

const DETAIL_TABS = [
  { key: 'metadata', label: 'Metadata Dokumen', icon: Info },
  { key: 'lampiran', label: 'Lampiran', icon: FileText },
  { key: 'riwayat', label: 'Riwayat', icon: History },
] as const

type DetailTab = typeof DETAIL_TABS[number]['key']

type ClassificationDraftState = {
  klasifikasi: string
  catatan: string
}

const CLASSIFICATION_DRAFT_STORAGE_PREFIX = 'dms:arsiparis:pengklasifikasian-dokumen:draft:'

function getClassificationDraftKey(id: string) {
  return `${CLASSIFICATION_DRAFT_STORAGE_PREFIX}${id}`
}

function readClassificationDraft(id: string): ClassificationDraftState | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(getClassificationDraftKey(id))
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<ClassificationDraftState>
    return {
      klasifikasi: typeof parsed.klasifikasi === 'string' ? parsed.klasifikasi : '',
      catatan: typeof parsed.catatan === 'string' ? parsed.catatan : '',
    }
  } catch {
    return null
  }
}

function writeClassificationDraft(id: string, draft: ClassificationDraftState) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(getClassificationDraftKey(id), JSON.stringify(draft))
  } catch {
    // Ignore storage failures; the form remains usable.
  }
}

function clearClassificationDraft(id: string) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(getClassificationDraftKey(id))
  } catch {
    // Ignore storage failures.
  }
}

function ArsiparisDokumenDetailPage() {
  const { id } = Route.useParams()
  const initialDraftRef = useRef<ClassificationDraftState | null>(readClassificationDraft(id))
  const [dokumen, setDokumen] = useState<DokumenDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [klasifikasiList, setKlasifikasiList] = useState<Klasifikasi[]>([])
  const [klasifikasi, setKlasifikasi] = useState(() => initialDraftRef.current?.klasifikasi ?? '')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [currentNodes, setCurrentNodes] = useState<Klasifikasi[]>([])
  const [selectedNode, setSelectedNode] = useState<Klasifikasi | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPath, setCurrentPath] = useState<Klasifikasi[]>([])
  const [catatan, setCatatan] = useState(() => initialDraftRef.current?.catatan ?? '')
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [formLoading, setFormLoading] = useState(false)
  const [formSubmitError, setFormSubmitError] = useState<string | null>(null)
  const [classificationConfirmOpen, setClassificationConfirmOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<DetailTab>('metadata')
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const skipBeforeUnloadRef = useRef(false)
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
  const isArchived = dokumen?.is_archived === true
  const isDirty = !isArchived && !formLoading && Boolean(klasifikasi || catatan.trim())
  const leaveBlocker = useBlocker({
    shouldBlockFn: ({ current, next }) => isDirty && current.pathname !== next.pathname,
    enableBeforeUnload: false,
    disabled: !isDirty,
    withResolver: true,
  })

  useEffect(() => { fetchData() }, [id])

  useEffect(() => {
    const draft = readClassificationDraft(id)
    initialDraftRef.current = draft
    setKlasifikasi(draft?.klasifikasi ?? '')
    setCatatan(draft?.catatan ?? '')
    setFormErrors({})
    setFormSubmitError(null)
  }, [id])

  async function fetchData() {
    setLoading(true); setFetchError(null)
    try {
      const json = await apiFetch<{ dokumen: DokumenDetail }>(`/kasubag/dokumen/${id}`)
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
    apiFetch<{ klasifikasi?: Klasifikasi[] }>('/kasubag/klasifikasi', {
      query: { eligible_for_berkas: 'true' },
    })
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
  }, [klasifikasiList, klasifikasi])

  useEffect(() => {
    if (!isDirty) return

    writeClassificationDraft(id, {
      klasifikasi,
      catatan,
    })
  }, [catatan, id, isDirty, klasifikasi])

  useEffect(() => {
    if (isDirty || formLoading) return

    clearClassificationDraft(id)
  }, [formLoading, id, isDirty])

  useEffect(() => {
    if (typeof window === 'undefined' || !isDirty) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (skipBeforeUnloadRef.current) return

      event.preventDefault()
      event.returnValue = 'Perubahan yang belum disimpan akan hilang.'
      return 'Perubahan yang belum disimpan akan hilang.'
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

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

  async function handleArchive() {
    const errors: Record<string, string> = {}
    if (!klasifikasi) errors.klasifikasi = 'Jenis pembayaran wajib dipilih'
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return }

    setClassificationConfirmOpen(true)
  }

  async function submitArchive() {
    if (!klasifikasi) {
      setClassificationConfirmOpen(false)
      setFormErrors({ klasifikasi: 'Jenis pembayaran wajib dipilih' })
      return
    }

    setFormLoading(true); setFormSubmitError(null)
    try {
      await apiMutation(`/api/kasubag/dokumen/${id}/archive`, {
        method: 'POST',
        body: {
          klasifikasi_id: klasifikasi,
          catatan_arsiparis: catatan.trim() || undefined,
        },
      })
      clearClassificationDraft(id)
      skipBeforeUnloadRef.current = true
      window.location.href = '/kasubag/berkas'
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        setFormSubmitError(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error ?? 'Gagal'
          : 'Gagal')
        setClassificationConfirmOpen(false)
        setFormLoading(false)
        return
      }

      setFormSubmitError('Terjadi kesalahan')
      setClassificationConfirmOpen(false)
      setFormLoading(false)
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
    <LoadingState label="Memuat detail dokumen" />
  )

  if (fetchError || !dokumen) return (
    <ErrorState
      title="Dokumen tidak dapat dimuat"
      description={fetchError ?? 'Dokumen tidak ditemukan'}
      action={<Button variant="outline" size="sm" onClick={() => window.location.href = '/kasubag/inbox'}>Kembali ke Pengklasifikasian</Button>}
      variant="page"
    />
  )

  return (
    <PageLayout className="min-h-full bg-[#FFF9F4] px-4 py-4 sm:px-6 lg:px-7 lg:py-5">
      <div className="mx-auto max-w-[92rem] space-y-4">
        <div className="flex items-center gap-3">
          <Link
            to="/kasubag/inbox"
            aria-label="Kembali ke Pengklasifikasian Dokumen"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-800"
          >
            <ChevronLeft size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="line-clamp-2 font-headline text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">
              {dokumen.judul}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <Banknote size={13} className="text-zinc-500" />
              <span className="font-medium text-zinc-800">Kepala Sub Bagian Umum</span>
              <ChevronRight size={12} className="text-zinc-300" />
              <span>Pengklasifikasian Dokumen</span>
            </div>
          </div>
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <StatusBadge status="COMPLETED" className="text-xs font-semibold" />
            {isArchived && (
              <Badge className="border-orange-200 bg-orange-100 text-xs text-orange-700">
                Sudah Diklasifikasikan
              </Badge>
            )}
          </div>
        </div>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 px-1 py-1 sm:px-2">
            <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-[#F0E1D5] bg-[#F7F2EC] p-1">
              {DETAIL_TABS.map(tab => {
                const selected = activeTab === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      'flex min-h-8 items-center justify-center rounded-lg px-3 text-[12px] font-bold transition',
                      selected
                        ? 'bg-[#FFFDF9] text-[#FF5A00] shadow-sm'
                        : 'text-zinc-500 hover:bg-[#FFFAF6] hover:text-zinc-950',
                    )}
                    aria-pressed={selected}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
          <WorkflowPanel className="min-w-0 overflow-visible border-0 bg-transparent p-0 shadow-none">
            <div className="rounded-t-[1.5rem] bg-gradient-to-r from-[#F97316] to-[#FB923C] px-4 py-4 text-white sm:px-5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white">
                  {(() => {
                    const Icon = DETAIL_TABS.find(tab => tab.key === activeTab)?.icon ?? Info
                    return <Icon size={17} />
                  })()}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-headline text-base font-bold tracking-tight text-white sm:text-lg">
                    {DETAIL_TABS.find(tab => tab.key === activeTab)?.label}
                  </h2>
                  <p className="mt-0.5 max-w-2xl text-[10px] font-medium leading-relaxed text-white/90 sm:text-xs">
                    {activeTab === 'metadata'
                      ? 'Tinjau dokumen selesai sebelum dimasukkan ke berkas Cara Pembayaran.'
                      : activeTab === 'lampiran'
                        ? 'Kelengkapan dokumen dengan aksi pratinjau dan unduh.'
                        : 'Riwayat aktivitas dokumen.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="min-w-0 rounded-b-[1.5rem] border border-t-0 border-[#F1E5DA] bg-[#FFFDF9] p-4 sm:p-5">
        <section className={cn(activeTab === 'metadata' ? 'block' : 'hidden')}>
        <div className="rounded-[1.15rem] border border-[#F1E5DA] bg-[#FFFDF9] px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="hidden">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Informasi Dokumen</p>
              <p className="mt-1 text-xs text-zinc-600">Ringkasan dokumen yang akan dimasukkan ke berkas berdasarkan Cara Pembayaran.</p>
            </div>
            {dokumen.nominal_realisasi !== null && dokumen.nominal_realisasi !== undefined && (
              <div className="w-fit text-left sm:text-right">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Nominal Realisasi</p>
                <p className="mt-1 font-mono text-base font-bold text-zinc-950">Rp {dokumen.nominal_realisasi.toLocaleString('id-ID')}</p>
              </div>
            )}
          </div>
          <div className="grid gap-x-10 gap-y-4 md:grid-cols-2 [&>div]:min-w-0 [&_p:first-child]:mb-1 [&_p:first-child]:text-[9px] [&_p:first-child]:font-black [&_p:first-child]:uppercase [&_p:first-child]:tracking-[0.18em] [&_p:first-child]:text-zinc-500 [&_p:last-child]:break-words [&_p:last-child]:text-[13px] [&_p:last-child]:font-bold [&_p:last-child]:leading-snug [&_p:last-child]:text-zinc-950 sm:[&_p:last-child]:text-sm">
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Fungsi</p><p className="text-sm font-semibold text-on-surface">{dokumen.fungsi.nama ?? '—'}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Kegiatan</p><p className="text-sm font-semibold text-on-surface">{dokumen.kegiatan.nama ?? '—'}</p></div>
            {dokumen.komponen_id && (
              <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Komponen</p><p className="text-sm font-semibold text-on-surface">{dokumen.komponen_nama ?? '—'}</p></div>
            )}
            {dokumen.is_non_material && (
              <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Nama Dokumen</p><p className="text-sm font-semibold text-on-surface">{dokumen.nama_dokumen ?? '—'}</p></div>
            )}
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
            {dokumen.nominal_realisasi !== null && dokumen.nominal_realisasi !== undefined && (
              <div>
                <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Nominal Realisasi</p>
                <p className="font-mono text-sm font-bold text-zinc-950">Rp {dokumen.nominal_realisasi.toLocaleString('id-ID')}</p>
              </div>
            )}
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Peran</p><p className="text-sm font-semibold text-on-surface">{dokumen.is_ketua_tim ? 'Ketua Tim' : 'Anggota'}</p></div>
            <div className="col-span-2"><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Disetujui PPSPM</p><p className="text-sm font-semibold text-on-surface">{dokumen.ppspm_approve ? `${dokumen.ppspm_approve.nama} — ${formatDate(dokumen.ppspm_approve.tanggal)}` : '—'}</p></div>
          </div>
        </div>
        </section>

        <section className={cn(activeTab === 'lampiran' ? 'block' : 'hidden')}>
        <AttachmentViewer dokumen={dokumen as any} lampiranUrls={dokumen.lampiran_urls} />
        </section>

        <section className={cn(activeTab === 'riwayat' ? 'block' : 'hidden')}>
        <ActivityLog dokumenId={id} />
        </section>
            </div>
          </WorkflowPanel>

          <aside className="min-w-0 space-y-3 xl:sticky xl:top-3">
        {isArchived ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-center gap-3">
            <CheckCircle2 size={20} className="text-green-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-700">Dokumen sudah diklasifikasikan</p>
              <p className="text-xs text-green-600">Jenis pembayaran sudah dipilih untuk dokumen ini.</p>
            </div>
          </div>
        ) : (
          <ArchivePanel className="rounded-[1.35rem] border-[#F1E5DA] bg-[#FFFDF9] p-4 shadow-[0_6px_18px_rgba(15,23,42,0.07)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              Formulir Pengindeksan
            </p>
            <h2 className="mt-1.5 font-headline text-xl font-extrabold tracking-tight text-zinc-950">
              Klasifikasi Dokumen
            </h2>
            <div className="my-4 h-px bg-[#F0E1D5]" />
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-extrabold text-zinc-950">1. Cara Pembayaran <span className="text-error">*</span></label>
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
                      'flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border bg-[#FFFDF9] px-3 py-2.5 text-left text-sm text-zinc-950 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70',
                      formErrors.klasifikasi ? 'border-error' : 'border-[#F0E1D5]',
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
                        <p className="font-semibold text-zinc-950">Pilih Cara Pembayaran / Klasifikasi</p>
                      )}
                    </div>
                    <ChevronDown
                      size={16}
                      className={cn('shrink-0 text-outline transition-transform', dropdownOpen && 'rotate-180')}
                    />
                  </button>

                  {dropdownOpen && (
                    <div className="absolute z-20 mt-2 w-full rounded-[1.05rem] border border-[#F0E1D5] bg-[#FFFDF9] shadow-lg">
                      <div className="border-b border-orange-100 p-3">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline/50" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Cari nama atau kode jenis pembayaran"
                            className="w-full rounded-xl border border-[#F0E1D5] bg-[#FFFDF9] py-2 pr-3 pl-9 text-xs outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70"
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
                                className="flex w-full cursor-pointer items-start justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-orange-50/70"
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
                            Tidak ada jenis pembayaran pada level ini.
                          </div>
                        ) : (
                          visibleNodes.map((node) => {
                            const hasChildren = (node.children?.length ?? 0) > 0

                            return (
                              <button
                                key={node.id}
                                type="button"
                                onClick={() => handleKlasifikasiNodeClick(node)}
                                className="flex w-full cursor-pointer items-start justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-orange-50/70"
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
                {formErrors.klasifikasi && <p className="mt-1 text-[10px] text-error">{formErrors.klasifikasi}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-extrabold text-zinc-950">2. Catatan Klasifikasi <span className="font-semibold text-zinc-500">(Opsional)</span></label>
                <textarea
                  value={catatan}
                  onChange={e => setCatatan(e.target.value)}
                  placeholder="Tambahkan penjelasan atau catatan klasifikasi jika diperlukan..."
                  rows={4}
                  className="w-full resize-none rounded-xl border border-[#F0E1D5] bg-[#FFFDF9] px-3 py-2.5 text-sm leading-relaxed text-zinc-950 outline-none transition placeholder:text-zinc-500 focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70"
                />
              </div>

              {formSubmitError && (
                <div className="flex items-center gap-2 p-3 bg-error/5 border border-error/20 rounded-lg">
                  <AlertCircle size={14} className="text-error shrink-0" />
                  <p className="text-xs text-error">{formSubmitError}</p>
                </div>
              )}

              <div className="space-y-2.5 border-t border-[#F0E1D5] pt-4">
                <Button className="h-11 w-full gap-2 rounded-xl bg-[#FF5A00] text-sm font-extrabold text-white shadow-[0_8px_16px_rgba(255,90,0,0.18)] hover:bg-[#EA580C]" onClick={handleArchive} disabled={!!formLoading}>
                  {formLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Klasifikasikan Dokumen
                </Button>
                <Link to="/kasubag/inbox" className="flex h-11 w-full items-center justify-center rounded-xl border border-[#F0E1D5] bg-[#FFFDF9] text-sm font-extrabold text-zinc-950 transition hover:bg-[#FFF8F1]">
                  Kembali
                </Link>
              </div>
            </div>
          </ArchivePanel>
        )}
          </aside>
        </div>

      </div>
      <ConfirmDialog
        open={classificationConfirmOpen}
        onOpenChange={(open) => {
          if (!formLoading) setClassificationConfirmOpen(open)
        }}
        tone="primary"
        icon={<Archive className="size-6" />}
        title="Klasifikasikan dokumen?"
        description="Dokumen akan dimasukkan ke folder Cara Pembayaran yang dipilih."
        confirmLabel="Klasifikasikan Dokumen"
        cancelLabel="Batalkan"
        size="md"
        pending={formLoading}
        onConfirm={submitArchive}
      >
        <div className="rounded-2xl border border-[#F1E5DA] bg-[#FFFDF9] p-4">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
            <Banknote size={13} />
            Cara Pembayaran Terpilih
          </p>
          <div className="mt-3 rounded-xl border border-[#F1E5DA] bg-white px-3 py-2 text-sm font-extrabold text-zinc-950">
            Cara Pembayaran: {selectedNode ? `${selectedNode.kode ? `${selectedNode.kode} - ` : ''}${selectedNode.nama}` : '-'}
          </div>
          <ul className="mt-4 space-y-2 border-t border-[#F1E5DA] pt-4 text-sm font-medium leading-relaxed text-zinc-700">
            <li>Dokumen masuk ke folder berkas yang masih terbuka.</li>
            <li>Metadata belum diisi pada tahap ini.</li>
          </ul>
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={leaveBlocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open && leaveBlocker.status === 'blocked') {
            leaveBlocker.reset()
          }
        }}
        tone="warning"
        title="Keluar tanpa menyimpan?"
        description="Perubahan yang belum disimpan akan hilang."
        confirmLabel="Keluar tanpa menyimpan"
        cancelLabel="Tetap di halaman"
        onConfirm={() => {
          clearClassificationDraft(id)
          skipBeforeUnloadRef.current = true
          if (leaveBlocker.status === 'blocked') {
            leaveBlocker.proceed()
          }
        }}
      />
    </PageLayout>
  )
}
