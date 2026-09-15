"use client"
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, useCallback } from 'react'
import {
  AdminFormSelect,
  AdminFilterSelect,
  adminDialogBodyClassName,
  adminDialogCancelButtonClassName,
  adminDialogContentClassName,
  adminDialogDestructiveButtonClassName,
  adminDialogFooterClassName,
  adminDialogHeaderClassName,
  adminDialogSubmitButtonClassName,
  adminFormFieldClassName,
  adminFormGridClassName,
  adminFormLabelClassName,
  adminFormSectionClassName,
  adminFormSectionTitleClassName,
  adminRoleCardClassName,
  adminContentWideClassName,
  adminPageContainerClassName,
  adminPrimaryActionClassName,
  adminTableBodyClassName,
  AdminConfirmationDialog,
  AdminPageHeader,
  AdminSearchPanel,
  AdminTableShell,
  useAdminFormLeaveGuard,
} from '#/components/admin/AdminPagePrimitives'
import { PageLayout } from '#/components/dashboard/PageLayout'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '#/components/ui/table'
import { Button } from '#/components/ui/button'
import { ConfirmDialog } from '#/components/ui/ConfirmDialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { ROLE_TONE, RoleBadge } from '#/components/ui/RoleBadge'
import { toneClasses } from '#/lib/tone'
import { useAppToast } from '#/components/ui/AppToast'
import {
  Edit2,
  UserPlus,
  Shield,
  RefreshCw,
  KeyRound,
  UserCheck,
  UserX,
  Loader2,
  X,
  Users,
  ClipboardList,
} from 'lucide-react'
import { apiFetch } from '#/lib/api-client'
import { ApiError, apiMutation } from '#/lib/api-mutation'
import { getClientAuthState } from '#/lib/auth-state'
import { ROLE_DISPLAY } from '#/lib/constants/roles'
import { SELF_ADMIN_REMOVAL_ERROR, normalizeAdminRoleToggle } from '#/lib/users/role-assignment'
import type { UserWithRoles } from '#/lib/types/user'
import type { RoleName } from '#/lib/types/auth'

export const Route = createFileRoute('/admin/master-data/user')({
  component: MasterUserPage,
})

// ---------------------------------------------------------------------------
// Role card colors
// ---------------------------------------------------------------------------

const ALL_ROLES: RoleName[] = [
  'PEGAWAI',
  'PPK',
  'PPSPM',
  'KEPALA_SUB_BAGIAN_UMUM',
  'PENANGGUNG_JAWAB_KINERJA',
  'ADMIN',
]

const ROLE_HELP_TEXT: Record<RoleName, string> = {
  PEGAWAI: 'Mengajukan dokumen dan melihat laporan pribadi.',
  PPK: 'Memvalidasi dokumen sebelum persetujuan.',
  PPSPM: 'Menyetujui pembayaran dokumen.',
  KEPALA_SUB_BAGIAN_UMUM: 'Mengelola klasifikasi dan lifecycle arsip.',
  PENANGGUNG_JAWAB_KINERJA: 'Melihat dashboard dan laporan metadata.',
  ADMIN: 'Mengelola user dan data referensi sistem.',
}

function getAdminRoleLabel(role: RoleName) {
  return role === 'ADMIN' ? 'Admin Sistem' : ROLE_DISPLAY[role]
}

function AccountStatusSwitch({
  isActive,
  onChange,
}: {
  isActive: boolean
  onChange: (nextActive: boolean) => void
}) {
  return (
    <div
      className="inline-flex h-10 w-fit items-center rounded-[15px] border border-brand-border-strong bg-white p-0.5 shadow-[0_1px_2px_rgba(91,58,0,0.04)]"
      role="group"
      aria-label="Status akun"
    >
      <button
        type="button"
        aria-pressed={isActive}
        onClick={() => onChange(true)}
        className={[
          'h-8 rounded-[11px] px-4 text-sm font-extrabold transition-colors',
          isActive
            ? 'bg-success-surface text-success-text'
            : 'bg-transparent text-text-muted hover:bg-success-surface',
        ].join(' ')}
      >
        Aktif
      </button>
      <button
        type="button"
        aria-pressed={!isActive}
        onClick={() => onChange(false)}
        className={[
          'h-8 rounded-[11px] px-4 text-sm font-extrabold transition-colors',
          !isActive
            ? 'bg-danger-surface text-danger-text'
            : 'bg-transparent text-text-muted hover:bg-danger-surface',
        ].join(' ')}
      >
        Nonaktif
      </button>
    </div>
  )
}

function InactiveStatusConfirmationDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={nextOpen => {
        if (!nextOpen) onCancel()
      }}
      tone="destructive"
      icon={<UserX className="size-6" strokeWidth={2.2} />}
      title="Konfirmasi Nonaktifkan User"
      description="Menonaktifkan user akan memblokir akses login mereka. User tersebut tidak akan dapat masuk ke dalam sistem atau memproses dokumen di DMS sampai diaktifkan kembali."
      cancelLabel="Batalkan"
      confirmLabel="Ya, Nonaktifkan"
      onConfirm={onConfirm}
    />
  )
}

const userDialogContentClassName =
  adminDialogContentClassName + ' flex max-h-[calc(100dvh-28px)] flex-col sm:max-w-[760px]'
const userDialogBodyClassName =
  adminDialogBodyClassName + ' min-h-0 flex-1 overflow-y-auto overscroll-contain py-5'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateUserForm {
  email: string
  password: string
  confirmPassword: string
  nama_lengkap: string
  nip_nrp: string
  departemen: string
  isActive: boolean
  roles: RoleName[]
}

interface EditUserForm {
  nama_lengkap: string
  nip_nrp: string
  departemen: string
  isActive: boolean
  roles: RoleName[]
}

const INITIAL_CREATE_FORM: CreateUserForm = {
  email: '',
  password: '',
  confirmPassword: '',
  nama_lengkap: '',
  nip_nrp: '',
  departemen: '',
  isActive: true,
  roles: ['PEGAWAI'],
}

const INITIAL_EDIT_FORM: EditUserForm = {
  nama_lengkap: '',
  nip_nrp: '',
  departemen: '',
  isActive: true,
  roles: [],
}

interface ChairmanAssignment {
  id: string
  kegiatan_id: string
  kegiatan_nama: string
}

interface EditSnapshot {
  form: EditUserForm
  assignments: ChairmanAssignment[]
}

interface UsersListResponse {
  users?: UserWithRoles[]
  error?: string
}

interface KetuaTimAssignmentApiItem {
  id: string
  user_id: string
  kegiatan_id: string
  kegiatan?: {
    nama?: string
  } | null
}

interface KetuaTimAssignmentsResponse {
  assignments?: KetuaTimAssignmentApiItem[]
  error?: string
}

interface MasterKegiatanItem {
  id: string
  nama: string
}

function normalizeRoles(roles: RoleName[]) {
  return [...roles].sort()
}

