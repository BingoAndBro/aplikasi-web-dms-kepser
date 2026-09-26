import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import {
  Archive,
  BadgeCheck,
  BarChart3,
  ChevronDown,
  FileEdit,
  FilePlus,
  KeyRound,
  LifeBuoy,
  MessageCircleQuestion,
  Search,
  Shield,
} from 'lucide-react'

import { PageLayout } from '#/components/dashboard/PageLayout'
import { EmptyState } from '#/components/ui/EmptyState'
import { Input } from '#/components/ui/input'
import { getClientAuthState } from '#/lib/auth-state'
import { ROUTES } from '#/lib/constants/routes'
import { ROLE_DISPLAY } from '#/lib/constants/roles'
import { cn } from '#/lib/utils'
import type { RoleName } from '#/lib/types/auth'

export const Route = createFileRoute('/bantuan')({
  component: BantuanPage,
})

type Category = 'UMUM' | RoleName

const CATEGORY_LABEL: Record<Category, string> = {
  UMUM: 'Umum',
  ...ROLE_DISPLAY,
}

const CATEGORY_ORDER: Category[] = [
  'UMUM',
  'PEGAWAI',
  'PPK',
  'PPSPM',
  'KEPALA_SUB_BAGIAN_UMUM',
  'PENANGGUNG_JAWAB_KINERJA',
  'ADMIN',
]

