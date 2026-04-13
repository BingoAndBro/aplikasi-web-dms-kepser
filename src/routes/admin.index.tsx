import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  Search,
  Filter,
  Download,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Shield,
  Building2,
  ClipboardList,
  FileCheck,
} from 'lucide-react'
import { getBrowserClient } from '#/lib/supabase-browser'

export const Route = createFileRoute('/admin/')({
  component: AdminPage,
})

const MOCK_USERS = [
  {
    id: 'USR-001',
    name: 'Amara Setiadi',
    email: 'amara.s@bps.go.id',
    department: 'Sosial',
    role: 'Pegawai',
    status: 'Aktif' as const,
  },
  {
    id: 'USR-002',
    name: 'Baskara Putra',
    email: 'baskara.p@bps.go.id',
    department: 'Distribusi',
    role: 'PPK',
    status: 'Offline' as const,
  },
  {
    id: 'USR-003',
    name: 'Citra Lestari',
    email: 'citra.l@bps.go.id',
    department: 'IPDS',
    role: 'Arsiparis',
    status: 'Aktif' as const,
  },
  {
    id: 'USR-004',
    name: 'Daffa Arkan',
    email: 'daffa.a@bps.go.id',
    department: 'Neraca',
    role: 'Bendahara',
    status: 'Suspended' as const,
  },
]

type TabId = 'master_user' | 'dept_function' | 'master_activity' | 'doc_completeness'

const TABS: { id: TabId; label: string; icon: typeof Shield }[] = [
  { id: 'master_user', label: 'Master User', icon: Shield },
  { id: 'dept_function', label: 'Departemen Fungsi', icon: Building2 },
  { id: 'master_activity', label: 'Master Kegiatan', icon: ClipboardList },
  { id: 'doc_completeness', label: 'Kelengkapan Dokumen', icon: FileCheck },
]

function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabId>('master_user')

  useEffect(() => {
    async function checkAuth() {
      const supabase = getBrowserClient()
      if (!supabase) { window.location.href = '/login'; return }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.href = '/login'; return }
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('role:roles(nama)')
        .eq('user_id', session.user.id)
      const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
      if (!roleNames.includes('ADMIN')) { window.location.href = '/forbidden'; return }
    }
    checkAuth()
  }, [])

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar bg-background">
      {/* Tab Navigation */}
      <div className="px-8 pt-6 border-b border-outline-variant/15">
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-widest rounded-t-lg transition-all ${
                  isActive
                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                    : 'text-outline hover:text-primary hover:bg-primary/5'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'master_user' ? (
        <MasterUserView />
      ) : (
        <ComingSoonView label={TABS.find(t => t.id === activeTab)!.label} />
      )}
    </div>
  )
}

