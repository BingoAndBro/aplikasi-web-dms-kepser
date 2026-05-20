import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState, useCallback } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { ApiError, apiFetch } from '#/lib/api-client'
import { apiMutation } from '#/lib/api-mutation'
import {
  Network, ChevronRight, ChevronDown, AlertCircle, Loader2,
  Plus, Pencil, Trash2, X, Folder, FolderOpen, FileText, CornerDownRight,
} from 'lucide-react'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/arsiparis/klasifikasi')({ component: KlasifikasiPage })

// Types
type KlasifikasiNode = {
  id: string
  nama: string
  kode: string | null
  deskripsi: string | null
  parent_id: string | null
  created_at: string
  is_root: boolean
  children: KlasifikasiNode[]
}

type FlatNode = KlasifikasiNode & { level: number; isExpanded?: boolean }

type KlasifikasiResponse = {
  klasifikasi?: KlasifikasiNode[]
  error?: string
}

// Tree View Component
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
    <div className="space-y-0.5">
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
  const hasChildren = node.children.length > 0
  const isSelected = selectedId === node.id

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition-colors group',
          isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-surface-container-low'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onSelect(node)}
      >
        {/* Expand/Collapse button */}
        <button
          onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded) }}
          className={cn(
            'p-0.5 rounded hover:bg-black/10 transition-colors',
            isSelected ? 'text-primary-foreground/70 hover:bg-primary-foreground/10' : 'text-outline'
          )}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="w-[14px]" />
          )}
        </button>

        {/* Icon */}
        <span className={cn(
          'shrink-0',
          isSelected ? 'text-primary-foreground' : 'text-primary'
        )}>
          {hasChildren ? (
            isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />
          ) : (
            <FileText size={16} />
          )}
        </span>

        {/* Label */}
        <span className={cn(
          'flex-1 truncate text-sm font-medium',
          isSelected ? 'text-primary-foreground' : 'text-on-surface'
        )}>
          {node.kode && <span className="font-mono mr-1.5 text-xs opacity-70">{node.kode}</span>}
          {node.nama}
        </span>

        {/* Add child button - all nodes can have children except already deleted check */}
        <button
          onClick={(e) => { e.stopPropagation(); onAddChild(node) }}
          className={cn(
            'p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity',
            isSelected ? 'text-primary-foreground/70 hover:text-primary-foreground' : 'text-outline hover:text-primary hover:bg-primary/10'
          )}
          aria-label="Tambah sub-klasifikasi"
        >
          <CornerDownRight size={12} />
        </button>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
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

// Detail Panel Component
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
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Folder size={48} className="text-outline mb-4" />
        <p className="font-headline text-lg font-bold text-on-surface mb-2">Pilih Klasifikasi</p>
        <p className="text-sm text-on-surface-variant">Pilih klasifikasi di pohon untuk melihat detail.</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-headline text-xl font-bold text-on-surface">{node.nama}</h3>
          {node.kode && <p className="text-sm text-outline font-mono mt-1">{node.kode}</p>}
        </div>
        <div className="flex items-center gap-2">
          {!node.is_root && (
            <>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onEdit(node)}>
                <Pencil size={14} /> Edit
              </Button>
              <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => onDelete(node)}>
                <Trash2 size={14} /> Hapus
              </Button>
            </>
          )}
          {node.is_root && (
            <span className="text-xs text-outline bg-surface-container-low px-2 py-1 rounded">Root - Tidak bisa diedit</span>
          )}
        </div>
      </div>

      {/* Breadcrumb */}
      {breadcrumb.length > 1 && (
        <div className="flex items-center gap-1 text-xs text-outline flex-wrap">
          {breadcrumb.map((item, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={10} />}
              <span className={cn(i === breadcrumb.length - 1 && 'text-primary font-medium')}>{item}</span>
            </span>
          ))}
        </div>
      )}

      {/* Details */}
      <div className="bg-surface-container-low rounded-xl p-4 space-y-4">
        <div>
          <p className="text-xs text-outline font-semibold uppercase tracking-wider mb-1">Kode</p>
          <p className="text-sm text-on-surface font-mono">{node.kode ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-outline font-semibold uppercase tracking-wider mb-1">Nama</p>
          <p className="text-sm text-on-surface">{node.nama}</p>
        </div>
        <div>
          <p className="text-xs text-outline font-semibold uppercase tracking-wider mb-1">Deskripsi</p>
          <p className="text-sm text-on-surface">{node.deskripsi ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-outline font-semibold uppercase tracking-wider mb-1">Jumlah Sub-Klasifikasi</p>
          <p className="text-sm text-on-surface">{node.children.length} item</p>
        </div>
      </div>
    </div>
  )
}