type FaqItem = {
  id: string
  category: Category
  question: string
  answer: string
}

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'umum-lupa-password',
    category: 'UMUM',
    question: 'Saya lupa password, bagaimana cara masuk kembali?',
    answer: 'Password tidak dapat direset mandiri lewat halaman login. Hubungi Admin Sistem untuk melakukan reset password akun Anda. Jika Anda masih bisa masuk namun ingin mengganti password, buka menu Profil > Keamanan Akun > Reset Password.',
  },
  {
    id: 'umum-ganti-password',
    category: 'UMUM',
    question: 'Bagaimana cara mengganti password saat sudah login?',
    answer: 'Buka menu Profil (ikon akun di pojok atas), pilih "Reset Password" pada kartu Keamanan Akun, lalu masukkan password saat ini dan password baru minimal 8 karakter. Anda akan diminta masuk ulang setelah password berhasil diganti.',
  },
  {
    id: 'umum-akun-tidak-aktif',
    category: 'UMUM',
    question: 'Muncul pesan "Akun Anda tidak aktif" saat login, apa artinya?',
    answer: 'Akun Anda dinonaktifkan oleh Admin Sistem, biasanya karena mutasi pegawai atau permintaan penonaktifan. Hubungi Admin Sistem di instansi Anda untuk mengaktifkan kembali akun.',
  },
  {
    id: 'umum-multi-role',
    category: 'UMUM',
    question: 'Saya punya lebih dari satu peran (role), bagaimana cara berpindah?',
    answer: 'Jika akun Anda memiliki lebih dari satu hak akses (misalnya Pegawai dan Penanggung Jawab Kinerja), gunakan pengalih peran yang tersedia pada bagian atas navigasi untuk berpindah tampilan dashboard sesuai peran aktif.',
  },
  {
    id: 'umum-activity-log',
    category: 'UMUM',
    question: 'Apa fungsi menu Activity Log?',
    answer: 'Activity Log mencatat riwayat aktivitas Anda di sistem, seperti pengajuan, validasi, atau perubahan dokumen. Gunakan menu ini untuk menelusuri kembali kapan sebuah tindakan dilakukan.',
  },
  {
    id: 'pegawai-ajukan',
    category: 'PEGAWAI',
    question: 'Bagaimana cara mengajukan dokumen baru?',
    answer: 'Buka menu "Ajukan Dokumen" pada sidebar, lengkapi jenis, kategori, dan kelengkapan dokumen sesuai formulir, lalu unggah berkas pendukung dan kirim pengajuan. Status pengajuan dapat dipantau di menu "Dokumen Diajukan".',
  },
  {
    id: 'pegawai-status',
    category: 'PEGAWAI',
    question: 'Bagaimana cara mengecek status dokumen yang sudah diajukan?',
    answer: 'Buka menu "Dokumen Diajukan" untuk melihat seluruh dokumen beserta status terkininya (menunggu validasi PPK, tervalidasi, ditolak, atau perlu revisi).',
  },
  {
    id: 'pegawai-revisi',
    category: 'PEGAWAI',
    question: 'Dokumen saya diminta revisi, apa yang harus dilakukan?',
    answer: 'Buka menu "Revisi Dokumen", periksa catatan revisi dari PPK/PPSPM pada dokumen terkait, perbaiki berkas atau data yang diminta, lalu kirim ulang dokumen tersebut.',
  },
  {
    id: 'pegawai-laporan',
    category: 'PEGAWAI',
    question: 'Di mana saya bisa melihat rekap dokumen dan realisasi saya?',
    answer: 'Gunakan menu "Laporan Saya" untuk melihat rekap dokumen pribadi. Jika Anda ditugaskan sebagai Penanggung Jawab Kegiatan, gunakan menu "Laporan Kegiatan" untuk rekap tingkat kegiatan.',
  },
  {
    id: 'ppk-validasi',
    category: 'PPK',
    question: 'Bagaimana alur memvalidasi dokumen yang masuk?',
    answer: 'Dokumen yang diajukan pegawai akan muncul di menu "Validasi Dokumen". Periksa kelengkapan dan kesesuaian dokumen, lalu pilih untuk menyetujui (dokumen akan diteruskan ke PPSPM), menolak, atau meminta revisi ke pegawai.',
  },
  {
    id: 'ppk-tolak-revisi',
    category: 'PPK',
    question: 'Apa bedanya menolak dokumen dengan meminta revisi?',
    answer: 'Meminta revisi mengembalikan dokumen ke pegawai untuk diperbaiki dan dapat diajukan kembali. Menolak menandai dokumen sebagai tidak valid dan dokumen tersebut dapat dilihat kembali pada menu "Dokumen Tidak Valid".',
  },
  {
    id: 'ppk-monitoring',
    category: 'PPK',
    question: 'Di mana saya bisa memantau nominal realisasi anggaran?',
    answer: 'Gunakan menu "Nominal Realisasi" untuk memantau akumulasi nilai dokumen yang telah divalidasi dan disetujui.',
  },
  {
    id: 'ppspm-persetujuan',
    category: 'PPSPM',
    question: 'Bagaimana proses persetujuan akhir dokumen?',
    answer: 'Dokumen yang telah divalidasi PPK akan masuk ke menu "Persetujuan Dokumen". Periksa kembali dokumen tersebut, kemudian setujui untuk menandai dokumen selesai, atau tolak jika ditemukan ketidaksesuaian.',
  },
  {
    id: 'ppspm-selesai',
    category: 'PPSPM',
    question: 'Ke mana dokumen yang sudah saya setujui?',
    answer: 'Dokumen yang telah disetujui akan tercatat pada menu "Dokumen Selesai" dan siap masuk ke tahap pemberkasan/arsip oleh Kepala Sub Bagian Umum.',
  },
  {
    id: 'kasubag-klasifikasi',
    category: 'KEPALA_SUB_BAGIAN_UMUM',
    question: 'Bagaimana cara mengklasifikasikan dokumen yang sudah selesai?',
    answer: 'Buka menu "Pengklasifikasian Dokumen" untuk menetapkan klasifikasi arsip pada dokumen yang telah disetujui PPSPM, mengacu pada struktur di "Master Klasifikasi Dokumen".',
  },
  {
    id: 'kasubag-berkas',
    category: 'KEPALA_SUB_BAGIAN_UMUM',
    question: 'Apa beda Berkas Terbuka dan Berkas Tertutup?',
    answer: 'Berkas Terbuka adalah berkas arsip yang masih dapat ditambahkan dokumen baru. Berkas Tertutup adalah berkas yang sudah difinalisasi dan tidak menerima dokumen tambahan lagi.',
  },
  {
    id: 'kasubag-pembersihan',
    category: 'KEPALA_SUB_BAGIAN_UMUM',
    question: 'Apa fungsi menu Pembersihan Berkas?',
    answer: 'Menu ini digunakan untuk meninjau dan merapikan berkas arsip yang sudah tidak relevan atau perlu digabungkan/dipisahkan sebelum ditutup permanen.',
  },
  {
    id: 'pjk-laporan',
    category: 'PENANGGUNG_JAWAB_KINERJA',
    question: 'Apa yang bisa saya lihat di Laporan Kinerja?',
    answer: 'Menu "Laporan Kinerja" menampilkan rekap capaian dan realisasi dokumen di lingkup kegiatan yang menjadi tanggung jawab Anda.',
  },
  {
    id: 'admin-user',
    category: 'ADMIN',
    question: 'Bagaimana cara menambah atau menonaktifkan akun pengguna?',
    answer: 'Buka menu "Master User", gunakan tombol tambah untuk membuat akun baru, atau ubah status aktif/nonaktif serta reset password pengguna melalui aksi pada baris data pengguna.',
  },
  {
    id: 'admin-master-data',
    category: 'ADMIN',
    question: 'Di mana saya mengatur jenis, kategori, dan kelengkapan dokumen?',
    answer: 'Data referensi dokumen dikelola pada menu "Jenis Permintaan", "Kategori Permintaan", "Detail Permintaan", dan "Kelengkapan Dokumen" di bawah bagian Referensi Dokumen.',
  },
  {
    id: 'admin-settings',
    category: 'ADMIN',
    question: 'Untuk apa halaman Settings pada menu Admin?',
    answer: 'Halaman "Settings" digunakan untuk mengatur konfigurasi umum sistem yang berlaku bagi seluruh pengguna.',
  },
]

