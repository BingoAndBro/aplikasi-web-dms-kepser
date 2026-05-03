"use client"
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, useCallback } from 'react'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Badge } from '#/components/ui/badge'
import {
  Search,
  Edit2,
  Trash2,
  UserPlus,
  Shield,
  ChevronRight,
  RefreshCw,
  UserCheck,
  UserX,
  Loader2,
  X,
} from 'lucide-react'
import type { UserWithRoles } from '#/lib/types/user'
import type { RoleName } from '#/lib/types/auth'

export const Route = createFileRoute('/admin/master-data/user')({
  component: MasterUserPage,
})

// ---------------------------------------------------------------------------
// Role badge colors
// ---------------------------------------------------------------------------

const ROLE_COLORS: Record<RoleName, string> = {
  PEGAWAI: 'bg-blue-100 text-blue-700 border-blue-200',
  PPK: 'bg-purple-100 text-purple-700 border-purple-200',
  BENDAHARA: 'bg-green-100 text-green-700 border-green-200',
  ARSIPARIS: 'bg-orange-100 text-orange-700 border-orange-200',
  ADMIN: 'bg-red-100 text-red-700 border-red-200',
}

const ALL_ROLES: RoleName[] = ['PEGAWAI', 'PPK', 'BENDAHARA', 'ARSIPARIS', 'ADMIN']

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
  roles: RoleName[]
}

interface EditUserForm {
  nama_lengkap: string
  nip_nrp: string
  departemen: string
  roles: RoleName[]
}

const INITIAL_CREATE_FORM: CreateUserForm = {
  email: '',
  password: '',
  confirmPassword: '',
  nama_lengkap: '',
  nip_nrp: '',
  departemen: '',
  roles: ['PEGAWAI'],
}

