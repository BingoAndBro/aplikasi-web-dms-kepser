import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { FileText } from 'lucide-react'
import { getBrowserClient } from '#/lib/supabase-browser'

const ALLOWED_ROLES = ['PEGAWAI', 'PPK', 'BENDAHARA', 'ARSIPARIS']

export const Route = createFileRoute('/dokumen')({
  component: DokumenPage,
})

function DokumenPage() {
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
      const hasAccess = ALLOWED_ROLES.some(r => roleNames.includes(r))
      if (!hasAccess) { window.location.href = '/forbidden'; return }
    }
    checkAuth()
  }, [])

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <header className="p-8 pb-6">
        <p className="text-primary font-bold tracking-widest text-[10px] uppercase font-headline mb-1">
          DOKUMEN
        </p>
        <h1 className="font-headline text-3xl font-extrabold text-on-surface tracking-tight">
          Dokumen Saya
        </h1>
        <p className="text-on-surface-variant text-xs mt-1 font-medium max-w-xl">
          Riwayat dan daftar dokumen yang terkait dengan akun Anda.
        </p>
      </header>

      <div className="px-8 pb-8">
        <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest/60 backdrop-blur-sm">
          <div className="flex flex-col items-center justify-center py-20 gap-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <FileText size={32} className="text-primary" />
            </div>
            <div className="text-center max-w-sm">
              <h2 className="font-headline text-xl font-extrabold text-on-surface mb-2">
                Dokumen Saya
              </h2>
              <p className="text-on-surface-variant text-sm">
                Halaman atau fitur belum dibuat. Akan dikembangkan di iterasi berikutnya.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-lg">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] font-extrabold text-primary uppercase tracking-widest">
                Coming Soon
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