function MasterUserView() {
  return (
    <div>
      {/* Header */}
      <header className="p-8 pb-6 flex justify-between items-end">
        <div>
          <p className="text-primary font-bold tracking-widest text-[10px] uppercase font-headline mb-1">
            USER MANAGEMENT
          </p>
          <h1 className="font-headline text-3xl font-extrabold text-on-surface tracking-tight">
            Master User
          </h1>
          <p className="text-on-surface-variant text-xs mt-1 font-medium max-w-xl">
            Kelola akses dan data pengguna sistem DMS BPS Kabupaten Kepulauan Seribu.
          </p>
        </div>
        <button className="px-6 py-3 bg-primary text-white rounded-lg font-extrabold hover:shadow-xl hover:-translate-y-0.5 transition-all active:scale-95 text-xs uppercase tracking-widest shadow-lg shadow-primary/20 flex items-center justify-center gap-2">
          <UserPlus size={16} /> Tambah User
        </button>
      </header>

      {/* Stats */}
      <div className="px-8 mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Users', value: '1,284', extra: <span className="text-[10px] text-green-600 font-bold bg-green-50 px-1.5 py-0.5 rounded">+12%</span> },
          { label: 'Active Now', value: '452', extra: <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> },
          { label: 'Pending Tasks', value: '28', extra: <span className="text-[10px] text-primary font-bold bg-primary/10 px-1.5 py-0.5 rounded uppercase">New</span> },
          { label: 'Storage Used', value: null, extra: null },
        ].map((stat, i) => (
          <div key={i} className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-sm">
            <p className="text-[9px] font-extrabold text-outline uppercase tracking-wider mb-2">{stat.label}</p>
            {stat.value ? (
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold font-headline text-on-surface">{stat.value}</span>
                {stat.extra}
              </div>
            ) : (
              <>
                <div className="w-full bg-surface-container rounded-full h-1.5 mt-2 overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: '64%' }} />
                </div>
                <p className="text-[9px] text-right font-bold text-on-surface-variant mt-1">6.4 GB / 10 GB</p>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="px-8 flex-1">
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm mb-8">
          {/* Table toolbar */}
          <div className="px-6 py-4 bg-surface-container-low/50 flex justify-between items-center border-b border-outline-variant/20">
            <div className="flex gap-3">
              <select className="bg-white border border-outline-variant rounded-lg px-3 py-1.5 text-[11px] font-bold text-on-surface-variant focus:ring-1 focus:ring-primary outline-none">
                <option>All Departemen</option>
                <option>Sosial</option>
                <option>Distribusi</option>
                <option>IPDS</option>
                <option>Neraca</option>
                <option>Produksi</option>
                <option>Umum</option>
              </select>
              <select className="bg-white border border-outline-variant rounded-lg px-3 py-1.5 text-[11px] font-bold text-on-surface-variant focus:ring-1 focus:ring-primary outline-none">
                <option>All Roles</option>
                <option>Pegawai</option>
                <option>PPK</option>
                <option>Bendahara</option>
                <option>Arsiparis</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button className="p-2 text-outline hover:text-primary transition-colors hover:bg-primary/5 rounded-lg">
                <Filter size={16} />
              </button>
              <button className="p-2 text-outline hover:text-primary transition-colors hover:bg-primary/5 rounded-lg">
                <Download size={16} />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="px-6 py-3 border-b border-outline-variant/10">
            <div className="relative max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline/40" />
              <input
                type="text"
                placeholder="Cari user..."
                className="pl-9 pr-4 py-2 w-full bg-surface-container/40 border border-outline-variant/20 rounded-lg text-xs focus:ring-1 focus:ring-primary/40 outline-none placeholder:text-outline/40"
              />
            </div>
          </div>

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/30">
                {['Nama', 'Departemen', 'Peran', 'Status', 'Aksi'].map((h, i) => (
                  <th
                    key={h}
                    className={`px-6 py-3 text-[10px] font-extrabold text-outline uppercase tracking-widest border-b border-outline-variant/20 ${i === 4 ? 'text-right' : ''}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {MOCK_USERS.map((user) => (
                <tr key={user.id} className="hover:bg-primary/5 transition-colors group cursor-pointer">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center border border-outline-variant/20">
                        <span className="text-xs font-extrabold text-primary">
                          {user.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-on-surface">{user.name}</p>
                        <p className="text-[10px] text-outline font-medium">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-semibold text-on-surface-variant">{user.department}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-0.5 bg-surface-container text-[9px] font-extrabold text-outline uppercase rounded">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        user.status === 'Aktif' ? 'bg-green-500' :
                        user.status === 'Offline' ? 'bg-outline-variant' : 'bg-error'
                      }`} />
                      <span className={`text-[11px] font-bold ${
                        user.status === 'Aktif' ? 'text-green-600' :
                        user.status === 'Offline' ? 'text-outline' : 'text-error'
                      }`}>
                        {user.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 text-outline hover:text-primary transition-colors">
                        <Edit size={16} />
                      </button>
                      <button className="p-1.5 text-outline hover:text-error transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="px-6 py-4 bg-surface-container-low/30 border-t border-outline-variant/20 flex items-center justify-between">
            <p className="text-[10px] text-outline font-bold uppercase tracking-widest">
              Showing 1 to {MOCK_USERS.length} of 1,284 users
            </p>
            <div className="flex gap-2">
              <button className="p-1 text-outline hover:text-primary transition-colors disabled:opacity-30">
                <ChevronLeft size={18} />
              </button>
              <button className="w-7 h-7 flex items-center justify-center bg-primary text-white rounded text-[10px] font-bold">1</button>
              <button className="w-7 h-7 flex items-center justify-center hover:bg-primary/10 text-outline hover:text-primary rounded text-[10px] font-bold transition-colors">2</button>
              <button className="w-7 h-7 flex items-center justify-center hover:bg-primary/10 text-outline hover:text-primary rounded text-[10px] font-bold transition-colors">3</button>
              <button className="p-1 text-outline hover:text-primary transition-colors">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ComingSoonView({ label }: { label: string }) {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Shield size={32} className="text-primary" />
        </div>
        <div>
          <h2 className="font-headline text-xl font-extrabold text-on-surface">{label}</h2>
          <p className="text-on-surface-variant text-sm mt-2">
            Halaman atau fitur belum dibuat. Akan dikembangkan di iterasi berikutnya.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-lg">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[10px] font-extrabold text-primary uppercase tracking-widest">Coming Soon</span>
        </div>
      </div>
    </div>
  )
}