const INITIAL_EDIT_FORM: EditUserForm = {
  nama_lengkap: '',
  nip_nrp: '',
  departemen: '',
  roles: [],
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

function MasterUserPage() {
  // State
  const [users, setUsers] = useState<UserWithRoles[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'aktif' | 'nonaktif'>('all')

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

  // ---------------------------------------------------------------------------
  // Fetch users
  // ---------------------------------------------------------------------------

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/users/')
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Gagal memuat data')
      }
      const data = await res.json()
      setUsers(data.users || [])
    } catch (err: any) {
      setError(err.message || 'Gagal memuat data user')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

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

    return matchSearch && matchStatus
  })

  // ---------------------------------------------------------------------------
  // Dialog handlers
  // ---------------------------------------------------------------------------

  const openEdit = (user: UserWithRoles) => {
    setSelectedUser(user)
    setEditForm({
      nama_lengkap: user.metadata.nama_lengkap || '',
      nip_nrp: user.metadata.nip_nrp || '',
      departemen: user.metadata.departemen || '',
      roles: [...user.roles],
    })
    setEditOpen(true)
  }

  const openResetPassword = (user: UserWithRoles) => {
    setSelectedUser(user)
    setResetPassword('')
    setConfirmResetPassword('')
    setResetPasswordOpen(true)
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
      alert('Mohon isi semua field yang wajib')
      return
    }
    if (createForm.password !== createForm.confirmPassword) {
      alert('Konfirmasi password tidak cocok')
      return
    }
    if (createForm.password.length < 8) {
      alert('Password minimal 8 karakter')
      return
    }

    setActionLoading(true)
    try {
      const res = await fetch('/api/users/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: createForm.email,
          password: createForm.password,
          nama_lengkap: createForm.nama_lengkap,
          nip_nrp: createForm.nip_nrp,
          departemen: createForm.departemen || undefined,
          roles: createForm.roles,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal membuat user')
      }
      setCreateOpen(false)
      setCreateForm(INITIAL_CREATE_FORM)
      await fetchUsers()
    } catch (err: any) {
      alert(err.message || 'Gagal membuat user')
    } finally {
      setActionLoading(false)
    }
  }

  const handleEdit = async () => {
    if (!selectedUser) return
    if (!editForm.nama_lengkap || !editForm.nip_nrp) {
      alert('Mohon isi semua field yang wajib')
      return
    }

    setActionLoading(true)
    try {
      const res = await fetch(`/api/users/${selectedUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama_lengkap: editForm.nama_lengkap,
          nip_nrp: editForm.nip_nrp,
          departemen: editForm.departemen || undefined,
          roles: editForm.roles,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengupdate user')
      }
      setEditOpen(false)
      setSelectedUser(null)
      await fetchUsers()
    } catch (err: any) {
      alert(err.message || 'Gagal mengupdate user')
    } finally {
      setActionLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!selectedUser) return
    if (!resetPassword || !confirmResetPassword) {
      alert('Mohon isi password baru dan konfirmasinya')
      return
    }
    if (resetPassword !== confirmResetPassword) {
      alert('Konfirmasi password tidak cocok')
      return
    }
    if (resetPassword.length < 8) {
      alert('Password minimal 8 karakter')
      return
    }

    setActionLoading(true)
    try {
      const res = await fetch(`/api/users/${selectedUser.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mereset password')
      }
      alert('Password berhasil direset')
      setResetPasswordOpen(false)
      setSelectedUser(null)
    } catch (err: any) {
      alert(err.message || 'Gagal mereset password')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeactivate = async () => {
    if (!selectedUser) return

    setActionLoading(true)
    try {
      const res = await fetch(`/api/users/${selectedUser.id}/deactivate`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menonaktifkan user')
      }
      setDeactivateOpen(false)
      setSelectedUser(null)
      await fetchUsers()
    } catch (err: any) {
      alert(err.message || 'Gagal menonaktifkan user')
    } finally {
      setActionLoading(false)
    }
  }

  const handleActivate = async () => {
    if (!selectedUser) return

    setActionLoading(true)
    try {
      const res = await fetch(`/api/users/${selectedUser.id}/activate`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengaktifkan user')
      }
      setActivateOpen(false)
      setSelectedUser(null)
      await fetchUsers()
    } catch (err: any) {
      alert(err.message || 'Gagal mengaktifkan user')
    } finally {
      setActionLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Role toggle helpers
  // ---------------------------------------------------------------------------

  const toggleRole = (role: RoleName, form: 'create' | 'edit') => {
    if (form === 'create') {
      if (role === 'PEGAWAI') return // Cannot remove PEGAWAI
      setCreateForm(prev => ({
        ...prev,
        roles: prev.roles.includes(role)
          ? prev.roles.filter(r => r !== role)
          : [...prev.roles, role],
      }))
    } else {
      if (role === 'PEGAWAI') return // Cannot remove PEGAWAI
      setEditForm(prev => ({
        ...prev,
        roles: prev.roles.includes(role)
          ? prev.roles.filter(r => r !== role)
          : [...prev.roles, role],
      }))
    }
  }

  const isPegawaiDisabled = (role: RoleName) => role === 'PEGAWAI'

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <PageLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
              <Shield size={12} />
              <span>Admin / Master Data</span>
              <ChevronRight size={10} />
              <span className="text-primary">Master User</span>
            </div>
            <h2 className="font-headline text-2xl font-extrabold text-on-surface">Master User</h2>
            <p className="text-on-surface-variant text-xs mt-1">
              Kelola akses dan data pengguna sistem DMS BPS Kabupaten Kepulauan Seribu.
            </p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <UserPlus size={14} />
            Tambah User
          </Button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap gap-3">
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
            className="bg-white border border-border rounded-lg px-3 py-2 text-xs font-medium text-on-surface focus:ring-1 focus:ring-ring/40 outline-none min-w-[140px]"
          >
            <option value="all">Semua Status</option>
            <option value="aktif">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
          </select>
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline/40" />
            <input
              type="text"
              placeholder="Cari user..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 w-full bg-white border border-border rounded-lg text-xs focus:ring-1 focus:ring-ring/40 outline-none placeholder:text-outline/40"
            />
          </div>
          <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>

        {/* Error state */}
        {error && (
          <div className="bg-destructive/10 text-destructive p-4 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-surface-container-low/30">
                <TableHead className="w-12 text-center">No</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead className="text-center">Hak Akses</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center w-32">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <Loader2 size={20} className="animate-spin mx-auto text-outline" />
                  </TableCell>
                </TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-outline">
                    Tidak ada user yang ditemukan
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user, i) => (
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
                            <p className="text-[10px] text-outline/60 font-medium">NIP: {user.metadata.nip_nrp}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 justify-center">
                        {user.roles.length > 0 ? (
                          user.roles.map(role => (
                            <Badge
                              key={role}
                              className={ROLE_COLORS[role]}
                            >
                              {role}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-outline">-</span>
                        )}
                      </div>
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
                      <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="icon-xs" variant="ghost" onClick={() => openEdit(user)} title="Edit">
                          <Edit2 size={14} />
                        </Button>
                        <Button size="icon-xs" variant="ghost" onClick={() => openResetPassword(user)} title="Reset Password">
                          <RefreshCw size={14} />
                        </Button>
                        {user.isActive ? (
                          <Button size="icon-xs" variant="ghost" onClick={() => openDeactivate(user)} className="hover:text-red-600" title="Nonaktifkan">
                            <UserX size={14} />
                          </Button>
                        ) : (
                          <Button size="icon-xs" variant="ghost" onClick={() => openActivate(user)} className="hover:text-green-600" title="Aktifkan">
                            <UserCheck size={14} />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination info */}
          <div className="px-6 py-4 bg-surface-container-low/30 border-t border-outline-variant/20 flex items-center justify-between">
            <p className="text-[10px] text-outline font-bold uppercase tracking-widest">
              Showing {filteredUsers.length} of {users.length} users
            </p>
          </div>
        </div>
      </div>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah User Baru</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-on-surface mb-1 block">Email *</label>
              <Input
                type="email"
                value={createForm.email}
                onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))}
                placeholder="email@bps.go.id"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-on-surface mb-1 block">Password *</label>
                <Input
                  type="password"
                  value={createForm.password}
                  onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="Min 8 karakter"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface mb-1 block">Konfirmasi *</label>
                <Input
                  type="password"
                  value={createForm.confirmPassword}
                  onChange={e => setCreateForm(p => ({ ...p, confirmPassword: e.target.value }))}
                  placeholder="Ulangi password"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface mb-1 block">Nama Lengkap *</label>
              <Input
                value={createForm.nama_lengkap}
                onChange={e => setCreateForm(p => ({ ...p, nama_lengkap: e.target.value }))}
                placeholder="Nama lengkap"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface mb-1 block">NIP/NRP *</label>
              <Input
                value={createForm.nip_nrp}
                onChange={e => setCreateForm(p => ({ ...p, nip_nrp: e.target.value }))}
                placeholder="Numerik 8-20 karakter"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface mb-1 block">Departemen</label>
              <Input
                value={createForm.departemen}
                onChange={e => setCreateForm(p => ({ ...p, departemen: e.target.value }))}
                placeholder="Opsional"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface mb-2 block">Hak Akses</label>
              <div className="flex flex-wrap gap-2">
                {ALL_ROLES.map(role => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggleRole(role, 'create')}
                    disabled={isPegawaiDisabled(role)}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      createForm.roles.includes(role)
                        ? `${ROLE_COLORS[role]} border-current`
                        : 'bg-white border-border text-outline hover:bg-muted'
                    } ${isPegawaiDisabled(role) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {role}
                    {role === 'PEGAWAI' && ' (wajib)'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button>
            <Button onClick={handleCreate} disabled={actionLoading}>
              {actionLoading && <Loader2 size={14} className="animate-spin mr-1" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-on-surface mb-1 block">Email</label>
              <Input value={selectedUser?.email || ''} disabled className="bg-muted" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface mb-1 block">Nama Lengkap *</label>
              <Input
                value={editForm.nama_lengkap}
                onChange={e => setEditForm(p => ({ ...p, nama_lengkap: e.target.value }))}
                placeholder="Nama lengkap"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface mb-1 block">NIP/NRP *</label>
              <Input
                value={editForm.nip_nrp}
                onChange={e => setEditForm(p => ({ ...p, nip_nrp: e.target.value }))}
                placeholder="Numerik 8-20 karakter"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface mb-1 block">Departemen</label>
              <Input
                value={editForm.departemen}
                onChange={e => setEditForm(p => ({ ...p, departemen: e.target.value }))}
                placeholder="Opsional"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface mb-2 block">Hak Akses</label>
              <div className="flex flex-wrap gap-2">
                {ALL_ROLES.map(role => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggleRole(role, 'edit')}
                    disabled={isPegawaiDisabled(role)}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      editForm.roles.includes(role)
                        ? `${ROLE_COLORS[role]} border-current`
                        : 'bg-white border-border text-outline hover:bg-muted'
                    } ${isPegawaiDisabled(role) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {role}
                    {role === 'PEGAWAI' && ' (wajib)'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Batal</Button>
            <Button onClick={handleEdit} disabled={actionLoading}>
              {actionLoading && <Loader2 size={14} className="animate-spin mr-1" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-on-surface-variant">
              Reset password untuk user <strong className="text-on-surface">{selectedUser?.metadata.nama_lengkap || selectedUser?.email}</strong>
            </p>
            <div>
              <label className="text-xs font-medium text-on-surface mb-1 block">Password Baru *</label>
              <Input
                type="password"
                value={resetPassword}
                onChange={e => setResetPassword(e.target.value)}
                placeholder="Min 8 karakter"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface mb-1 block">Konfirmasi *</label>
              <Input
                type="password"
                value={confirmResetPassword}
                onChange={e => setConfirmResetPassword(e.target.value)}
                placeholder="Ulangi password"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Password akan langsung berlaku. User harus login dengan password baru.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPasswordOpen(false)}>Batal</Button>
            <Button onClick={handleResetPassword} disabled={actionLoading}>
              {actionLoading && <Loader2 size={14} className="animate-spin mr-1" />}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Dialog */}
      <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nonaktifkan User?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-on-surface-variant">
            User <strong className="text-on-surface">{selectedUser?.metadata.nama_lengkap || selectedUser?.email}</strong> akan dinonaktifkan.
            User tidak akan bisa login lagi. Role user tetap tersimpan.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateOpen(false)}>Batal</Button>
            <Button variant="destructive" onClick={handleDeactivate} disabled={actionLoading}>
              {actionLoading && <Loader2 size={14} className="animate-spin mr-1" />}
              Nonaktifkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activate Dialog */}
      <Dialog open={activateOpen} onOpenChange={setActivateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Aktifkan User?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-on-surface-variant">
            User <strong className="text-on-surface">{selectedUser?.metadata.nama_lengkap || selectedUser?.email}</strong> akan diaktifkan kembali.
            User bisa login lagi.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivateOpen(false)}>Batal</Button>
            <Button onClick={handleActivate} disabled={actionLoading}>
              {actionLoading && <Loader2 size={14} className="animate-spin mr-1" />}
              Aktifkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