// Add Modal Component
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

  // Reset form when the modal opens so preserved modal state cannot keep a stale spinner.
  useEffect(() => {
    if (isOpen) {
      setNama('')
      setKode('')
      setDeskripsi('')
      setErrors({})
      setError(null)
      setLoading(false)
    }
  }, [isOpen, parentNode])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!nama.trim()) errs.nama = 'Nama wajib diisi'
    if (!kode.trim()) errs.kode = 'Kode wajib diisi'
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setLoading(true); setError(null)
    try {
      const body = {
        nama: nama.trim(),
        kode: kode.trim(),
        deskripsi: deskripsi.trim() || undefined,
        parent_id: parentNode?.id ?? null,
      }
      await apiMutation('/api/arsiparis/klasifikasi', {
        method: 'POST',
        body,
      })
      await onSuccess()
      onClose()
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        setError(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error ?? 'Gagal'
          : 'Gagal')
        return
      }

      setError('Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/30">
          <p className="font-semibold text-on-surface">Tambah Sub-Klasifikasi</p>
          <button onClick={onClose} className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-surface-container-low transition-colors">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Parent info */}
          <div className="bg-surface-container-low rounded-lg p-3 text-sm">
            <p className="text-xs text-outline mb-1">Induk Klasifikasi</p>
            <p className="font-medium text-on-surface">
              {parentNode ? (
                <><span className="font-mono text-xs mr-1">{parentNode.kode}</span>{parentNode.nama}</>
              ) : 'Root'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface mb-1.5">Kode <span className="text-error">*</span></label>
            <input
              type="text"
              value={kode}
              onChange={e => { setKode(e.target.value.toUpperCase()); setErrors(p => ({ ...p, kode: '' })) }}
              placeholder="Contoh: SK, DL.001"
              className={cn('w-full px-3 py-2 border rounded-lg text-sm bg-white outline-none focus:ring-1 focus:ring-ring', errors.kode ? 'border-error' : 'border-border')}
            />
            {errors.kode && <p className="text-[10px] text-error mt-1">{errors.kode}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface mb-1.5">Nama Klasifikasi <span className="text-error">*</span></label>
            <input
              type="text"
              value={nama}
              onChange={e => { setNama(e.target.value); setErrors(p => ({ ...p, nama: '' })) }}
              placeholder="Contoh: Surat Keputusan"
              className={cn('w-full px-3 py-2 border rounded-lg text-sm bg-white outline-none focus:ring-1 focus:ring-ring', errors.nama ? 'border-error' : 'border-border')}
            />
            {errors.nama && <p className="text-[10px] text-error mt-1">{errors.nama}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface mb-1.5">Deskripsi <span className="text-outline font-normal">(opsional)</span></label>
            <textarea
              value={deskripsi}
              onChange={e => setDeskripsi(e.target.value)}
              rows={3}
              placeholder="Deskripsi klasifikasi..."
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          {error && <p className="text-xs text-error">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={!!loading}>Batal</Button>
            <Button type="submit" className="flex-1" disabled={!!loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Simpan
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Edit Modal Component
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

  // Reset form when the modal opens so preserved modal state cannot keep a stale spinner.
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!node) return

    const errs: Record<string, string> = {}
    if (!nama.trim()) errs.nama = 'Nama wajib diisi'
    if (!kode.trim()) errs.kode = 'Kode wajib diisi'
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setLoading(true); setError(null)
    try {
      const body = {
        nama: nama.trim(),
        kode: kode.trim(),
        deskripsi: deskripsi.trim() || null,
      }
      await apiMutation(`/api/arsiparis/klasifikasi/${node.id}`, {
        method: 'PATCH',
        body,
      })
      await onSuccess()
      onClose()
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        setError(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error ?? 'Gagal'
          : 'Gagal')
        return
      }

      setError('Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/30">
          <p className="font-semibold text-on-surface">Edit Klasifikasi</p>
          <button onClick={onClose} className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-surface-container-low transition-colors">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-on-surface mb-1.5">Kode</label>
            <input
              type="text"
              value={kode}
              onChange={e => { setKode(e.target.value.toUpperCase()); setErrors(p => ({ ...p, kode: '' })) }}
              placeholder="Kode klasifikasi"
              className={cn('w-full px-3 py-2 border rounded-lg text-sm bg-white outline-none focus:ring-1 focus:ring-ring', errors.kode ? 'border-error' : 'border-border')}
            />
            {errors.kode && <p className="text-[10px] text-error mt-1">{errors.kode}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface mb-1.5">Nama Klasifikasi <span className="text-error">*</span></label>
            <input
              type="text"
              value={nama}
              onChange={e => { setNama(e.target.value); setErrors(p => ({ ...p, nama: '' })) }}
              placeholder="Nama klasifikasi"
              className={cn('w-full px-3 py-2 border rounded-lg text-sm bg-white outline-none focus:ring-1 focus:ring-ring', errors.nama ? 'border-error' : 'border-border')}
            />
            {errors.nama && <p className="text-[10px] text-error mt-1">{errors.nama}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface mb-1.5">Deskripsi <span className="text-outline font-normal">(opsional)</span></label>
            <textarea
              value={deskripsi}
              onChange={e => setDeskripsi(e.target.value)}
              rows={3}
              placeholder="Deskripsi klasifikasi..."
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          {error && <p className="text-xs text-error">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={!!loading}>Batal</Button>
            <Button type="submit" className="flex-1" disabled={!!loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
              Simpan
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Delete Modal Component
function DeleteKlasifikasiModal({
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

  async function handleDelete() {
    if (!node) return
    setLoading(true); setError(null)
    try {
      await apiMutation(`/api/arsiparis/klasifikasi/${node.id}`, {
        method: 'DELETE',
      })
      await onSuccess()
      onClose()
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        setError(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error ?? 'Gagal'
          : 'Gagal')
        return
      }

      setError('Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant/30">
          <Trash2 size={18} className="text-error shrink-0" />
          <p className="font-semibold text-on-surface">Hapus Klasifikasi?</p>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-on-surface-variant">
            Klasifikasi <strong>"{node?.nama}"</strong> dan seluruh subclass-nya akan dinonaktifkan.
            Dokumen yang sudah menggunakan klasifikasi ini tidak terpengaruh.
          </p>
          {error && <p className="text-xs text-error">{error}</p>}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={!!loading}>Batal</Button>
            <Button variant="destructive" className="flex-1" onClick={handleDelete} disabled={!!loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Hapus
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper to get breadcrumb path
function getBreadcrumb(node: KlasifikasiNode | null, allNodes: KlasifikasiNode[]): string[] {
  if (!node) return []

  const path: string[] = []

  function findPath(nodes: KlasifikasiNode[], targetId: string, currentPath: string[]): boolean {
    for (const n of nodes) {
      const newPath = [...currentPath, n.nama]
      if (n.id === targetId) {
        path.push(...newPath)
        return true
      }
      if (n.children.length > 0 && findPath(n.children, targetId, newPath)) {
        return true
      }
    }
    return false
  }

  findPath(allNodes, node.id, [])
  return path
}

function KlasifikasiPage() {
  const [items, setItems] = useState<KlasifikasiNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedNode, setSelectedNode] = useState<KlasifikasiNode | null>(null)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addParentNode, setAddParentNode] = useState<KlasifikasiNode | null>(null)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)

  const fetchData = useCallback(async (): Promise<KlasifikasiNode[] | null> => {
    setLoading(true); setError(null)
    try {
      const json = await apiFetch<KlasifikasiResponse>('/arsiparis/klasifikasi')
      const data = json.klasifikasi ?? []

      // Mark root node (kode = '000') as fixed
      const markRoot = (nodes: KlasifikasiNode[]): KlasifikasiNode[] => {
        return nodes.map(n => ({
          ...n,
          is_root: n.kode === '000',
          children: markRoot(n.children),
        }))
      }
      const markedData = markRoot(data)
      setItems(markedData)
      return markedData
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
      return null
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void fetchData() }, [fetchData])

  function openAddChild(node: KlasifikasiNode) {
    setAddParentNode(node)
    setAddModalOpen(true)
  }

  function openEdit(node: KlasifikasiNode) {
    setSelectedNode(node)
    setEditModalOpen(true)
  }

  function openDelete(node: KlasifikasiNode) {
    setSelectedNode(node)
    setDeleteModalOpen(true)
  }

  function handleSelectNode(node: KlasifikasiNode) {
    setSelectedNode(node)
  }

  async function handleModalSuccess() {
    const refreshedItems = await fetchData()
    // Re-select the node after refresh if it still exists
    if (selectedNode && refreshedItems) {
      const findNode = (nodes: KlasifikasiNode[], id: string): KlasifikasiNode | null => {
        for (const n of nodes) {
          if (n.id === id) return n
          const found = findNode(n.children, id)
          if (found) return found
        }
        return null
      }
      const found = findNode(refreshedItems, selectedNode.id)
      if (found) setSelectedNode(found)
      else setSelectedNode(null)
    }
  }

  const breadcrumb = getBreadcrumb(selectedNode, items)

  // Flatten for counting
  function countAllNodes(nodes: KlasifikasiNode[]): number {
    return nodes.reduce((acc, n) => acc + 1 + countAllNodes(n.children), 0)
  }

  const totalCount = countAllNodes(items)

  return (
    <PageLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
              <Link to="/arsiparis" className="hover:text-primary">Arsiparis</Link>
              <ChevronRight size={10} />
              <span className="text-primary">Master Klasifikasi</span>
            </div>
            <h2 className="font-headline text-2xl font-extrabold text-on-surface">Master Klasifikasi Arsip</h2>
            <p className="text-on-surface-variant text-xs mt-1">{totalCount} klasifikasi aktif.</p>
          </div>
        </div>

        {/* Split View */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center py-20 gap-4 bg-error/5 rounded-2xl border border-error/20">
            <AlertCircle size={32} className="text-error" />
            <p className="text-sm text-on-surface-variant">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData}>Coba Lagi</Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-4 bg-white/5 rounded-2xl border border-white/10">
            <div className="w-14 h-14 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Network size={24} className="text-blue-500" />
            </div>
            <p className="font-headline text-lg font-bold text-on-surface">Belum ada klasifikasi</p>
            <p className="text-on-surface-variant text-xs">Tambahkan klasifikasi arsip untuk digunakan saat pemberkasan.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 min-h-[500px]">
            {/* Tree Panel */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-outline-variant/30 bg-surface-container-low/30">
                <h3 className="font-semibold text-sm text-on-surface">Pohon Klasifikasi</h3>
              </div>
              <div className="p-2 max-h-[450px] overflow-y-auto">
                <KlasifikasiTree
                  nodes={items}
                  selectedId={selectedNode?.id ?? null}
                  onSelect={handleSelectNode}
                  onAddChild={openAddChild}
                />
              </div>
            </div>

            {/* Detail Panel */}
            <div className="lg:col-span-3 bg-white rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm">
              <KlasifikasiDetail
                node={selectedNode}
                onEdit={openEdit}
                onDelete={openDelete}
                breadcrumb={breadcrumb}
              />
            </div>
          </div>
        )}

        {/* Modals */}
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

        <DeleteKlasifikasiModal
          isOpen={deleteModalOpen}
          onClose={() => { setDeleteModalOpen(false); setSelectedNode(null) }}
          node={selectedNode}
          onSuccess={async () => { await handleModalSuccess(); setSelectedNode(null) }}
        />
      </div>
    </PageLayout>
  )
}
