import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  AlertCircle,
  Archive,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  FileText,
  Folder,
  FolderOpen,
  Info,
  Loader2,
  Network,
  Pencil,
  Plus,
  X,
} from 'lucide-react'

import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { ApiError, apiFetch } from '#/lib/api-client'
import { apiMutation } from '#/lib/api-mutation'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/arsiparis/klasifikasi')({ component: KlasifikasiPage })

type KlasifikasiNode = {
  id: string
  nama: string
  kode: string | null
  deskripsi: string | null
  parent_id: string | null
  created_at: string
  is_root: boolean
  is_active?: boolean
  children: KlasifikasiNode[]
}

type KlasifikasiResponse = {
  klasifikasi?: KlasifikasiNode[]
  error?: string
}

function hasChildNodes(node: KlasifikasiNode): boolean {
  return node.children.length > 0
}

function isActiveNode(node: KlasifikasiNode): boolean {
  return node.is_active !== false
}

function getJenisPembayaranLabel(node: KlasifikasiNode): string {
  if (!isActiveNode(node)) return 'Tidak, nonaktif'
  if (hasChildNodes(node)) return 'Tidak, klasifikasi induk'
  return 'Ya, pilihan akhir'
}

function classificationDisplay(node: KlasifikasiNode): string {
  return node.kode ? `${node.kode} - ${node.nama}` : node.nama
}

function ClassificationTypeBadge({
  node,
  selected = false,
  short = false,
}: {
  node: KlasifikasiNode
  selected?: boolean
  short?: boolean
}) {
  const isParent = hasChildNodes(node)

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-extrabold',
        selected
          ? 'border-white/20 bg-white/20 text-white'
          : isParent
            ? 'border-amber-200 bg-amber-50 text-amber-700'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700',
      )}
    >
      {isParent ? (short ? 'Induk' : 'Klasifikasi Induk') : 'Pilihan Akhir'}
    </span>
  )
}

function ClassificationStatusBadge({
  node,
  selected = false,
}: {
  node: KlasifikasiNode
  selected?: boolean
}) {
  const active = isActiveNode(node)

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-extrabold',
        selected
          ? 'border-white/20 bg-white/15 text-white'
          : active
            ? 'border-orange-200 bg-orange-50 text-orange-700'
            : 'border-zinc-200 bg-zinc-100 text-zinc-600',
      )}
    >
      {active ? 'Aktif' : 'Nonaktif'}
    </span>
  )
}

function KlasifikasiTree({
  nodes,
  selectedId,
  onSelect,
  onAddChild,
  level = 0,
}: {
  nodes: KlasifikasiNode[]
  selectedId: string | null
  onSelect: (node: KlasifikasiNode) => void
  onAddChild: (node: KlasifikasiNode) => void
  level?: number
}) {
  return (
    <div className="space-y-1.5">
      {nodes.map(node => (
        <TreeNode
          key={node.id}
          node={node}
          selectedId={selectedId}
          onSelect={onSelect}
          onAddChild={onAddChild}
          level={level}
        />
      ))}
    </div>
  )
}

