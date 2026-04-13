import { createFileRoute } from '@tanstack/react-router'
import { LayoutDashboard } from 'lucide-react'

export const Route = createFileRoute('/')({
  component: PegawaiWorkspace,
})

function PegawaiWorkspace() {
  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      {/* Page Header */}
      <header className="p-8 pb-6 flex justify-between items-end">
        <div>
          <p className="text-primary font-bold tracking-widest text-[10px] uppercase font-headline mb-1">
            PEGAWAI PORTAL
          </p>
          <h1 className="font-headline text-3xl font-extrabold text-on-surface tracking-tight">
            Dashboard
          </h1>
          <p className="text-on-surface-variant text-xs mt-1 font-medium max-w-xl">
            Selamat datang di ruang kerja Pegawai BPS Kabupaten Kepulauan Seribu.
          </p>
        </div>
      </header>

      {/* Coming Soon Content */}
      <div className="px-8 pb-8">
        <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest/60 backdrop-blur-sm overflow-hidden">
          <div className="flex flex-col items-center justify-center py-20 gap-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <LayoutDashboard size={32} className="text-primary" />
            </div>
            <div className="text-center max-w-sm">
              <h2 className="font-headline text-xl font-extrabold text-on-surface mb-2">
                Ruang Pegawai
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
