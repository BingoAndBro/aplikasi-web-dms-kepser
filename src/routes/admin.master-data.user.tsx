import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { DashboardShell } from '#/components/dashboard/DashboardShell'
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
import {
  Search,
  Edit2,
  Trash2,
  UserPlus,
  Shield,
  ChevronRight,
} from 'lucide-react'

type UserRow = {
  id: string
  name: string
  email: string
  department: string
  role: string
  status: 'Aktif' | 'Offline' | 'Suspended'
}

export const Route = createFileRoute('/admin/master-data/user')({
  component: MasterUserPage,
})

function MasterUserPage() {
  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null)

  const mockUsers: UserRow[] = [
    { id: 'USR-001', name: 'Amara Setiadi', email: 'amara.s@bps.go.id', department: 'Sosial', role: 'Pegawai', status: 'Aktif' },
    { id: 'USR-002', name: 'Baskara Putra', email: 'baskara.p@bps.go.id', department: 'Distribusi', role: 'PPK', status: 'Offline' },
    { id: 'USR-003', name: 'Citra Lestari', email: 'citra.l@bps.go.id', department: 'IPDS', role: 'Arsiparis', status: 'Aktif' },
    { id: 'USR-004', name: 'Daffa Arkan', email: 'daffa.a@bps.go.id', department: 'Neraca', role: 'Bendahara', status: 'Suspended' },
    { id: 'USR-005', name: 'Elsa Maharani', email: 'elsa.m@bps.go.id', department: 'Sosial', role: 'Pegawai', status: 'Aktif' },
    { id: 'USR-006', name: 'Fajar Nugroho', email: 'fajar.n@bps.go.id', department: 'Produksi', role: 'Pegawai', status: 'Offline' },
  ]

  const filtered = mockUsers.filter(u => {
    const matchDept = !filterDept || u.department === filterDept
    const matchRole = !filterRole || u.role === filterRole
    const matchSearch = !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    return matchDept && matchRole && matchSearch
  })

  const getStatusColor = (status: UserRow['status']) => {
    switch (status) {
      case 'Aktif': return 'bg-green-500'
      case 'Offline': return 'bg-outline'
      case 'Suspended': return 'bg-error'
    }
  }

  return (
    <DashboardShell role="ADMIN">
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
          <Button size="sm" className="gap-1.5">
            <UserPlus size={14} />
            Tambah User
          </Button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap gap-3">
          <select
            value={filterDept}
            onChange={e => setFilterDept(e.target.value)}
            className="bg-white border border-border rounded-lg px-3 py-2 text-xs font-medium text-on-surface focus:ring-1 focus:ring-ring/40 outline-none min-w-[140px]"
          >
            <option value="">Semua Departemen</option>
            {['Sosial', 'Distribusi', 'Neraca', 'Produksi', 'Umum', 'IPDS'].map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value)}
            className="bg-white border border-border rounded-lg px-3 py-2 text-xs font-medium text-on-surface focus:ring-1 focus:ring-ring/40 outline-none min-w-[140px]"
          >
            <option value="">Semua Role</option>
            {['Pegawai', 'PPK', 'Bendahara', 'Arsiparis', 'Admin'].map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
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
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-surface-container-low/30">
                <TableHead className="w-12 text-center">No</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Departemen</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center w-24">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((user, i) => (
                <TableRow key={user.id} className="group hover:bg-primary/5 transition-colors">
                  <TableCell className="text-center text-xs text-outline">{i + 1}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center border border-outline-variant/20 shrink-0">
                        <span className="text-xs font-extrabold text-primary">
                          {user.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-on-surface">{user.name}</p>
                        <p className="text-[10px] text-outline font-medium">{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-semibold text-on-surface-variant">{user.department}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-medium px-2 py-0.5 bg-surface rounded-lg text-outline">
                      {user.role}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor(user.status)}`} />
                      <span className={`text-[11px] font-bold ${
                        user.status === 'Aktif' ? 'text-green-600' :
                        user.status === 'Offline' ? 'text-outline' : 'text-error'
                      }`}>
                        {user.status}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="icon-xs" variant="ghost" onClick={() => {}}>
                        <Edit2 size={14} />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => setDeleteTarget(user)}
                        className="hover:text-error"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="px-6 py-4 bg-surface-container-low/30 border-t border-outline-variant/20 flex items-center justify-between">
            <p className="text-[10px] text-outline font-bold uppercase tracking-widest">
              Showing 1 to {filtered.length} of {mockUsers.length} users
            </p>
            <div className="flex gap-2">
              <button className="w-7 h-7 flex items-center justify-center hover:bg-primary/10 text-outline hover:text-primary rounded text-[10px] font-bold transition-colors">
                ‹
              </button>
              <button className="w-7 h-7 flex items-center justify-center bg-primary text-white rounded text-[10px] font-bold">
                1
              </button>
              <button className="w-7 h-7 flex items-center justify-center hover:bg-primary/10 text-outline hover:text-primary rounded text-[10px] font-bold transition-colors">
                2
              </button>
              <button className="w-7 h-7 flex items-center justify-center hover:bg-primary/10 text-outline hover:text-primary rounded text-[10px] font-bold transition-colors">
                ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nonaktifkan User?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-on-surface-variant">
            User <strong className="text-on-surface">{deleteTarget?.name}</strong> akan dinonaktifkan.
            User tidak akan bisa login lagi.
          </p>
          <DialogFooter className="gap-2">
            <Button onClick={() => setDeleteTarget(null)} variant="outline" size="sm">Batal</Button>
            <Button variant="destructive" size="sm" className="gap-1.5">
              Nonaktifkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}