function sameRoles(a: RoleName[], b: RoleName[]) {
  const left = normalizeRoles(a)
  const right = normalizeRoles(b)
  return left.length === right.length && left.every((role, i) => role === right[i])
}

function sameAssignments(a: ChairmanAssignment[], b: ChairmanAssignment[]) {
  const left = a.map(item => item.kegiatan_id).sort()
  const right = b.map(item => item.kegiatan_id).sort()
  return left.length === right.length && left.every((id, i) => id === right[i])
}

function sameEditForm(a: EditUserForm, b: EditUserForm) {
  return (
    a.nama_lengkap === b.nama_lengkap &&
    a.nip_nrp === b.nip_nrp &&
    a.departemen === b.departemen &&
    a.isActive === b.isActive &&
    sameRoles(a.roles, b.roles)
  )
}

function sameCreateForm(a: CreateUserForm, b: CreateUserForm) {
  return (
    a.email === b.email &&
    a.password === b.password &&
    a.confirmPassword === b.confirmPassword &&
    a.nama_lengkap === b.nama_lengkap &&
    a.nip_nrp === b.nip_nrp &&
    a.departemen === b.departemen &&
    a.isActive === b.isActive &&
    sameRoles(a.roles, b.roles)
  )
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

function MasterUserPage() {
  const { showToast } = useAppToast()
  const notifySuccess = (description: string) => showToast({ title: 'Berhasil', description, variant: 'success' })
  const notifyError = (description: string) => showToast({ title: 'Gagal', description, variant: 'error' })
  const notifyWarning = (description: string) => showToast({ title: 'Data belum lengkap', description, variant: 'warning' })
  // State
  const [users, setUsers] = useState<UserWithRoles[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'aktif' | 'nonaktif'>('all')
  const [filterRole, setFilterRole] = useState<'all' | RoleName>('all')
  const [filterKetuaTim, setFilterKetuaTim] = useState<'all' | 'ketua' | 'bukan-ketua'>('all')

  // Chairman assignments state
  const [chairmanAssignments, setChairmanAssignments] = useState<Record<string, ChairmanAssignment[]>>({})
  const [loadingChairmen, setLoadingChairmen] = useState(false)

  // Dialog chairman management
  const [dialogChairmanAssignments, setDialogChairmanAssignments] = useState<ChairmanAssignment[]>([])
  const [availableKegiatan, setAvailableKegiatan] = useState<{ id: string; nama: string }[]>([])
  const [showChairmanConfirm, setShowChairmanConfirm] = useState(false)
  const [pendingChairmanReplace, setPendingChairmanReplace] = useState<{ kegiatan_id: string; kegiatan_nama: string; old_user: string } | null>(null)
  const [initialEditSnapshot, setInitialEditSnapshot] = useState<EditSnapshot | null>(null)
  const [showEditCancelConfirm, setShowEditCancelConfirm] = useState(false)
  const [showCreateCancelConfirm, setShowCreateCancelConfirm] = useState(false)
  const [showResetPasswordCancelConfirm, setShowResetPasswordCancelConfirm] = useState(false)
  const [pendingStatusChange, setPendingStatusChange] = useState<'create' | 'edit' | null>(null)

  // Dialog states
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [activateOpen, setActivateOpen] = useState(false)

  // Selected user
  const [selectedUser, setSelectedUser] = useState<UserWithRoles | null>(null)

  // Forms
  const [createForm, setCreateForm] = useState<CreateUserForm>(INITIAL_CREATE_FORM)
  const [editForm, setEditForm] = useState<EditUserForm>(INITIAL_EDIT_FORM)
  const [resetPassword, setResetPassword] = useState('')
  const [confirmResetPassword, setConfirmResetPassword] = useState('')

  // Loading states for actions
  const [actionLoading, setActionLoading] = useState(false)
  const [currentUserId] = useState(() => getClientAuthState().userId ?? null)

  const isEditDirty = initialEditSnapshot !== null && (
    !sameEditForm(initialEditSnapshot.form, editForm) ||
    !sameAssignments(initialEditSnapshot.assignments, dialogChairmanAssignments)
  )
  const isCreateDirty = createOpen && !actionLoading && (
    !sameCreateForm(INITIAL_CREATE_FORM, createForm) ||
    dialogChairmanAssignments.length > 0
  )
  const isResetPasswordDirty = resetPasswordOpen && !actionLoading && Boolean(
    resetPassword || confirmResetPassword,
  )
  const isEditingOwnAdminAccount = Boolean(
    selectedUser
    && currentUserId === selectedUser.id
    && initialEditSnapshot?.form.roles.includes('ADMIN'),
  )
  useAdminFormLeaveGuard((isCreateDirty || isEditDirty || isResetPasswordDirty) && !actionLoading)

  // ---------------------------------------------------------------------------
  // Fetch users
  // ---------------------------------------------------------------------------

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<UsersListResponse>('/users/')
      setUsers(data.users || [])
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
          setError(payload.error)
        } else {
          setError('Gagal memuat data')
        }
      } else {
        setError('Gagal memuat data user')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // ---------------------------------------------------------------------------
  // Fetch chairman assignments
  // ---------------------------------------------------------------------------

  const fetchChairmanAssignments = useCallback(async () => {
    setLoadingChairmen(true)
    try {
      const data = await apiFetch<KetuaTimAssignmentsResponse>('/ketua-tim/')

      if (data.assignments) {
        const grouped: Record<string, ChairmanAssignment[]> = {}
        data.assignments.forEach((a) => {
          const userId = a.user_id
          if (!grouped[userId]) grouped[userId] = []
          grouped[userId].push({
            id: a.id,
            kegiatan_id: a.kegiatan_id,
            kegiatan_nama: a.kegiatan?.nama || 'Unknown',
          })
        })
        setChairmanAssignments(grouped)
      }
    } catch (err) {
      console.error('Failed to fetch chairman assignments:', err)
    } finally {
      setLoadingChairmen(false)
    }
  }, [])

  useEffect(() => {
    if (users.length > 0) {
      fetchChairmanAssignments()
    }
  }, [users, fetchChairmanAssignments])

  // ---------------------------------------------------------------------------
  // Filtered users
  // ---------------------------------------------------------------------------

  const filteredUsers = users.filter(user => {
    const matchSearch = !search ||
      user.email.toLowerCase().includes(search.toLowerCase()) ||
      user.metadata.nama_lengkap?.toLowerCase().includes(search.toLowerCase()) ||
      user.metadata.nip_nrp?.includes(search)

    const matchStatus = filterStatus === 'all' ||
      (filterStatus === 'aktif' && user.isActive) ||
      (filterStatus === 'nonaktif' && !user.isActive)

    const matchRole = filterRole === 'all' || user.roles.includes(filterRole)

    const isKetuaTim = (chairmanAssignments[user.id]?.length ?? 0) > 0
    const matchKetuaTim = filterKetuaTim === 'all' ||
      (filterKetuaTim === 'ketua' && isKetuaTim) ||
      (filterKetuaTim === 'bukan-ketua' && !isKetuaTim)

    return matchSearch && matchStatus && matchRole && matchKetuaTim
  })

  // ---------------------------------------------------------------------------
  // Dialog handlers
  // ---------------------------------------------------------------------------

  const loadChairmanForUser = async (userId: string) => {
    try {
      const data = await apiFetch<KetuaTimAssignmentsResponse>(`/ketua-tim/user/${userId}`)
      // API returns { assignments: [...] } - kegiatan is nested inside
      if (data.assignments) {
        const assignments = data.assignments.map((a) => ({
          id: a.id,
          kegiatan_id: a.kegiatan_id,
          kegiatan_nama: a.kegiatan?.nama || 'Unknown',
        }))
        setDialogChairmanAssignments(assignments)
        console.info('[MasterUser] Ketua tim assignments loaded', {
          userId,
          count: assignments.length,
        })
        return assignments
      }
    } catch (err) {
      console.error('[MasterUser] Failed to load ketua tim assignments', { userId, err })
    }
    setDialogChairmanAssignments([])
    return []
  }

  const loadAvailableKegiatan = async (assignments: ChairmanAssignment[] = dialogChairmanAssignments) => {
    try {
      const data = await apiFetch<MasterKegiatanItem[]>('/master-kegiatan')
      // API returns array directly, not { kegiatan: [...] }
      if (Array.isArray(data)) {
        const assignedKegiatanIds = assignments.map(c => c.kegiatan_id)
        const available = data.filter((k) => !assignedKegiatanIds.includes(k.id))
        setAvailableKegiatan(available)
        console.info('[MasterUser] Available kegiatan refreshed', {
          total: data.length,
          assigned: assignedKegiatanIds.length,
          available: available.length,
        })
      }
    } catch (err) {
      console.error('[MasterUser] Failed to load available kegiatan', err)
    }
  }

  const stageChairmanAssignment = async (kegiatanId: string) => {
    if (dialogChairmanAssignments.some(c => c.kegiatan_id === kegiatanId)) return

    const kegiatan = availableKegiatan.find(k => k.id === kegiatanId)
    const nextAssignments = [
      ...dialogChairmanAssignments,
      {
        id: `pending-${kegiatanId}`,
        kegiatan_id: kegiatanId,
        kegiatan_nama: kegiatan?.nama ?? 'Unknown',
      },
    ]
    setDialogChairmanAssignments(nextAssignments)
    await loadAvailableKegiatan(nextAssignments)
    console.info('[MasterUser] Ketua tim assignment staged', {
      kegiatanId,
      kegiatan: kegiatan?.nama ?? 'Unknown',
      totalStaged: nextAssignments.length,
    })
  }

  const findExistingChairman = (kegiatanId: string) => {
    for (const [userId, assignments] of Object.entries(chairmanAssignments)) {
      const assignment = assignments.find(item => item.kegiatan_id === kegiatanId)
      if (assignment) return { userId, assignment }
    }
    return null
  }

  const getUserDisplayName = (userId: string) => {
    const user = users.find(item => item.id === userId)
    return user?.metadata.nama_lengkap || user?.email || 'Ketua tim sebelumnya'
  }

  const handleAddChairman = async (kegiatanId: string, userId: string) => {
    if (dialogChairmanAssignments.some(c => c.kegiatan_id === kegiatanId)) return

    try {
      const existingChairman = findExistingChairman(kegiatanId)

      if (existingChairman && existingChairman.userId !== userId) {
        if (userId === 'new-user') {
          notifyWarning('Kegiatan ini sudah memiliki ketua tim. Buat user terlebih dahulu, lalu ganti penugasan dari form edit.')
          return
        }
        setPendingChairmanReplace({
          kegiatan_id: kegiatanId,
          kegiatan_nama: availableKegiatan.find(k => k.id === kegiatanId)?.nama ?? '',
          old_user: getUserDisplayName(existingChairman.userId),
        })
        setShowChairmanConfirm(true)
        return
      }

      await stageChairmanAssignment(kegiatanId)
    } catch (err) {
      console.error('[MasterUser] Failed to stage ketua tim assignment', { kegiatanId, userId, err })
      notifyError('Gagal menambahkan kegiatan ketua tim')
    }
  }

  const handleRemoveChairman = async (assignmentId: string, userId: string) => {
    const nextAssignments = dialogChairmanAssignments.filter(c => c.id !== assignmentId)
    setDialogChairmanAssignments(nextAssignments)
    loadAvailableKegiatan(nextAssignments)
    console.info('[MasterUser] Ketua tim assignment removed from draft', {
      userId,
      assignmentId,
      remaining: nextAssignments.length,
    })
  }

  const handleConfirmReplace = async () => {
    if (!pendingChairmanReplace || !selectedUser) return
    try {
      await stageChairmanAssignment(pendingChairmanReplace.kegiatan_id)
      setShowChairmanConfirm(false)
      setPendingChairmanReplace(null)
    } catch (err) {
      console.error('[MasterUser] Failed to stage ketua tim replacement', {
        kegiatanId: pendingChairmanReplace.kegiatan_id,
        err,
      })
      notifyError('Gagal menyiapkan penggantian ketua tim')
    }
  }

  const openEdit = async (user: UserWithRoles) => {
    const initialForm = {
      nama_lengkap: user.metadata.nama_lengkap || '',
      nip_nrp: user.metadata.nip_nrp || '',
      departemen: user.metadata.departemen || '',
      isActive: user.isActive,
      roles: [...user.roles],
    }
    setSelectedUser(user)
    setEditForm(initialForm)
    setDialogChairmanAssignments([])
    setEditOpen(true)
    const assignments = await loadChairmanForUser(user.id)
    setInitialEditSnapshot({
      form: initialForm,
      assignments,
    })
    await loadAvailableKegiatan(assignments)
  }

  const openCreate = () => {
    setDialogChairmanAssignments([])
    setAvailableKegiatan([])
    setCreateOpen(true)
    loadAvailableKegiatan()
  }

  const resetCreateDraft = (closeDialog: boolean) => {
    setCreateForm(INITIAL_CREATE_FORM)
    setDialogChairmanAssignments([])
    setAvailableKegiatan([])
    setPendingChairmanReplace(null)
    setShowChairmanConfirm(false)
    setShowCreateCancelConfirm(false)

    if (closeDialog) {
      setCreateOpen(false)
      setSelectedUser(null)
    }
  }

  const requestCloseCreate = () => {
    if (actionLoading) return
    if (isCreateDirty) {
      setShowCreateCancelConfirm(true)
      return
    }
    resetCreateDraft(true)
  }

  const resetEditDraft = async (closeDialog: boolean) => {
    const snapshot = initialEditSnapshot

    if (snapshot) {
      setEditForm(snapshot.form)
      setDialogChairmanAssignments(snapshot.assignments)
      await loadAvailableKegiatan(snapshot.assignments)
    } else {
      setEditForm(INITIAL_EDIT_FORM)
      setDialogChairmanAssignments([])
      setAvailableKegiatan([])
    }

    setPendingChairmanReplace(null)
    setShowChairmanConfirm(false)
    setShowEditCancelConfirm(false)

    if (closeDialog) {
      setEditOpen(false)
      setSelectedUser(null)
      setInitialEditSnapshot(null)
    }
  }

  const requestCloseEdit = () => {
    if (actionLoading) return
    if (isEditDirty) {
      setShowEditCancelConfirm(true)
      return
    }
    resetEditDraft(true)
  }

  const requestAccountStatusChange = (form: 'create' | 'edit', nextActive: boolean) => {
    if (nextActive) {
      if (form === 'create') {
        setCreateForm(p => ({ ...p, isActive: true }))
      } else {
        setEditForm(p => ({ ...p, isActive: true }))
      }
      return
    }

    const isCurrentlyActive = form === 'create' ? createForm.isActive : editForm.isActive
    if (!isCurrentlyActive) return
    setPendingStatusChange(form)
  }

  const confirmInactiveStatusChange = () => {
    if (pendingStatusChange === 'create') {
      setCreateForm(p => ({ ...p, isActive: false }))
    } else if (pendingStatusChange === 'edit') {
      setEditForm(p => ({ ...p, isActive: false }))
    }
    setPendingStatusChange(null)
  }

  const persistChairmanAssignmentChanges = async (userId: string) => {
    const initialAssignments = initialEditSnapshot?.assignments ?? []
    const initialByKegiatan = new Map(initialAssignments.map(item => [item.kegiatan_id, item]))
    const currentByKegiatan = new Map(dialogChairmanAssignments.map(item => [item.kegiatan_id, item]))

    const removedAssignments = initialAssignments.filter(item => !currentByKegiatan.has(item.kegiatan_id))
    const addedAssignments = dialogChairmanAssignments.filter(item => !initialByKegiatan.has(item.kegiatan_id))

    for (const assignment of removedAssignments) {
      try {
        await apiMutation(`/api/ketua-tim/?id=${encodeURIComponent(assignment.id)}`, {
          method: 'DELETE',
        })
      } catch (err) {
        if (err instanceof ApiError) {
          const payload = err.payload
          throw new Error(payload && typeof payload === 'object' && 'error' in payload
            ? (payload as { error?: string }).error || `Gagal menghapus ketua tim ${assignment.kegiatan_nama}`
            : `Gagal menghapus ketua tim ${assignment.kegiatan_nama}`)
        }

        throw err
      }
    }

    for (const assignment of addedAssignments) {
      try {
        await apiMutation('/api/ketua-tim/', {
          method: 'POST',
          body: {
            user_id: userId,
            kegiatan_id: assignment.kegiatan_id,
          },
        })
      } catch (err) {
        if (err instanceof ApiError) {
          const payload = err.payload
          throw new Error(payload && typeof payload === 'object' && 'error' in payload
            ? (payload as { error?: string }).error || `Gagal menyimpan ketua tim ${assignment.kegiatan_nama}`
            : `Gagal menyimpan ketua tim ${assignment.kegiatan_nama}`)
        }

        throw err
      }
    }

    console.info('[MasterUser] Ketua tim changes saved', {
      userId,
      added: addedAssignments.length,
      removed: removedAssignments.length,
    })
  }

  const openResetPassword = (user: UserWithRoles) => {
    setSelectedUser(user)
    setResetPassword('')
    setConfirmResetPassword('')
    setShowResetPasswordCancelConfirm(false)
    setResetPasswordOpen(true)
  }

  const closeResetPassword = () => {
    setResetPasswordOpen(false)
    setShowResetPasswordCancelConfirm(false)
    setResetPassword('')
    setConfirmResetPassword('')
    setSelectedUser(null)
  }

  const requestCloseResetPassword = () => {
    if (actionLoading) return
    if (isResetPasswordDirty) {
      setShowResetPasswordCancelConfirm(true)
      return
    }
    closeResetPassword()
  }

  const openDeactivate = (user: UserWithRoles) => {
    setSelectedUser(user)
    setDeactivateOpen(true)
  }

  const openActivate = (user: UserWithRoles) => {
    setSelectedUser(user)
    setActivateOpen(true)
  }

  // ---------------------------------------------------------------------------
  // Action handlers
  // ---------------------------------------------------------------------------

  const handleCreate = async () => {
    if (!createForm.email || !createForm.password || !createForm.nama_lengkap || !createForm.nip_nrp) {
      notifyWarning('Harap lengkapi semua data yang diperlukan.')
      return
    }
    if (createForm.password !== createForm.confirmPassword) {
      notifyWarning('Konfirmasi password tidak cocok.')
      return
    }
    if (createForm.password.length < 8) {
      notifyWarning('Password minimal 8 karakter.')
      return
    }

    setActionLoading(true)
    try {
      const created = await apiMutation<{ user?: UserWithRoles }>('/api/users/', {
        method: 'POST',
        body: {
          email: createForm.email,
          password: createForm.password,
          nama_lengkap: createForm.nama_lengkap,
          nip_nrp: createForm.nip_nrp,
          departemen: createForm.departemen || undefined,
          roles: createForm.roles,
        },
      })
      const createdUserId = created.user?.id
      if (createdUserId) {
        if (!createForm.isActive) {
          await apiMutation(`/api/users/${createdUserId}/deactivate`, {
            method: 'POST',
          })
        }
        for (const assignment of dialogChairmanAssignments) {
          await apiMutation('/api/ketua-tim/', {
            method: 'POST',
            body: {
              user_id: createdUserId,
              kegiatan_id: assignment.kegiatan_id,
            },
          })
        }
      }
      setCreateOpen(false)
      setCreateForm(INITIAL_CREATE_FORM)
      setDialogChairmanAssignments([])
      setAvailableKegiatan([])
      await fetchUsers()
      await fetchChairmanAssignments()
      notifySuccess('User berhasil dibuat.')
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        notifyError(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error || 'Gagal membuat user'
          : 'Gagal membuat user')
        return
      }

      notifyError(err instanceof Error ? err.message || 'Gagal membuat user' : 'Gagal membuat user')
    } finally {
      setActionLoading(false)
    }
  }

  const handleEdit = async () => {
    if (!selectedUser) return
    if (!editForm.nama_lengkap || !editForm.nip_nrp) {
      notifyWarning('Harap lengkapi semua data yang diperlukan.')
      return
    }

    setActionLoading(true)
    try {
      await apiMutation(`/api/users/${selectedUser.id}`, {
        method: 'PATCH',
        body: {
          nama_lengkap: editForm.nama_lengkap,
          nip_nrp: editForm.nip_nrp,
          departemen: editForm.departemen || undefined,
          roles: editForm.roles,
        },
      })

      await persistChairmanAssignmentChanges(selectedUser.id)
      if (editForm.isActive !== selectedUser.isActive) {
        await apiMutation(`/api/users/${selectedUser.id}/${editForm.isActive ? 'activate' : 'deactivate'}`, {
          method: 'POST',
        })
      }

      setEditOpen(false)
      setSelectedUser(null)
      setInitialEditSnapshot(null)
      setDialogChairmanAssignments([])
      setAvailableKegiatan([])
      await fetchUsers()
      await fetchChairmanAssignments()
      notifySuccess('User berhasil diperbarui.')
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        notifyError(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error || 'Gagal mengupdate user'
          : 'Gagal mengupdate user')
        return
      }

      notifyError(err instanceof Error ? err.message || 'Gagal mengupdate user' : 'Gagal mengupdate user')
    } finally {
      setActionLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!selectedUser) return
    if (!resetPassword || !confirmResetPassword) {
      notifyWarning('Harap isi password baru dan konfirmasinya.')
      return
    }
    if (resetPassword !== confirmResetPassword) {
      notifyWarning('Konfirmasi password tidak cocok.')
      return
    }
    if (resetPassword.length < 8) {
      notifyWarning('Password minimal 8 karakter.')
      return
    }

    setActionLoading(true)
    try {
      await apiMutation(`/api/users/${selectedUser.id}/reset-password`, {
        method: 'POST',
        body: { password: resetPassword },
      })
      notifySuccess('Password berhasil direset.')
      setResetPasswordOpen(false)
      setSelectedUser(null)
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        notifyError(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error || 'Gagal mereset password'
          : 'Gagal mereset password')
        return
      }

      notifyError(err instanceof Error ? err.message || 'Gagal mereset password' : 'Gagal mereset password')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeactivate = async () => {
    if (!selectedUser) return

    setActionLoading(true)
    try {
      await apiMutation(`/api/users/${selectedUser.id}/deactivate`, {
        method: 'POST',
      })
      setDeactivateOpen(false)
      setSelectedUser(null)
      await fetchUsers()
      notifySuccess('User berhasil dinonaktifkan.')
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        notifyError(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error || 'Gagal menonaktifkan user'
          : 'Gagal menonaktifkan user')
        return
      }

      notifyError(err instanceof Error ? err.message || 'Gagal menonaktifkan user' : 'Gagal menonaktifkan user')
    } finally {
      setActionLoading(false)
    }
  }

  const handleActivate = async () => {
    if (!selectedUser) return

    setActionLoading(true)
    try {
      await apiMutation(`/api/users/${selectedUser.id}/activate`, {
        method: 'POST',
      })
      setActivateOpen(false)
      setSelectedUser(null)
      await fetchUsers()
      notifySuccess('User berhasil diaktifkan.')
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        notifyError(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error || 'Gagal mengaktifkan user'
          : 'Gagal mengaktifkan user')
        return
      }

      notifyError(err instanceof Error ? err.message || 'Gagal mengaktifkan user' : 'Gagal mengaktifkan user')
    } finally {
      setActionLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Role toggle helpers
  // ---------------------------------------------------------------------------

  const toggleRole = (role: RoleName, form: 'create' | 'edit') => {
    if (form === 'create') {
      setCreateForm(prev => ({
        ...prev,
        roles: normalizeAdminRoleToggle(prev.roles, role),
      }))
    } else {
      if (isEditingOwnAdminAccount) {
        notifyWarning(SELF_ADMIN_REMOVAL_ERROR)
        return
      }

      setEditForm(prev => ({
        ...prev,
        roles: normalizeAdminRoleToggle(prev.roles, role),
      }))
    }
  }

  const isRoleButtonDisabled = (role: RoleName, roles: RoleName[], form: 'create' | 'edit') => (
    (form === 'edit' && isEditingOwnAdminAccount)
    || (role === 'PEGAWAI' && !roles.includes('ADMIN'))
  )

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <PageLayout>
      <div className={adminPageContainerClassName}>
        <AdminPageHeader
          className={adminContentWideClassName}
          icon={<Shield />}
          eyebrow={(
            <>
              <span>Admin Sistem</span>
              <span>/</span>
              <span>Master User</span>
            </>
          )}
          title="Master User"
          description="Kelola akun, status, dan hak akses pengguna sistem."
          actions={(
            <Button className={adminPrimaryActionClassName + ' gap-2'} onClick={openCreate}>
              <UserPlus size={18} strokeWidth={2.5} />
              Tambah User
            </Button>
          )}
        />

        <AdminSearchPanel
          className={adminContentWideClassName}
          id="admin-user-search"
          label="Cari user"
          value={search}
          onChange={setSearch}
          placeholder="Cari nama, email, atau NIP..."
          resultText={`Total ${filteredUsers.length} User`}
        >
          <AdminFilterSelect
            value={filterStatus}
            onChange={value => setFilterStatus(value as typeof filterStatus)}
            ariaLabel="Filter user berdasarkan status"
            options={[
              { value: 'all', label: 'Semua Status' },
              { value: 'aktif', label: 'Aktif' },
              { value: 'nonaktif', label: 'Nonaktif' },
            ]}
          />
          <AdminFilterSelect
            value={filterRole}
            onChange={value => setFilterRole(value as typeof filterRole)}
            ariaLabel="Filter user berdasarkan role"
            options={[
              { value: 'all', label: 'Semua Role' },
              ...ALL_ROLES.map(role => ({ value: role, label: getAdminRoleLabel(role) })),
            ]}
          />
          <AdminFilterSelect
            value={filterKetuaTim}
            onChange={value => setFilterKetuaTim(value as typeof filterKetuaTim)}
            ariaLabel="Filter user berdasarkan penugasan Ketua Tim"
            options={[
              { value: 'all', label: 'Semua Ketua Tim' },
              { value: 'ketua', label: 'Ketua Tim' },
              { value: 'bukan-ketua', label: 'Bukan Ketua Tim' },
            ]}
          />
          <Button variant="outline" size="lg" className="h-11 rounded-xl px-4" onClick={fetchUsers} disabled={loading} aria-label="Muat ulang daftar user">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
        </AdminSearchPanel>

        {error && (
          <ErrorState title="Gagal memuat Master User" description={error} variant="destructive" />
        )}

        {loading ? (
          <LoadingState variant="list" label="Memuat daftar user" />
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            title="Tidak ada user yang cocok"
            description="Ubah kata kunci, status, role, atau filter Ketua Tim untuk melihat data lain."
            icon={<Users size={18} />}
            action={<Button onClick={openCreate} size="sm" variant="outline">Tambah User</Button>}
          />
        ) : (
        <AdminTableShell className={adminContentWideClassName + ' ' + adminTableBodyClassName}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">No</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead className="text-center">Hak Akses</TableHead>
                <TableHead className="text-center min-w-[140px]">Ketua Tim</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center w-32">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user, i) => (
                  <TableRow key={user.id} className="group hover:bg-primary/5 transition-colors">
                    <TableCell className="text-center text-xs text-outline">{i + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center border border-outline-variant/20 shrink-0">
                          <span className="text-xs font-extrabold text-primary">
                            {(user.metadata.nama_lengkap || user.email).split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-on-surface">{user.metadata.nama_lengkap || '-'}</p>
                          <p className="text-[10px] text-outline font-medium">{user.email}</p>
                          {user.metadata.nip_nrp && (
                            <p className="text-[10px] text-on-surface-variant font-medium">NIP: {user.metadata.nip_nrp}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 justify-center">
                        {user.roles.length > 0 ? (
                          user.roles.map(role => (
                            <RoleBadge
                              key={role}
                              role={role}
                              className="text-[10px]"
                            />
                          ))
                        ) : (
                          <span className="text-xs text-outline">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {loadingChairmen ? (
                        <span className="text-outline/40 text-xs">...</span>
                      ) : chairmanAssignments[user.id]?.length > 0 ? (
                        <div className="flex flex-wrap gap-1 justify-center">
                          {chairmanAssignments[user.id].map((c) => (
                            <span
                              key={c.id}
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200"
                            >
                              {c.kegiatan_nama}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-outline text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${user.isActive ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className={`text-[11px] font-bold ${user.isActive ? 'text-green-600' : 'text-red-600'}`}>
                          {user.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-1 transition-opacity">
                        <Button size="icon-lg" variant="ghost" className="size-9 rounded-xl text-black hover:bg-brand-surface hover:text-brand-text" onClick={() => openEdit(user)} aria-label={`Edit user ${user.metadata.nama_lengkap || user.email}`}>
                          <Edit2 size={20} strokeWidth={2.5} />
                        </Button>
                        <Button size="icon-lg" variant="ghost" className="size-9 rounded-xl text-black hover:bg-brand-surface hover:text-brand-text" onClick={() => openResetPassword(user)} aria-label={`Reset password user ${user.metadata.nama_lengkap || user.email}`}>
                          <KeyRound size={20} strokeWidth={2.5} />
                        </Button>
                        {user.isActive ? (
                          <Button size="icon-lg" variant="ghost" onClick={() => openDeactivate(user)} className="size-9 rounded-xl text-black hover:bg-red-50 hover:text-red-600" aria-label={`Nonaktifkan user ${user.metadata.nama_lengkap || user.email}`}>
                            <UserX size={20} strokeWidth={2.5} />
                          </Button>
                        ) : (
                          <Button size="icon-lg" variant="ghost" onClick={() => openActivate(user)} className="size-9 rounded-xl text-black hover:bg-brand-surface hover:text-brand-text" aria-label={`Aktifkan user ${user.metadata.nama_lengkap || user.email}`}>
                            <UserCheck size={20} strokeWidth={2.5} />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between border-t border-brand-border bg-bg-surface px-6 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
              Menampilkan {filteredUsers.length} dari {users.length} user
            </p>
          </div>
        </AdminTableShell>
        )}
      </div>

      {/* Create User Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (open) {
            setCreateOpen(true)
            return
          }
          requestCloseCreate()
        }}
      >
        <DialogContent className={userDialogContentClassName}>
          <DialogHeader className={adminDialogHeaderClassName}>
            <DialogTitle>Tambah User Baru</DialogTitle>
            <DialogDescription>
              Buat akun pengguna baru dan atur hak aksesnya di sistem.
            </DialogDescription>
          </DialogHeader>
          <div className={userDialogBodyClassName}>
            <section className={adminFormSectionClassName}>
              <h3 className={adminFormSectionTitleClassName}>Identitas User</h3>
              <div className={adminFormGridClassName}>
                <div className="md:col-span-2">
                  <label className={adminFormLabelClassName}>Email *</label>
                  <Input
                    type="email"
                    value={createForm.email}
                    onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="nama@bps.go.id"
                    className={adminFormFieldClassName}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={adminFormLabelClassName}>Nama Lengkap *</label>
                  <Input
                    value={createForm.nama_lengkap}
                    onChange={e => setCreateForm(p => ({ ...p, nama_lengkap: e.target.value }))}
                    placeholder="Nama lengkap"
                    className={adminFormFieldClassName}
                  />
                </div>
                <div>
                  <label className={adminFormLabelClassName}>NIP/NRP *</label>
                  <Input
                    value={createForm.nip_nrp}
                    onChange={e => setCreateForm(p => ({ ...p, nip_nrp: e.target.value }))}
                    placeholder="1980..."
                    className={adminFormFieldClassName}
                  />
                </div>
                <div>
                  <label className={adminFormLabelClassName}>Departemen/Fungsi</label>
                  <Input
                    value={createForm.departemen}
                    onChange={e => setCreateForm(p => ({ ...p, departemen: e.target.value }))}
                    placeholder="Opsional"
                    className={adminFormFieldClassName}
                  />
                </div>
                <div>
                  <label className={adminFormLabelClassName}>Password Baru *</label>
                  <Input
                    type="password"
                    value={createForm.password}
                    onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="Min 8 karakter"
                    className={adminFormFieldClassName}
                  />
                </div>
                <div>
                  <label className={adminFormLabelClassName}>Konfirmasi Password *</label>
                  <Input
                    type="password"
                    value={createForm.confirmPassword}
                    onChange={e => setCreateForm(p => ({ ...p, confirmPassword: e.target.value }))}
                    placeholder="Ulangi password"
                    className={adminFormFieldClassName}
                  />
                </div>
              </div>
            </section>
            <section className={adminFormSectionClassName}>
              <h3 className={adminFormSectionTitleClassName}>Hak Akses *</h3>
              <div className="grid gap-3 md:grid-cols-3">
                {ALL_ROLES.map(role => (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={createForm.roles.includes(role)}
                    onClick={() => toggleRole(role, 'create')}
                    disabled={isRoleButtonDisabled(role, createForm.roles, 'create')}
                    className={`${adminRoleCardClassName} ${
                      createForm.roles.includes(role)
                        ? `${toneClasses(ROLE_TONE[role], 'notice')} border-current shadow-sm ring-1 ring-current/10`
                        : 'bg-white border-zinc-200 text-zinc-600 hover:border-brand-border-strong hover:bg-brand-surface'
                    } ${isRoleButtonDisabled(role, createForm.roles, 'create') ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span className="block font-extrabold text-slate-900">{getAdminRoleLabel(role)}</span>
                    <span className="mt-1 block text-[11px] font-medium leading-snug text-slate-600">
                      {ROLE_HELP_TEXT[role]}
                      {role === 'PEGAWAI' && !createForm.roles.includes('ADMIN') && ' Wajib untuk user non-admin.'}
                      {role === 'ADMIN' && ' Role tunggal.'}
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <section className={adminFormSectionClassName}>
              <div className="flex items-center justify-between">
                <h3 className={adminFormSectionTitleClassName}>Penugasan Ketua Tim</h3>
                <span className="text-[11px] font-bold text-slate-500">{dialogChairmanAssignments.length} kegiatan</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {dialogChairmanAssignments.map((c) => (
                  <span key={c.id} className="inline-flex h-8 items-center gap-1 rounded-[5px] border border-brand-border-strong bg-brand-surface px-3 text-[12px] font-extrabold uppercase tracking-[0.04em] text-brand-text">
                    {c.kegiatan_nama}
                    <button type="button" aria-label={`Hapus penugasan ketua tim ${c.kegiatan_nama}`} onClick={() => handleRemoveChairman(c.id, 'new-user')} className="ml-1 rounded-full p-0.5 text-brand-text hover:bg-brand-surface-strong hover:text-brand-solid-active">
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {dialogChairmanAssignments.length === 0 && <span className="text-xs font-medium text-slate-500">Belum ada kegiatan</span>}
              </div>
              {availableKegiatan.length > 0 && (
                <div className="max-w-[460px]">
                  <AdminFormSelect
                    value=""
                    onChange={value => value && handleAddChairman(value, 'new-user')}
                    ariaLabel="Tambah penugasan ketua tim untuk user baru"
                    placeholder="Tambah kegiatan..."
                    options={[
                      { value: '', label: 'Tambah kegiatan...' },
                      ...availableKegiatan.map(k => ({ value: k.id, label: k.nama })),
                    ]}
                  />
                </div>
              )}
            </section>
            <section className={adminFormSectionClassName}>
              <h3 className={adminFormSectionTitleClassName}>Status Akun</h3>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <AccountStatusSwitch
                  isActive={createForm.isActive}
                  onChange={nextActive => requestAccountStatusChange('create', nextActive)}
                />
                <p className="text-sm font-semibold text-text-muted">
                  User aktif dapat login menggunakan email BPS mereka.
                </p>
              </div>
            </section>
          </div>
          <DialogFooter className={adminDialogFooterClassName}>
            <Button variant="outline" className={adminDialogCancelButtonClassName} onClick={requestCloseCreate}>Batal</Button>
            <Button className={adminDialogSubmitButtonClassName} onClick={handleCreate} disabled={actionLoading}>
              {actionLoading && <Loader2 size={14} className="animate-spin mr-1" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdminConfirmationDialog
        open={showCreateCancelConfirm}
        onOpenChange={setShowCreateCancelConfirm}
        title="Keluar dari form?"
        tone="warning"
        cancelLabel="Lanjut Edit"
        confirmLabel="Ya, Keluar"
        onCancel={() => setShowCreateCancelConfirm(false)}
        onConfirm={() => resetCreateDraft(true)}
      >
        Perubahan yang belum disimpan akan hilang.
      </AdminConfirmationDialog>

      {/* Edit User Dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          if (open) {
            setEditOpen(true)
            return
          }
          requestCloseEdit()
        }}
      >
        <DialogContent className={userDialogContentClassName}>
          <DialogHeader className={adminDialogHeaderClassName}>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Perbarui identitas, hak akses, dan penugasan Ketua Tim untuk user ini.
            </DialogDescription>
          </DialogHeader>
          <div className={userDialogBodyClassName}>
            <section className={adminFormSectionClassName}>
              <h3 className={adminFormSectionTitleClassName}>Identitas User</h3>
              <div className={adminFormGridClassName}>
                <div className="md:col-span-2">
                  <label className={adminFormLabelClassName}>Email</label>
                  <Input value={selectedUser?.email || ''} disabled className={adminFormFieldClassName + ' bg-slate-50 text-slate-500'} />
                </div>
                <div className="md:col-span-2">
                  <label className={adminFormLabelClassName}>Nama Lengkap *</label>
                  <Input
                    value={editForm.nama_lengkap}
                    onChange={e => setEditForm(p => ({ ...p, nama_lengkap: e.target.value }))}
                    placeholder="Nama lengkap"
                    className={adminFormFieldClassName}
                  />
                </div>
                <div>
                  <label className={adminFormLabelClassName}>NIP/NRP *</label>
                  <Input
                    value={editForm.nip_nrp}
                    onChange={e => setEditForm(p => ({ ...p, nip_nrp: e.target.value }))}
                    placeholder="1980..."
                    className={adminFormFieldClassName}
                  />
                </div>
                <div>
                  <label className={adminFormLabelClassName}>Departemen/Fungsi</label>
                  <Input
                    value={editForm.departemen}
                    onChange={e => setEditForm(p => ({ ...p, departemen: e.target.value }))}
                    placeholder="Opsional"
                    className={adminFormFieldClassName}
                  />
                </div>
              </div>
            </section>
            <section className={adminFormSectionClassName}>
              <h3 className={adminFormSectionTitleClassName}>Hak Akses *</h3>
              <div className="grid gap-3 md:grid-cols-3">
                {ALL_ROLES.map(role => (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={editForm.roles.includes(role)}
                    onClick={() => toggleRole(role, 'edit')}
                    disabled={isRoleButtonDisabled(role, editForm.roles, 'edit')}
                    className={`${adminRoleCardClassName} ${
                      editForm.roles.includes(role)
                        ? `${toneClasses(ROLE_TONE[role], 'notice')} border-current shadow-sm ring-1 ring-current/10`
                        : 'bg-white border-zinc-200 text-zinc-600 hover:border-brand-border-strong hover:bg-brand-surface'
                    } ${isRoleButtonDisabled(role, editForm.roles, 'edit') ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span className="block font-extrabold text-slate-900">{getAdminRoleLabel(role)}</span>
                    <span className="mt-1 block text-[11px] font-medium leading-snug text-slate-600">
                      {ROLE_HELP_TEXT[role]}
                      {role === 'PEGAWAI' && !editForm.roles.includes('ADMIN') && ' Wajib untuk user non-admin.'}
                      {role === 'ADMIN' && ' Role tunggal.'}
                    </span>
                  </button>
                ))}
              </div>
              {isEditingOwnAdminAccount && (
                <p className="mt-2 text-[11px] font-medium text-red-600">
                  {SELF_ADMIN_REMOVAL_ERROR}
                </p>
              )}
            </section>

            {/* Section: Kegiatan sebagai Ketua Tim */}
            <section className={adminFormSectionClassName}>
              <div className="flex items-center justify-between">
                <h3 className={adminFormSectionTitleClassName}>Penugasan Ketua Tim</h3>
                <span className="text-[10px] text-on-surface-variant">
                  {dialogChairmanAssignments.length} kegiatan
                </span>
              </div>

              {/* Chips kegiatan */}
              <div className="flex flex-wrap gap-2">
                {dialogChairmanAssignments.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex h-8 items-center gap-1 rounded-[5px] border border-brand-border-strong bg-brand-surface px-3 text-[12px] font-extrabold uppercase tracking-[0.04em] text-brand-text"
                  >
                    {c.kegiatan_nama}
                    <button
                      type="button"
                      aria-label={`Hapus penugasan ketua tim ${c.kegiatan_nama}`}
                      onClick={() => selectedUser && handleRemoveChairman(c.id, selectedUser.id)}
                      className="ml-1 cursor-pointer rounded-full p-0.5 text-brand-text hover:bg-brand-surface-strong hover:text-brand-solid-active"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {dialogChairmanAssignments.length === 0 && (
                  <span className="text-xs text-on-surface-variant">Belum ada kegiatan</span>
                )}
              </div>

              {/* Dropdown Tambah Kegiatan */}
              {availableKegiatan.length > 0 && (
                <div className="max-w-[460px]">
                  <AdminFormSelect
                    value=""
                    onChange={value => selectedUser && value && handleAddChairman(value, selectedUser.id)}
                    ariaLabel="Tambah kegiatan ketua tim"
                    placeholder="Tambah kegiatan..."
                    options={[
                      { value: '', label: 'Tambah kegiatan...' },
                      ...availableKegiatan.map(k => ({ value: k.id, label: k.nama })),
                    ]}
                  />
                </div>
              )}

              <p className="text-[10px] text-on-surface-variant">
                Satu kegiatan hanya boleh memiliki 1 ketua tim
              </p>
            </section>
            <section className={adminFormSectionClassName}>
              <h3 className={adminFormSectionTitleClassName}>Status Akun</h3>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <AccountStatusSwitch
                  isActive={editForm.isActive}
                  onChange={nextActive => requestAccountStatusChange('edit', nextActive)}
                />
                <p className="text-sm font-semibold text-text-muted">
                  User aktif dapat login menggunakan email BPS mereka.
                </p>
              </div>
            </section>
          </div>
          <DialogFooter className={adminDialogFooterClassName}>
            <Button variant="outline" className={adminDialogCancelButtonClassName} onClick={requestCloseEdit}>Batal</Button>
            <Button className={adminDialogSubmitButtonClassName} onClick={handleEdit} disabled={actionLoading}>
              {actionLoading && <Loader2 size={14} className="animate-spin mr-1" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Cancel Confirmation Dialog */}
      <AdminConfirmationDialog
        open={showEditCancelConfirm}
        onOpenChange={setShowEditCancelConfirm}
        title="Batalkan Perubahan?"
        tone="warning"
        icon={<X size={20} />}
        cancelLabel="Lanjut Edit"
        onCancel={() => setShowEditCancelConfirm(false)}
        confirmLabel="Ya, Batalkan"
        onConfirm={() => resetEditDraft(true)}
      >
        Perubahan belum disimpan. Yakin ingin membatalkan?
      </AdminConfirmationDialog>

      {/* Reset Password Dialog */}
      <Dialog
        open={resetPasswordOpen}
        onOpenChange={(open) => {
          if (open) {
            setResetPasswordOpen(true)
            return
          }
          requestCloseResetPassword()
        }}
      >
        <DialogContent className={adminDialogContentClassName + ' sm:max-w-[560px]'}>
          <DialogHeader className={adminDialogHeaderClassName}>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          <div className={adminDialogBodyClassName}>
            <p className="text-sm leading-6 text-text-strong">
              Reset password untuk user <strong>{selectedUser?.metadata.nama_lengkap || selectedUser?.email}</strong>.
            </p>
            <div className={adminFormGridClassName}>
              <div>
                <label className={adminFormLabelClassName}>Password Baru *</label>
                <Input
                  type="password"
                  value={resetPassword}
                  onChange={e => setResetPassword(e.target.value)}
                  placeholder="Min 8 karakter"
                  className={adminFormFieldClassName}
                />
                <p className="mt-2 text-xs font-medium text-text-muted">Minimal 8 karakter.</p>
              </div>
              <div>
                <label className={adminFormLabelClassName}>Konfirmasi Password *</label>
                <Input
                  type="password"
                  value={confirmResetPassword}
                  onChange={e => setConfirmResetPassword(e.target.value)}
                  placeholder="Ulangi password"
                  className={adminFormFieldClassName}
                />
              </div>
            </div>
            <p className="rounded-[20px] border border-brand-border-strong bg-brand-surface px-4 py-4 text-sm leading-6 text-text-strong">
              Password akan langsung berlaku. User harus login dengan password baru.
            </p>
          </div>
          <DialogFooter className={adminDialogFooterClassName}>
            <Button variant="outline" className={adminDialogCancelButtonClassName} onClick={requestCloseResetPassword}>Batal</Button>
            <Button className={adminDialogSubmitButtonClassName} onClick={handleResetPassword} disabled={actionLoading}>
              {actionLoading && <Loader2 size={14} className="animate-spin mr-1" />}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdminConfirmationDialog
        open={showResetPasswordCancelConfirm}
        onOpenChange={setShowResetPasswordCancelConfirm}
        title="Keluar dari form?"
        tone="warning"
        cancelLabel="Lanjut Edit"
        confirmLabel="Ya, Keluar"
        onCancel={() => setShowResetPasswordCancelConfirm(false)}
        onConfirm={closeResetPassword}
      >
        Perubahan yang belum disimpan akan hilang.
      </AdminConfirmationDialog>

      <InactiveStatusConfirmationDialog
        open={pendingStatusChange !== null}
        onCancel={() => setPendingStatusChange(null)}
        onConfirm={confirmInactiveStatusChange}
      />

      {/* Chairman Replace Confirmation Dialog */}
      <AdminConfirmationDialog
        open={showChairmanConfirm}
        onOpenChange={setShowChairmanConfirm}
        title="Ganti Ketua Tim?"
        tone="info"
        icon={<ClipboardList size={20} />}
        confirmLabel="Ya, Ganti"
        onConfirm={handleConfirmReplace}
        loading={actionLoading}
        onCancel={() => {
          setShowChairmanConfirm(false)
          setPendingChairmanReplace(null)
        }}
      >
        Apakah Anda yakin ingin menunjuk user ini sebagai ketua tim kegiatan{' '}
        <strong className="text-text-strong">{pendingChairmanReplace?.kegiatan_nama}</strong>?
        Ini akan menggantikan <strong className="text-text-strong">{pendingChairmanReplace?.old_user}</strong>.
      </AdminConfirmationDialog>

      {/* Deactivate Dialog */}
      <AdminConfirmationDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title="Nonaktifkan User?"
        icon={<UserX size={20} />}
        confirmLabel={actionLoading ? 'Memproses...' : 'Nonaktifkan'}
        onConfirm={handleDeactivate}
        loading={actionLoading}
      >
        User <strong className="text-text-strong">{selectedUser?.metadata.nama_lengkap || selectedUser?.email}</strong> akan dinonaktifkan.
        User tidak akan bisa login lagi. Role user tetap tersimpan.
      </AdminConfirmationDialog>

      {/* Activate Dialog */}
      <AdminConfirmationDialog
        open={activateOpen}
        onOpenChange={setActivateOpen}
        title="Aktifkan User?"
        tone="success"
        icon={<UserCheck size={20} />}
        confirmLabel={actionLoading ? 'Memproses...' : 'Aktifkan'}
        onConfirm={handleActivate}
        loading={actionLoading}
      >
        User <strong className="text-text-strong">{selectedUser?.metadata.nama_lengkap || selectedUser?.email}</strong> akan diaktifkan kembali.
        User bisa login lagi.
      </AdminConfirmationDialog>
    </PageLayout>
  )
}
