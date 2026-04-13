import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ShieldX } from 'lucide-react'

export const Route = createFileRoute('/forbidden')({
  component: ForbiddenPage,
})

function ForbiddenPage() {
  const navigate = useNavigate()

  return (
    <>
      <div className="mesh-bg">
        <div className="mesh-blob mesh-blob-1" />
        <div className="mesh-blob mesh-blob-2" />
        <div className="mesh-blob mesh-blob-3" />
      </div>
      <div className="min-h-screen flex items-center justify-center relative z-10 px-4">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-2xl bg-error/10 flex items-center justify-center mx-auto mb-6">
            <ShieldX size={40} className="text-error" />
          </div>
          <p className="text-error font-black text-[10px] uppercase tracking-[0.25em] mb-2">
            Akses Ditolak
          </p>
          <h1 className="font-headline text-6xl font-extrabold text-on-surface tracking-tight mb-3">
            403
          </h1>
          <p className="text-on-surface-variant text-sm mb-8">
            Anda tidak memiliki izin untuk mengakses halaman ini.
            Hubungi Administrator jika Anda merasa ini adalah kesalahan.
          </p>
          <button
            onClick={() => navigate({ to: '/' })}
            className="px-8 py-3 bg-primary text-white rounded-xl font-extrabold text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 active:scale-95 transition-all"
          >
            Kembali ke Beranda
          </button>
        </div>
      </div>
    </>
  )
}