const QUICK_LINKS: { role: Category; label: string; description: string; to: string; icon: React.ElementType }[] = [
  { role: 'PEGAWAI', label: 'Ajukan Dokumen', description: 'Mulai pengajuan dokumen baru', to: ROUTES.PEGAWAI.AJU_DOKUMEN, icon: FilePlus },
  { role: 'PEGAWAI', label: 'Revisi Dokumen', description: 'Perbaiki dokumen yang dikembalikan', to: ROUTES.PEGAWAI.REVISI, icon: FileEdit },
  { role: 'PPK', label: 'Validasi Dokumen', description: 'Tinjau dokumen yang masuk', to: ROUTES.PPK.INBOX, icon: BadgeCheck },
  { role: 'PPSPM', label: 'Persetujuan Dokumen', description: 'Setujui dokumen tahap akhir', to: ROUTES.PPSPM.INBOX, icon: BadgeCheck },
  { role: 'KEPALA_SUB_BAGIAN_UMUM', label: 'Pengklasifikasian Dokumen', description: 'Klasifikasikan dokumen selesai', to: ROUTES.KEPALA_SUB_BAGIAN_UMUM.INBOX, icon: Archive },
  { role: 'PENANGGUNG_JAWAB_KINERJA', label: 'Laporan Kinerja', description: 'Pantau capaian kegiatan', to: ROUTES.PENANGGUNG_JAWAB_KINERJA.LAPORAN_KINERJA, icon: BarChart3 },
  { role: 'ADMIN', label: 'Master User', description: 'Kelola akun pengguna', to: ROUTES.ADMIN.MASTER_USER, icon: Shield },
  { role: 'UMUM', label: 'Ganti Password', description: 'Perbarui password akun Anda', to: ROUTES.PROFILE, icon: KeyRound },
]

function normalize(text: string) {
  return text.toLowerCase().normalize('NFC')
}