function TreeNode({
  node,
  selectedId,
  onSelect,
  onAddChild,
  level,
}: {
  node: KlasifikasiNode
  selectedId: string | null
  onSelect: (node: KlasifikasiNode) => void
  onAddChild: (node: KlasifikasiNode) => void
  level: number
}) {
  const [isExpanded, setIsExpanded] = useState(true)
  const hasChildren = hasChildNodes(node)
  const isSelected = selectedId === node.id
  const isInactive = !isActiveNode(node)

  return (
    <div>
      <div
        className={cn(
          'group flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2.5 transition-all',
          isSelected
            ? 'border-[#FF5A00] bg-[#FF5A00] text-white shadow-md shadow-orange-500/20'
            : isInactive
              ? 'border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100'
              : 'border-[#F1E5DA] bg-[#FFFDF9] text-zinc-950 hover:border-orange-200 hover:bg-[#FFF8F1]',
        )}
        style={{ paddingLeft: `${level * 16 + 10}px` }}
        onClick={() => onSelect(node)}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setIsExpanded(!isExpanded)
          }}
          className={cn(
            'shrink-0 rounded-lg p-1 transition-colors',
            isSelected ? 'text-white/80 hover:bg-white/15' : 'text-zinc-500 hover:bg-orange-100/60',
          )}
          aria-label={`${isExpanded ? 'Tutup' : 'Buka'} klasifikasi ${node.nama}`}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="block w-[14px]" />
          )}
        </button>

        <span className={cn('shrink-0', isSelected ? 'text-white' : isInactive ? 'text-zinc-400' : 'text-[#FF5A00]')}>
          {hasChildren ? (
            isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />
          ) : (
            <FileText size={16} />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className={cn(
            'block truncate text-sm font-extrabold',
            isSelected ? 'text-white' : isInactive ? 'text-zinc-500' : 'text-zinc-950',
          )}>
            {node.kode && (
              <span className={cn(
                'mr-1.5 rounded-lg px-1.5 py-0.5 font-mono text-[11px]',
                isSelected ? 'bg-white/20 text-white' : 'bg-orange-50 text-[#FF5A00]',
              )}>
                {node.kode}
              </span>
            )}
            {node.nama}
          </span>
        </span>

        <div className="hidden shrink-0 items-center gap-1.5 min-[520px]:flex">
          <ClassificationTypeBadge node={node} selected={isSelected} short />
          {isInactive && <ClassificationStatusBadge node={node} selected={isSelected} />}
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onAddChild(node)
          }}
          className={cn(
            'shrink-0 rounded-xl p-1.5 opacity-100 transition-colors sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100',
            isSelected
              ? 'text-white/80 hover:bg-white/15 hover:text-white'
              : 'border border-orange-100 bg-orange-50 text-[#FF5A00] hover:bg-[#FF5A00] hover:text-white',
          )}
          aria-label={`Tambah sub-klasifikasi untuk ${node.nama}`}
          title="Tambah anak klasifikasi"
        >
          <CornerDownRight size={12} />
        </button>
      </div>

      {hasChildren && isExpanded && (
        <div className="mt-1.5 space-y-1.5 border-l border-orange-100/60 pl-2" style={{ marginLeft: `${level * 16 + 18}px` }}>
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddChild={onAddChild}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function KlasifikasiDetail({
  node,
  onEdit,
  onDelete,
  breadcrumb,
}: {
  node: KlasifikasiNode | null
  onEdit: (node: KlasifikasiNode) => void
  onDelete: (node: KlasifikasiNode) => void
  breadcrumb: string[]
}) {
  if (!node) {
    return (
      <div className="flex min-h-[26rem] flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-orange-100 bg-orange-50 text-[#FF5A00]">
          <Folder size={26} />
        </div>
        <p className="font-headline text-lg font-bold text-zinc-950">Pilih Klasifikasi</p>
        <p className="mt-2 max-w-sm text-sm font-medium leading-relaxed text-zinc-600">
          Pilih node pada pohon struktur untuk melihat status Induk atau Pilihan Akhir.
        </p>
      </div>
    )
  }

  const isParent = hasChildNodes(node)
  const active = isActiveNode(node)
  const canBeOperationalChoice = active && !isParent

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-[#F1E5DA] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <ClassificationTypeBadge node={node} />
            <ClassificationStatusBadge node={node} />
          </div>
          <h3 className="font-headline text-xl font-extrabold tracking-tight text-zinc-950">{node.nama}</h3>
          {node.kode && <p className="mt-1 font-mono text-sm font-bold text-[#FF5A00]">{node.kode}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!node.is_root && (
            <>
              <Button size="sm" variant="outline" className="gap-1.5 rounded-xl border-[#F0E1D5] bg-[#FFFDF9]" onClick={() => onEdit(node)}>
                <Pencil size={14} /> Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 rounded-xl border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800"
                onClick={() => onDelete(node)}
                title={isParent ? 'Endpoint saat ini menonaktifkan node dan turunannya; safety backend diperketat pada fase berikutnya.' : 'Nonaktifkan klasifikasi'}
              >
                <Ban size={14} /> Nonaktifkan
              </Button>
            </>
          )}
          {node.is_root && (
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-600">Root - Tidak bisa diedit</span>
          )}
        </div>
      </div>

      {breadcrumb.length > 1 && (
        <div>
          <p className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Jalur Struktur / Hierarchy Path</p>
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-[#FFF8F1] px-3 py-2 text-xs font-semibold text-zinc-700">
            {breadcrumb.map((item, index) => (
              <span key={index} className="flex items-center gap-1">
                {index > 0 && <ChevronRight size={10} />}
                <span className={cn(index === breadcrumb.length - 1 && 'font-extrabold text-[#FF5A00]')}>{item}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <DetailField label="Kode Klasifikasi">
          <span className="font-mono text-sm font-bold text-[#FF5A00]">{node.kode ?? '-'}</span>
        </DetailField>
        <DetailField label="Tipe">
          <ClassificationTypeBadge node={node} />
        </DetailField>
        <DetailField label="Nama Klasifikasi">
          <span className="text-sm font-bold leading-relaxed text-zinc-950">{node.nama}</span>
        </DetailField>
        <DetailField label="Status">
          <ClassificationStatusBadge node={node} />
        </DetailField>
        <DetailField label="Deskripsi / Keterangan" className="sm:col-span-2">
          <span className="text-sm font-medium leading-relaxed text-zinc-700">{node.deskripsi ?? '-'}</span>
        </DetailField>
        <DetailField label="Jumlah Sub-Klasifikasi">
          <span className="text-sm font-bold text-zinc-950">{node.children.length} sub-node</span>
        </DetailField>
        <DetailField label="Dipakai Jenis Pembayaran?">
          <span className={cn(
            'flex items-center gap-1.5 text-sm font-bold',
            canBeOperationalChoice ? 'text-emerald-700' : 'text-zinc-600',
          )}>
            {canBeOperationalChoice ? <CheckCircle2 size={15} /> : <Ban size={15} />}
            {getJenisPembayaranLabel(node)}
          </span>
        </DetailField>
      </div>

      <div className="rounded-xl border border-orange-100 bg-orange-50/70 px-4 py-3 text-xs font-medium leading-relaxed text-orange-900">
        <p>
          <span className="font-extrabold">Petunjuk:</span> hanya klasifikasi berstatus Aktif dan bertipe Pilihan Akhir yang dapat digunakan sebagai Jenis Pembayaran. Klasifikasi Induk bersifat struktural, sedangkan Nonaktif tidak ditampilkan pada pilihan operasional.
        </p>
        {isParent && (
          <p className="mt-2 text-amber-800">
            Status penggunaan akan diperiksa saat aturan nonaktif/hapus diperketat.
          </p>
        )}
      </div>
    </div>
  )
}

function DetailField({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border border-[#F1E5DA] bg-[#FFFDF9] p-3', className)}>
      <p className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <div>{children}</div>
    </div>
  )
}

function AddKlasifikasiModal({
  isOpen,
  onClose,
  parentNode,
  onSuccess,
}: {
  isOpen: boolean
  onClose: () => void
  parentNode: KlasifikasiNode | null
  onSuccess: () => void | Promise<void>
}) {
  const [nama, setNama] = useState('')
  const [kode, setKode] = useState('')
  const [deskripsi, setDeskripsi] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setNama('')
      setKode(parentNode?.kode ? `${parentNode.kode}.` : '')
      setDeskripsi('')
      setErrors({})
      setError(null)
      setLoading(false)
    }
  }, [isOpen, parentNode])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    if (!nama.trim()) nextErrors.nama = 'Nama wajib diisi'
    if (!kode.trim()) nextErrors.kode = 'Kode wajib diisi'
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setLoading(true)
    setError(null)
    try {
      await apiMutation('/api/arsiparis/klasifikasi', {
        method: 'POST',
        body: {
          nama: nama.trim(),
          kode: kode.trim(),
          deskripsi: deskripsi.trim() || undefined,
          parent_id: parentNode?.id ?? null,
        },
      })
      await onSuccess()
      onClose()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Terjadi kesalahan'))
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 mx-4 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[#FFFAF6] shadow-2xl" role="dialog" aria-modal="true" aria-label="Tambah klasifikasi">
        <div className="flex items-start justify-between border-b border-[#F1E5DA] bg-[#FFFDF9] px-5 py-4">
          <div>
            <p className="font-headline text-lg font-extrabold text-zinc-950">{parentNode ? 'Tambah Anak Klasifikasi' : 'Tambah Klasifikasi Induk'}</p>
            <p className="mt-1 text-xs font-medium text-zinc-600">
              {parentNode ? `Menambahkan sub-klasifikasi di bawah induk: ${classificationDisplay(parentNode)}` : 'Mendaftarkan klasifikasi tingkat tertinggi.'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup dialog tambah klasifikasi" className="rounded-full p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            {parentNode && (
              <div className="rounded-xl border border-orange-100 bg-[#FFF8F1] p-3 text-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#FF5A00]">Klasifikasi Induk</p>
                <p className="mt-1 font-bold text-zinc-950">{classificationDisplay(parentNode)}</p>
              </div>
            )}
            <FormInput
              label="Kode Klasifikasi"
              required
              value={kode}
              error={errors.kode}
              placeholder="Contoh: GU.100"
              onChange={(value) => {
                setKode(value.toUpperCase())
                setErrors(previous => ({ ...previous, kode: '' }))
              }}
            />
            <FormInput
              label="Nama Klasifikasi"
              required
              value={nama}
              error={errors.nama}
              placeholder="Contoh: Belanja Operasional"
              onChange={(value) => {
                setNama(value)
                setErrors(previous => ({ ...previous, nama: '' }))
              }}
            />
            <div>
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-zinc-600">
                Deskripsi / Keterangan <span className="font-semibold text-zinc-400">(Opsional)</span>
              </label>
              <textarea
                value={deskripsi}
                onChange={event => setDeskripsi(event.target.value)}
                rows={4}
                placeholder="Berikan ringkasan singkat cakupan belanja dari klasifikasi ini..."
                className="w-full resize-none rounded-xl border border-[#F0E1D5] bg-[#FFFDF9] px-3 py-2.5 text-sm leading-relaxed text-zinc-950 outline-none transition placeholder:text-zinc-500 focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70"
              />
            </div>
            {error && <p className="text-xs font-semibold text-error">{error}</p>}
          </div>
          <div className="flex gap-3 border-t border-[#F1E5DA] bg-[#FFFDF9] p-4">
            <Button type="button" variant="outline" className="flex-1 border-[#F0E1D5] bg-[#FFFDF9]" onClick={onClose} disabled={loading}>Batalkan</Button>
            <Button type="submit" className="flex-1 gap-1.5 bg-[#FF5A00] text-white hover:bg-[#EA580C]" disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Simpan Klasifikasi
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditKlasifikasiModal({
  isOpen,
  onClose,
  node,
  onSuccess,
}: {
  isOpen: boolean
  onClose: () => void
  node: KlasifikasiNode | null
  onSuccess: () => void | Promise<void>
}) {
  const [nama, setNama] = useState('')
  const [kode, setKode] = useState('')
  const [deskripsi, setDeskripsi] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && node) {
      setNama(node.nama)
      setKode(node.kode ?? '')
      setDeskripsi(node.deskripsi ?? '')
      setErrors({})
      setError(null)
      setLoading(false)
    }
  }, [isOpen, node])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!node) return

    const nextErrors: Record<string, string> = {}
    if (!nama.trim()) nextErrors.nama = 'Nama wajib diisi'
    if (!kode.trim()) nextErrors.kode = 'Kode wajib diisi'
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setLoading(true)
    setError(null)
    try {
      await apiMutation(`/api/arsiparis/klasifikasi/${node.id}`, {
        method: 'PATCH',
        body: {
          nama: nama.trim(),
          kode: kode.trim(),
          deskripsi: deskripsi.trim() || null,
        },
      })
      await onSuccess()
      onClose()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Terjadi kesalahan'))
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 mx-4 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[#FFFAF6] shadow-2xl" role="dialog" aria-modal="true" aria-label="Edit klasifikasi">
        <div className="flex items-start justify-between border-b border-[#F1E5DA] bg-[#FFFDF9] px-5 py-4">
          <div>
            <p className="font-headline text-lg font-extrabold text-zinc-950">Edit Atribut Klasifikasi</p>
            <p className="mt-1 text-xs font-medium text-zinc-600">Ubah kode, nama, dan deskripsi klasifikasi.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup dialog edit klasifikasi" className="rounded-full p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            <FormInput
              label="Kode Klasifikasi"
              required
              value={kode}
              error={errors.kode}
              placeholder="Kode klasifikasi"
              onChange={(value) => {
                setKode(value.toUpperCase())
                setErrors(previous => ({ ...previous, kode: '' }))
              }}
            />
            <FormInput
              label="Nama Klasifikasi"
              required
              value={nama}
              error={errors.nama}
              placeholder="Nama klasifikasi"
              onChange={(value) => {
                setNama(value)
                setErrors(previous => ({ ...previous, nama: '' }))
              }}
            />
            <div>
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-zinc-600">
                Deskripsi / Keterangan <span className="font-semibold text-zinc-400">(Opsional)</span>
              </label>
              <textarea
                value={deskripsi}
                onChange={event => setDeskripsi(event.target.value)}
                rows={4}
                placeholder="Deskripsi klasifikasi..."
                className="w-full resize-none rounded-xl border border-[#F0E1D5] bg-[#FFFDF9] px-3 py-2.5 text-sm leading-relaxed text-zinc-950 outline-none transition placeholder:text-zinc-500 focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70"
              />
            </div>
            {error && <p className="text-xs font-semibold text-error">{error}</p>}
          </div>
          <div className="flex gap-3 border-t border-[#F1E5DA] bg-[#FFFDF9] p-4">
            <Button type="button" variant="outline" className="flex-1 border-[#F0E1D5] bg-[#FFFDF9]" onClick={onClose} disabled={loading}>Batalkan</Button>
            <Button type="submit" className="flex-1 gap-1.5 bg-[#FF5A00] text-white hover:bg-[#EA580C]" disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
              Simpan Perubahan
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function NonaktifkanKlasifikasiModal({
  isOpen,
  onClose,
  node,
  onSuccess,
}: {
  isOpen: boolean
  onClose: () => void
  node: KlasifikasiNode | null
  onSuccess: () => void | Promise<void>
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setError(null)
      setLoading(false)
    }
  }, [isOpen, node])

  async function handleDeactivate() {
    if (!node) return
    setLoading(true)
    setError(null)
    try {
      await apiMutation(`/api/arsiparis/klasifikasi/${node.id}`, {
        method: 'DELETE',
      })
      await onSuccess()
      onClose()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Terjadi kesalahan'))
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const hasChildren = node ? hasChildNodes(node) : false

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 mx-4 w-full max-w-md rounded-2xl bg-[#FFFAF6] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-[#F1E5DA] px-5 py-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-rose-100 bg-rose-50 text-rose-700">
            <Ban size={18} />
          </span>
          <div>
            <p className="font-headline text-lg font-extrabold text-zinc-950">Nonaktifkan Klasifikasi?</p>
            <p className="text-xs font-medium text-zinc-600">Aksi memakai endpoint soft deactivate saat ini.</p>
          </div>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm font-medium leading-relaxed text-zinc-700">
            Klasifikasi <strong className="text-zinc-950">"{node?.nama}"</strong> akan dinonaktifkan sehingga tidak dipakai sebagai pilihan operasional. Riwayat dan dokumen yang sudah menggunakan klasifikasi ini tetap dapat dibaca sesuai aturan akses.
          </p>
          {hasChildren && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold leading-relaxed text-amber-900">
              Klasifikasi Induk memiliki sub-klasifikasi. Backend safety akan diperketat pada fase 15L.3D.4; perilaku endpoint saat ini tetap dipertahankan.
            </div>
          )}
          {error && <p className="text-xs font-semibold text-error">{error}</p>}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 border-[#F0E1D5] bg-[#FFFDF9]" onClick={onClose} disabled={loading}>Batal</Button>
            <Button variant="destructive" className="flex-1 gap-1.5" onClick={handleDeactivate} disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
              Nonaktifkan
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
  required,
  error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  error?: string
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-zinc-600">
        {label} {required && <span className="text-[#FF5A00]">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(
          'h-11 w-full rounded-xl border bg-[#FFFDF9] px-3 py-2 text-sm font-semibold text-zinc-950 outline-none transition placeholder:text-zinc-500 focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70',
          error ? 'border-error' : 'border-[#F0E1D5]',
        )}
      />
      {error && <p className="mt-1 text-[10px] font-semibold text-error">{error}</p>}
    </div>
  )
}

function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const payload = err.payload
    if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
      return payload.error
    }
    return err.message || fallback
  }

  return fallback
}

function getBreadcrumb(node: KlasifikasiNode | null, allNodes: KlasifikasiNode[]): string[] {
  if (!node) return []

  const path: string[] = []

  function findPath(nodes: KlasifikasiNode[], targetId: string, currentPath: string[]): boolean {
    for (const currentNode of nodes) {
      const newPath = [...currentPath, classificationDisplay(currentNode)]
      if (currentNode.id === targetId) {
        path.push(...newPath)
        return true
      }
      if (currentNode.children.length > 0 && findPath(currentNode.children, targetId, newPath)) {
        return true
      }
    }
    return false
  }

  findPath(allNodes, node.id, [])
  return path
}

function countAllNodes(nodes: KlasifikasiNode[]): number {
  return nodes.reduce((count, node) => count + 1 + countAllNodes(node.children), 0)
}

function findNode(nodes: KlasifikasiNode[], id: string): KlasifikasiNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const child = findNode(node.children, id)
    if (child) return child
  }

  return null
}

function KlasifikasiPage() {
  const [items, setItems] = useState<KlasifikasiNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<KlasifikasiNode | null>(null)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addParentNode, setAddParentNode] = useState<KlasifikasiNode | null>(null)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false)

  const fetchData = useCallback(async (): Promise<KlasifikasiNode[] | null> => {
    setLoading(true)
    setError(null)
    try {
      const json = await apiFetch<KlasifikasiResponse>('/arsiparis/klasifikasi')
      const data = json.klasifikasi ?? []

      const markRoot = (nodes: KlasifikasiNode[]): KlasifikasiNode[] => (
        nodes.map(node => ({
          ...node,
          is_active: node.is_active ?? true,
          is_root: node.kode === '000',
          children: markRoot(node.children),
        }))
      )

      const markedData = markRoot(data)
      setItems(markedData)
      return markedData
    } catch (err) {
      setError(getApiErrorMessage(err, 'Terjadi kesalahan'))
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  function openAddChild(node: KlasifikasiNode) {
    setAddParentNode(node)
    setAddModalOpen(true)
  }

  function openEdit(node: KlasifikasiNode) {
    setSelectedNode(node)
    setEditModalOpen(true)
  }

  function openDeactivate(node: KlasifikasiNode) {
    setSelectedNode(node)
    setDeactivateModalOpen(true)
  }

  async function handleModalSuccess() {
    const refreshedItems = await fetchData()
    if (selectedNode && refreshedItems) {
      setSelectedNode(findNode(refreshedItems, selectedNode.id))
    }
  }

  const totalCount = countAllNodes(items)
  const breadcrumb = getBreadcrumb(selectedNode, items)

  return (
    <PageLayout className="min-h-full bg-[#FFF9F4] px-4 py-4 sm:px-6 lg:px-7 lg:py-5">
      <div className="mx-auto max-w-[92rem] space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-orange-700/70">
              <Archive size={12} />
              <Link to="/arsiparis" className="hover:text-[#FF5A00]">Kearsipan KSBU</Link>
              <ChevronRight size={10} />
              <span className="text-[#FF5A00]">Klasifikasi Arsip</span>
            </div>
            <h2 className="font-headline text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-[30px]">
              Master <span className="text-[#FF5A00]">Klasifikasi Arsip</span>
            </h2>
            <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-zinc-700">
              Kelola struktur klasifikasi yang digunakan sebagai Jenis Pembayaran pada proses pemberkasan.
            </p>
          </div>
          <Button
            type="button"
            className="w-full shrink-0 gap-1.5 rounded-xl bg-[#FF5A00] px-4 text-xs font-extrabold text-white hover:bg-[#EA580C] sm:w-auto"
            onClick={() => {
              setAddParentNode(null)
              setAddModalOpen(true)
            }}
          >
            <Plus size={14} />
            Tambah Induk
          </Button>
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border border-orange-100 bg-orange-50/70 px-4 py-3 text-xs font-medium leading-relaxed text-orange-900 shadow-sm">
          <Info size={15} className="mt-0.5 shrink-0 text-[#FF5A00]" />
          <p>
            <span className="font-extrabold">Petunjuk Kearsipan:</span> Klasifikasi tingkat akhir bertindak sebagai <span className="font-extrabold text-[#FF5A00]">Jenis Pembayaran</span> aktif. Klasifikasi Induk bersifat struktural dan Nonaktif tidak selectable secara operasional.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-[#FF5A00]" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-error/20 bg-error/5 py-20">
            <AlertCircle size={32} className="text-error" />
            <p className="text-sm text-on-surface-variant">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData}>Coba Lagi</Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-[#F1E5DA] bg-[#FFFDF9] py-20 text-center shadow-sm">
            <div className="flex size-14 items-center justify-center rounded-xl bg-orange-50 text-[#FF5A00]">
              <Network size={24} />
            </div>
            <p className="font-headline text-lg font-bold text-zinc-950">Belum ada klasifikasi</p>
            <p className="max-w-sm text-xs font-medium leading-relaxed text-zinc-600">Tambahkan klasifikasi induk terlebih dahulu, lalu buat anak klasifikasi sampai Pilihan Akhir.</p>
            <Button
              size="sm"
              className="gap-1.5 rounded-xl bg-[#FF5A00] text-white hover:bg-[#EA580C]"
              onClick={() => {
                setAddParentNode(null)
                setAddModalOpen(true)
              }}
            >
              <Plus size={14} /> Tambah Klasifikasi Induk
            </Button>
          </div>
        ) : (
          <div className="grid min-h-[500px] grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="overflow-hidden rounded-[1.35rem] border border-[#F1E5DA] bg-[#FFFDF9] shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between gap-3 border-b border-[#F1E5DA] px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <FolderOpen size={16} className="shrink-0 text-[#FF5A00]" />
                  <h3 className="truncate text-sm font-bold text-zinc-950">Pohon Struktur Klasifikasi</h3>
                </div>
                <span className="shrink-0 rounded-lg bg-orange-50 px-2 py-1 text-[10px] font-black text-zinc-700">
                  Total: {totalCount} Node
                </span>
              </div>
              <div className="max-h-[62vh] overflow-y-auto p-2 sm:p-3">
                <KlasifikasiTree
                  nodes={items}
                  selectedId={selectedNode?.id ?? null}
                  onSelect={setSelectedNode}
                  onAddChild={openAddChild}
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-[1.35rem] border border-[#F1E5DA] bg-[#FFFDF9] shadow-sm lg:col-span-3">
              <KlasifikasiDetail
                node={selectedNode}
                onEdit={openEdit}
                onDelete={openDeactivate}
                breadcrumb={breadcrumb}
              />
            </div>
          </div>
        )}

        <AddKlasifikasiModal
          isOpen={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          parentNode={addParentNode}
          onSuccess={handleModalSuccess}
        />

        <EditKlasifikasiModal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          node={selectedNode}
          onSuccess={handleModalSuccess}
        />

        <NonaktifkanKlasifikasiModal
          isOpen={deactivateModalOpen}
          onClose={() => setDeactivateModalOpen(false)}
          node={selectedNode}
          onSuccess={async () => {
            await handleModalSuccess()
            setSelectedNode(null)
          }}
        />
      </div>
    </PageLayout>
  )
}