function BantuanPage() {
  const authState = getClientAuthState()
  const defaultCategory: Category = authState.activeRole ?? 'UMUM'

  const [activeCategory, setActiveCategory] = useState<Category>(defaultCategory)
  const [query, setQuery] = useState('')
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  const trimmedQuery = query.trim()
  const isSearching = trimmedQuery.length > 0

  const visibleFaqs = useMemo(() => {
    if (isSearching) {
      const needle = normalize(trimmedQuery)
      return FAQ_ITEMS.filter(
        (item) => normalize(item.question).includes(needle) || normalize(item.answer).includes(needle),
      )
    }
    return FAQ_ITEMS.filter((item) => item.category === activeCategory)
  }, [activeCategory, isSearching, trimmedQuery])

  const toggleItem = (id: string) => {
    setOpenIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const relevantQuickLinks = QUICK_LINKS.filter(
    (link) => link.role === 'UMUM' || link.role === defaultCategory,
  )

  return (
    <PageLayout className="mx-auto w-full max-w-[1000px] px-4 py-4 sm:px-6 lg:px-10">
      <div className="space-y-6">
        <section className="pt-1">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-full bg-info-surface text-info-text">
              <LifeBuoy size={18} />
            </div>
            <h1 className="font-headline text-[32px] font-black leading-none tracking-tight text-text-strong sm:text-[38px]">
              Pusat Bantuan
            </h1>
          </div>
          <p className="mt-2.5 max-w-2xl text-base font-medium leading-6 text-brand-text-muted">
            Panduan penggunaan DMS Kepser sesuai peran Anda. Cari pertanyaan Anda atau jelajahi berdasarkan kategori.
          </p>

          <div className="relative mt-5 max-w-lg">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-outline" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari, misal: cara mengajukan dokumen"
              className="h-11 rounded-2xl border-brand-border bg-white pl-10 text-sm shadow-[0_1px_8px_rgba(71,50,22,0.08)]"
            />
          </div>
        </section>

        {!isSearching && relevantQuickLinks.length > 0 && (
          <section>
            <h2 className="text-xs font-black uppercase tracking-[0.16em] text-text-muted">Panduan Cepat</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {relevantQuickLinks.map((link) => {
                const Icon = link.icon
                return (
                  <Link
                    key={link.label}
                    to={link.to}
                    className="flex items-center gap-3 rounded-[18px] border border-brand-border bg-white p-4 shadow-[0_1px_8px_rgba(71,50,22,0.08)] transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(71,50,22,0.14)]"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-surface text-primary">
                      <Icon size={17} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-text-strong">{link.label}</p>
                      <p className="truncate text-xs font-medium text-text-muted">{link.description}</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        <section className="rounded-[24px] border border-brand-border bg-white p-5 shadow-[0_1px_8px_rgba(71,50,22,0.12)] sm:p-6">
          {!isSearching && (
            <div className="mb-5 flex flex-wrap gap-2 border-b border-info-border pb-5">
              {CATEGORY_ORDER.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={cn(
                    'rounded-full px-3.5 py-1.5 text-xs font-bold transition-all',
                    activeCategory === category
                      ? 'bg-brand-solid text-white shadow-sm'
                      : 'bg-brand-surface text-text-muted hover:bg-brand-surface-strong hover:text-text-strong',
                  )}
                >
                  {CATEGORY_LABEL[category]}
                </button>
              ))}
            </div>
          )}

          {visibleFaqs.length === 0 ? (
            <EmptyState
              icon={<MessageCircleQuestion size={20} />}
              title="Belum ada jawaban yang cocok"
              description="Coba kata kunci lain, atau hubungi Admin Sistem melalui kontak di bawah."
            />
          ) : (
            <div className="divide-y divide-info-border">
              {visibleFaqs.map((item) => {
                const isOpen = openIds.has(item.id)
                return (
                  <div key={item.id} className="py-3 first:pt-0 last:pb-0">
                    <button
                      type="button"
                      onClick={() => toggleItem(item.id)}
                      className="flex w-full items-center justify-between gap-4 text-left"
                      aria-expanded={isOpen}
                    >
                      <span className="text-sm font-bold text-text-strong">{item.question}</span>
                      <ChevronDown
                        size={16}
                        className={cn('shrink-0 text-outline transition-transform', isOpen && 'rotate-180 text-primary')}
                      />
                    </button>
                    {isOpen && (
                      <p className="mt-2.5 max-w-3xl text-sm font-medium leading-6 text-text-muted">
                        {item.answer}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="rounded-[24px] border border-brand-border bg-brand-surface p-6 text-center shadow-[0_1px_8px_rgba(71,50,22,0.08)]">
          <h3 className="text-base font-black text-text-strong">Masih butuh bantuan?</h3>
          <p className="mx-auto mt-1.5 max-w-md text-sm font-medium text-text-muted">
            Jika jawaban di atas belum menyelesaikan kendala Anda, hubungi Admin Sistem di instansi Anda untuk bantuan lebih lanjut.
          </p>
        </section>
      </div>
    </PageLayout>
  )
}
