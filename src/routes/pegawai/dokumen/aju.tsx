import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import {
  PegawaiFieldCard,
  PegawaiPageHeader,
  PegawaiPanel,
} from '#/components/pegawai/PegawaiPagePrimitives'
import { StepIndicator } from '#/components/dokumen/StepIndicator'
import { StepFungsiTanggal } from '#/components/dokumen/form/StepFungsiTanggal'
import { StepKegiatan } from '#/components/dokumen/form/StepKegiatan'
import { StepJenisPermintaan } from '#/components/dokumen/form/StepJenisPermintaan'
import { StepKategoriPermintaan } from '#/components/dokumen/form/StepKategoriPermintaan'
import { StepDetailPermintaan } from '#/components/dokumen/form/StepDetailPermintaan'
import { StepUploadLampiran } from '#/components/dokumen/form/StepUploadLampiran'
import { StepReview } from '#/components/dokumen/form/StepReview'
import { Button } from '#/components/ui/button'
import { AppDialog } from '#/components/ui/AppDialog'
import { useAppToast } from '#/components/ui/AppToast'
import { DialogClose } from '#/components/ui/dialog'
import type {
  LampiranUrl,
  FungsiRow,
  KegiatanRow,
  JenisRow,
  KategoriRow,
  DetailRow,
  JenisDokumenRow,
} from '#/components/dokumen/form/dokumen-form-types'
import { ApiError, apiMutation } from '#/lib/api-mutation'
import { apiFetch } from '#/lib/api-client'
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  FileText,
  Info,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

export const Route = createFileRoute('/pegawai/dokumen/aju')({
  component: AjukanDokumenPage,
})

type SubmittedDocument = {
  id: string
  judul: string
  status: string
  current_step: string | null
  is_non_material: boolean
}

type SubmitResponse = {
  success: true
  dokumen: SubmittedDocument
}

type GroupedFormSectionProps = {
  number: number
  title: string
  description: string
  complete: boolean
  children: ReactNode
}

const MAJOR_STEP_LABELS = [
  'Informasi Dasar',
  'Kelengkapan',
  'Review & Ajukan',
]

const MAJOR_STEP_SUBTITLES = [
  'Konteks & jenis',
  'Lampiran & detail',
  'Konfirmasi akhir',
]

const MAJOR_STEP_DESCRIPTIONS = [
  'Lengkapi fungsi, kegiatan, tanggal, dan karakteristik dokumen.',
  'Unggah lampiran serta lengkapi nominal atau keterangan detail.',
  'Tinjau ringkasan dan konfirmasi konsekuensi pengajuan.',
]

const SUBMIT_STATUS_LABELS: Record<string, string> = {
  IN_PPK_VALIDATION: 'Menunggu PPK',
  TERSIMPAN: 'Tersimpan',
}

function GroupedFormSection({
  number,
  title,
  description,
  complete,
  children,
}: GroupedFormSectionProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-orange-100 bg-[#FFFDF9] shadow-sm shadow-orange-950/[0.02]">
      <div className="flex items-start gap-3 border-b border-orange-100 bg-[#FFF8F1] p-4 sm:p-5">
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-xs font-black ${
            complete
              ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20'
              : 'bg-orange-100 text-orange-800'
          }`}
        >
          {complete ? <CheckCircle2 size={16} /> : number}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-headline text-sm font-extrabold text-zinc-950">{title}</h2>
            <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${
              complete
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-orange-100 text-orange-700'
            }`}>
              {complete ? 'Lengkap' : 'Perlu dilengkapi'}
            </span>
          </div>
          <p className="mt-1 text-xs font-medium leading-relaxed text-zinc-600">{description}</p>
        </div>
      </div>
      <div className="p-4 sm:p-5 sm:pt-4">{children}</div>
    </section>
  )
}

function AjukanDokumenPage() {
  const navigate = useNavigate()
  const { showToast } = useAppToast()
  const submitInFlightRef = useRef(false)
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [submitConfirmationOpen, setSubmitConfirmationOpen] = useState(false)
  const [submittedDocument, setSubmittedDocument] = useState<SubmittedDocument | null>(null)
  const [submitError, setSubmitError] = useState('')
  const [tanggalError, setTanggalError] = useState('')
  const [nominalError, setNominalError] = useState('')

  const today = (() => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  })()

  // Step 1: Fungsi & Tanggal
  const [fungsiId, setFungsiId] = useState('')
  const [fungsiNama, setFungsiNama] = useState('')
  const [tahun, setTahun] = useState(new Date().getFullYear())
  const [tanggal, setTanggal] = useState(today)

  // Step 2: Kegiatan
  const [kegiatanId, setKegiatanId] = useState('')
  const [kegiatanNama, setKegiatanNama] = useState('')

  // Step 3: Jenis Permintaan (Material) / Jenis Dokumen (Non-Material)
  const [isNonMaterial, setIsNonMaterial] = useState(false)
  const [jenisPermintaanId, setJenisPermintaanId] = useState('')
  const [jenisPermintaanNama, setJenisPermintaanNama] = useState('')
  const [jenisDokumenId, setJenisDokumenId] = useState('')
  const [jenisDokumenNama, setJenisDokumenNama] = useState('')

  // Step 4: Kategori Permintaan (Material only)
  const [kategoriPermintaanId, setKategoriPermintaanId] = useState('')
  const [kategoriPermintaanNama, setKategoriPermintaanNama] = useState('')

  // Step 5: Detail Permintaan (opsional)
  const [detailPermintaanId, setDetailPermintaanId] = useState('')
  const [detailPermintaanNama, setDetailPermintaanNama] = useState('')
  const [kategoriHasDetail, setKategoriHasDetail] = useState(false)

  // Step 6: Peran (auto-detected based on kegiatan)
  const [isKetuaTim, setIsKetuaTim] = useState(false)
  const [isChairmanLoading, setIsChairmanLoading] = useState(false)
  const [chairmanBadgeVisible, setChairmanBadgeVisible] = useState(false)

  // Step 7: Lampiran + Nominal/Keterangan
  const [lampiranUrls, setLampiranUrls] = useState<LampiranUrl[]>([])
  const [missingRequired, setMissingRequired] = useState<any[]>([])
  const [nominalRealisasi, setNominalRealisasi] = useState('')
  const [keteranganDetail, setKeteranganDetail] = useState('')

  // Data lists
  const [fungsiList, setFungsiList] = useState<FungsiRow[]>([])
  const [kegiatanList, setKegiatanList] = useState<KegiatanRow[]>([])
  const [jenisList, setJenisList] = useState<JenisRow[]>([])
  const [jenisDokumenList, setJenisDokumenList] = useState<JenisDokumenRow[]>([])
  const [kategoriList, setKategoriList] = useState<KategoriRow[]>([])
  const [detailList, setDetailList] = useState<DetailRow[]>([])

  const [loadingFungsi, setLoadingFungsi] = useState(true)
  const [loadingKegiatan, setLoadingKegiatan] = useState(false)
  const [loadingJenis, setLoadingJenis] = useState(false)
  const [loadingKategori, setLoadingKategori] = useState(false)

  // Load fungsi on mount
  useEffect(() => {
    async function load() {
      setLoadingFungsi(true)
      try {
        const data = await apiFetch<FungsiRow[]>('/master-fungsi')
        setFungsiList(data)
      } catch (err) {
        console.error('Failed to load fungsi:', err)
        setFungsiList([])
      } finally {
        setLoadingFungsi(false)
      }
    }
    load()
  }, [])

  // Load kegiatan when fungsi changes
  useEffect(() => {
    if (!fungsiId) { setKegiatanList([]); return }
    async function load() {
      setLoadingKegiatan(true)
      try {
        const data = await apiFetch<KegiatanRow[]>('/master-kegiatan', {
          query: { fungsi_id: fungsiId },
        })
        setKegiatanList(data)
      } catch (err) {
        console.error('Failed to load kegiatan:', err)
        setKegiatanList([])
      } finally {
        setLoadingKegiatan(false)
      }
    }
    load()
  }, [fungsiId])

  // Load jenis permintaan when kegiatan is selected
  useEffect(() => {
    if (!kegiatanId) { setJenisList([]); return }
    async function load() {
      setLoadingJenis(true)
      try {
        const data = await apiFetch<JenisRow[]>('/master-jenis')
        setJenisList(data)
      } catch (err) {
        console.error('Failed to load jenis permintaan:', err)
        setJenisList([])
      } finally {
        setLoadingJenis(false)
      }
    }
    load()
  }, [kegiatanId])

  // Load jenis dokumen (for Non-Material)
  useEffect(() => {
    if (!isNonMaterial) { setJenisDokumenList([]); return }
    async function load() {
      try {
        const data = await apiFetch<JenisDokumenRow[]>('/master-jenis-dokumen')
        setJenisDokumenList(data)
      } catch (err) {
        console.error('Failed to load jenis dokumen:', err)
        setJenisDokumenList([])
      }
    }
    load()
  }, [isNonMaterial])

  // Load kategori when jenis changes (Material only)
  useEffect(() => {
    if (!jenisPermintaanId || isNonMaterial) { setKategoriList([]); return }
    async function load() {
      setLoadingKategori(true)
      try {
        const data = await apiFetch<KategoriRow[]>('/master-kategori', {
          query: { jenis_id: jenisPermintaanId },
        })
        setKategoriList(data)
      } catch (err) {
        console.error('Failed to load kategori permintaan:', err)
        setKategoriList([])
      } finally {
        setLoadingKategori(false)
      }
    }
    load()
  }, [jenisPermintaanId, isNonMaterial])

  // Load detail when kategori changes, check if has children
  useEffect(() => {
    if (!kategoriPermintaanId) { setDetailList([]); setKategoriHasDetail(false); return }
    async function load() {
      try {
        const data = await apiFetch<DetailRow[]>('/master-detail', {
          query: { kategori_id: kategoriPermintaanId },
        })
        setDetailList(data)
        setKategoriHasDetail(data.length > 0)
      } catch (err) {
        console.error('Failed to load detail permintaan:', err)
        setDetailList([])
        setKategoriHasDetail(false)
      }
    }
    load()
  }, [kategoriPermintaanId])

  // Clear downstream on upstream change
  function handleFungsiChange(id: string) {
    setFungsiId(id)
    const fn = fungsiList.find(f => f.id === id)
    setFungsiNama(fn?.nama ?? '')
    setKegiatanId(''); setKegiatanNama('')
    setJenisPermintaanId(''); setJenisPermintaanNama('')
    setKategoriPermintaanId(''); setKategoriPermintaanNama('')
    setDetailPermintaanId(''); setDetailPermintaanNama('')
    setKategoriHasDetail(false)
  }

  function handleTanggalChange(newTanggal: string) {
    if (!newTanggal) return
    setTanggal(newTanggal)
    setTahun(new Date(newTanggal).getFullYear())
    if (newTanggal <= today) setTanggalError('')
  }

  function handleKegiatanChange(id: string) {
    setKegiatanId(id)
    const kn = kegiatanList.find(k => k.id === id)
    setKegiatanNama(kn?.nama ?? '')
    setJenisPermintaanId(''); setJenisPermintaanNama('')
    setKategoriPermintaanId(''); setKategoriPermintaanNama('')
    setDetailPermintaanId(''); setDetailPermintaanNama('')
    setKategoriHasDetail(false)
    checkChairmanStatus(id)
  }

  function handleJenisChange(id: string) {
    setJenisPermintaanId(id)
    const jn = jenisList.find(j => j.id === id)
    setJenisPermintaanNama(jn?.nama ?? '')
    setKategoriPermintaanId(''); setKategoriPermintaanNama('')
    setDetailPermintaanId(''); setDetailPermintaanNama('')
    setKategoriHasDetail(false)
  }

  function handleJenisDokumenChange(id: string) {
    setJenisDokumenId(id)
    const jd = jenisDokumenList.find(j => j.id === id)
    setJenisDokumenNama(jd?.nama ?? '')
  }

  function handleKategoriChange(id: string) {
    setKategoriPermintaanId(id)
    const kn = kategoriList.find(k => k.id === id)
    setKategoriPermintaanNama(kn?.nama ?? '')
    setDetailPermintaanId(''); setDetailPermintaanNama('')
  }

  function handleDetailChange(id: string) {
    setDetailPermintaanId(id)
    const dn = detailList.find(d => d.id === id)
    setDetailPermintaanNama(dn?.nama ?? '')
  }

  // Toggle Non-Material - changes flow
  function handleToggleNonMaterial(checked: boolean) {
    setIsNonMaterial(checked)
    // Reset related fields
    setJenisPermintaanId(''); setJenisPermintaanNama('')
    setKategoriPermintaanId(''); setKategoriPermintaanNama('')
    setDetailPermintaanId(''); setDetailPermintaanNama('')
    setKategoriHasDetail(false)
    if (checked) {
      setJenisDokumenId(''); setJenisDokumenNama('')
    } else {
      setJenisDokumenId(''); setJenisDokumenNama('')
    }
  }

  const stepLabels = MAJOR_STEP_LABELS
  const progressPercentage = Math.round((step / stepLabels.length) * 100)
  const completedSteps = stepLabels
    .map((_, index) => index + 1)
    .filter(stepNumber => stepNumber < step)

  const canAdvanceFromStep1 = !!fungsiId && !!tahun && !!tanggal && !tanggalError
  const canAdvanceFromStep2 = !!kegiatanId
  const canAdvanceFromStep3 = isNonMaterial ? !!jenisDokumenId : !!jenisPermintaanId
  const canAdvanceFromStep4 = isNonMaterial ? true : !!kategoriPermintaanId
  const canAdvanceFromStep5 = isNonMaterial ? true : (!kategoriHasDetail || !!detailPermintaanId)

  // Step 6 (Unggah) validation
  const canAdvanceFromStep6 = () => {
    if (missingRequired.length > 0) return false
    if (isNonMaterial) {
      return !!keteranganDetail.trim()
    } else {
      // Material: must have nominal > 0
      const rawNominal = nominalRealisasi.replace(/[^\d]/g, '')
      if (!rawNominal || rawNominal === '0') return false
      const num = parseInt(rawNominal, 10)
      return !isNaN(num) && num > 0
    }
  }

  const canAdvanceFromInformation =
    canAdvanceFromStep1
    && canAdvanceFromStep2
    && canAdvanceFromStep3
    && canAdvanceFromStep4
    && canAdvanceFromStep5

  function handleNextFromInformation() {
    if (tanggal > today) {
      setTanggalError('Tanggal tidak boleh melewati hari ini')
      return
    }

    if (canAdvanceFromInformation) setStep(2)
  }

  function handleNextFromDetails() {
    if (!isNonMaterial) {
      const rawNominal = nominalRealisasi.replace(/[^\d]/g, '')
      if (!rawNominal || rawNominal === '0') {
        setNominalError('Nominal Realisasi wajib diisi dan harus lebih dari 0')
        return
      }
      const num = parseInt(rawNominal, 10)
      if (isNaN(num) || num <= 0) {
        setNominalError('Nominal Realisasi wajib diisi dan harus lebih dari 0')
        return
      }
    }

    if (canAdvanceFromStep6()) setStep(3)
  }

  function handleBack() {
    if (step === 1) return
    if (step === 2) setTanggalError('')
    if (step > 1) setStep(step - 1)
  }

  function handleStepClick(targetStep: number) {
    if (targetStep < step) setStep(targetStep)
  }

  const handleKelengkapanComplete = useCallback(
    (lampirans: LampiranUrl[], missing: any[]) => {
      setLampiranUrls(lampirans)
      setMissingRequired(missing)
    },
    []
  )

  function handleKeteranganDetailChange(value: string) {
    setKeteranganDetail(value)
    setSubmitError('')
  }

  function handleNominalRealisasiChange(value: string) {
    const raw = value.replace(/[^\d]/g, '')
    const num = parseInt(raw, 10)
    setNominalRealisasi(raw ? num.toLocaleString('id-ID') : '')
    setNominalError('')
  }

  async function checkChairmanStatus(kegId: string) {
    setIsChairmanLoading(true)
    setChairmanBadgeVisible(false)

    try {
      const data = await apiFetch<{ is_ketua_tim?: boolean }>(`/users/me/is-ketua-tim/${kegId}`)
      setIsKetuaTim(data.is_ketua_tim === true)
      setChairmanBadgeVisible(true)
    } catch (err) {
      if (err instanceof ApiError) {
        setIsKetuaTim(false)
        setChairmanBadgeVisible(true)
        return
      }

      console.error('Failed to check chairman status:', err)
      setIsKetuaTim(false)
      setChairmanBadgeVisible(true)
    } finally {
      setIsChairmanLoading(false)
    }
  }

  function validateSubmission(): string | null {
    if (!isNonMaterial) {
      const rawNominal = nominalRealisasi.replace(/[^\d]/g, '')
      const nominal = parseInt(rawNominal, 10)
      if (isNaN(nominal) || nominal <= 0) {
        setNominalError('Nominal Realisasi wajib diisi dan harus lebih dari 0 untuk dokumen Material')
        return 'Nominal Realisasi wajib diisi dan harus lebih dari 0 untuk dokumen Material'
      }
    } else if (!keteranganDetail.trim()) {
      return 'Keterangan detail dokumen wajib diisi untuk dokumen Non-Material'
    }

    if (missingRequired.length > 0) {
      return 'Lengkapi seluruh lampiran wajib sebelum mengajukan dokumen'
    }

    if (lampiranUrls.length === 0) {
      return 'Minimal upload satu lampiran sebelum mengajukan dokumen'
    }

    if (!chairmanBadgeVisible && !isChairmanLoading) {
      return 'Peran belum ditentukan. Silakan pilih kegiatan terlebih dahulu.'
    }

    return null
  }

  function handleRequestSubmit() {
    const validationError = validateSubmission()
    if (validationError) {
      setSubmitError(validationError)
      showToast({
        title: 'Dokumen belum dapat diajukan',
        description: 'Periksa kembali data dan kelengkapan dokumen.',
        variant: 'error',
      })
      return
    }

    setSubmitError('')
    setSubmitConfirmationOpen(true)
  }

  async function handleSubmit() {
    if (submitting || submitInFlightRef.current) return

    const validationError = validateSubmission()
    if (validationError) {
      setSubmitConfirmationOpen(false)
      setSubmitError(validationError)
      showToast({
        title: 'Dokumen belum dapat diajukan',
        description: 'Periksa kembali data dan kelengkapan dokumen.',
        variant: 'error',
      })
      return
    }

    setSubmitConfirmationOpen(false)
    submitInFlightRef.current = true
    setSubmitting(true)
    setSubmitError('')

    try {
      const rawNominal = nominalRealisasi.replace(/[^\d]/g, '')
      const nominalValue = isNonMaterial ? null : (parseInt(rawNominal, 10) || null)
      const selectedJenisPermintaanId = jenisPermintaanId || undefined
      const selectedKategoriPermintaanId = kategoriPermintaanId || undefined
      const selectedDetailPermintaanId = detailPermintaanId || undefined

      const response = await apiMutation<SubmitResponse>('/api/dokumen/submit', {
        method: 'POST',
        body: {
          fungsiId,
          kegiatanJenisId: kegiatanId,
          isKetuaTim,
          tahun,
          tanggal,
          lampiranUrls,
          nominal_realisasi: nominalValue,
          is_non_material: isNonMaterial,
          jenisDokumenId: isNonMaterial ? jenisDokumenId : undefined,
          keteranganDetail: isNonMaterial ? keteranganDetail : undefined,
          jenisPermintaanId: !isNonMaterial ? selectedJenisPermintaanId : undefined,
          kategoriPermintaanId: !isNonMaterial ? selectedKategoriPermintaanId : undefined,
          detailPermintaanId: !isNonMaterial ? selectedDetailPermintaanId : undefined,
        },
      })

      setSubmittedDocument(response.dokumen)
      showToast({
        title: isNonMaterial
          ? 'Dokumen Non-Material berhasil tersimpan'
          : 'Dokumen berhasil diajukan',
        description: isNonMaterial
          ? 'Status dokumen: Tersimpan.'
          : 'Dokumen akan mengikuti alur validasi dan persetujuan yang berlaku.',
        variant: 'success',
      })
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        const errorMessage = payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error ?? 'Gagal mengajukan dokumen'
          : 'Gagal mengajukan dokumen'

        setSubmitError(errorMessage)
        showToast({
          title: 'Gagal mengajukan dokumen',
          description: 'Periksa kembali data dan kelengkapan, lalu coba lagi.',
          variant: 'error',
        })
        return
      }

      setSubmitError('Terjadi kesalahan. Coba lagi.')
      showToast({
        title: 'Gagal mengajukan dokumen',
        description: 'Terjadi kesalahan. Coba lagi.',
        variant: 'error',
      })
    } finally {
      submitInFlightRef.current = false
      setSubmitting(false)
    }
  }

  function handleSubmitAnother() {
    setStep(1)
    submitInFlightRef.current = false
    setSubmitting(false)
    setSubmitConfirmationOpen(false)
    setSubmittedDocument(null)
    setSubmitError('')
    setTanggalError('')
    setNominalError('')
    setFungsiId('')
    setFungsiNama('')
    setTahun(new Date().getFullYear())
    setTanggal(today)
    setKegiatanId('')
    setKegiatanNama('')
    setIsNonMaterial(false)
    setJenisPermintaanId('')
    setJenisPermintaanNama('')
    setJenisDokumenId('')
    setJenisDokumenNama('')
    setKategoriPermintaanId('')
    setKategoriPermintaanNama('')
    setDetailPermintaanId('')
    setDetailPermintaanNama('')
    setKategoriHasDetail(false)
    setIsKetuaTim(false)
    setIsChairmanLoading(false)
    setChairmanBadgeVisible(false)
    setLampiranUrls([])
    setMissingRequired([])
    setNominalRealisasi('')
    setKeteranganDetail('')
  }

  if (submittedDocument) {
    const statusLabel =
      SUBMIT_STATUS_LABELS[submittedDocument.status] ?? 'Berhasil diproses'
    const nextStepLabel = submittedDocument.is_non_material
      ? 'Tidak ada alur persetujuan lanjutan'
      : submittedDocument.current_step === 'PPK'
        ? 'Validasi PPK'
        : submittedDocument.current_step === 'BENDAHARA'
          ? 'Persetujuan PPSPM'
          : 'Pantau pada detail dokumen'

    return (
      <PageLayout>
        <div className="mx-auto max-w-5xl space-y-6">
          <PegawaiPageHeader
            eyebrow={
              <>
                <CheckCircle2 size={12} />
                <span>Ajukan Dokumen</span>
                <span>/</span>
                <span>Berhasil</span>
              </>
            }
            title={submittedDocument.is_non_material ? 'Dokumen Berhasil Tersimpan' : 'Pengajuan Berhasil'}
            description={
              submittedDocument.is_non_material
                ? 'Dokumen Non-Material telah disimpan sebagai Tersimpan tanpa nominal realisasi.'
                : 'Dokumen Material telah diajukan dan akan mengikuti alur validasi serta persetujuan yang berlaku.'
            }
          />

          <PegawaiPanel className="overflow-hidden border-emerald-100 p-0 shadow-lg shadow-emerald-950/5">
            <div className="border-b border-emerald-100 bg-[linear-gradient(145deg,#ECFDF5_0%,#FFF9F3_55%,#FFFDF9_100%)] px-5 py-8 sm:px-8 sm:py-10">
              <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
                <div className="relative">
                  <div className="absolute inset-0 scale-150 rounded-full bg-emerald-200/40 blur-xl" />
                  <div className="relative flex size-20 items-center justify-center rounded-3xl border-4 border-white bg-emerald-500 text-white shadow-xl shadow-emerald-500/25">
                    <CheckCircle2 size={38} />
                  </div>
                </div>
                <span className="mt-5 rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                  Pengajuan selesai
                </span>
                <h2 className="mt-3 font-headline text-2xl font-extrabold tracking-tight text-emerald-950 sm:text-3xl">
                  {submittedDocument.is_non_material ? 'Dokumen Berhasil Tersimpan' : 'Pengajuan Berhasil'}
                </h2>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-emerald-800">
                  Pengajuan telah diterima sistem. Ringkasan hasil dan tindakan berikutnya tersedia di bawah.
                </p>
              </div>
            </div>

            <div className="grid min-w-0 gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:p-8">
              <div className="min-w-0 space-y-4">
                <div className="rounded-2xl border border-orange-100 bg-[#FFF9F3] p-4 sm:p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-700">
                    Dokumen diproses
                  </p>
                  <h3 className="mt-2 break-words font-headline text-lg font-extrabold leading-tight text-zinc-950 sm:text-xl">
                    {submittedDocument.judul || 'Dokumen baru'}
                  </h3>
                  <p className="mt-2 text-xs font-medium leading-relaxed text-zinc-600">
                    {submittedDocument.is_non_material
                      ? 'Dokumen Non-Material telah disimpan sebagai Tersimpan tanpa nominal realisasi.'
                      : 'Dokumen Material telah diajukan dan akan mengikuti alur validasi serta persetujuan yang berlaku.'}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <PegawaiFieldCard
                    label="Jenis Dokumen"
                    value={submittedDocument.is_non_material ? 'Non-Material' : 'Material'}
                    className="bg-white"
                  />
                  <PegawaiFieldCard label="Status Hasil" value={statusLabel} className="bg-white" />
                  <PegawaiFieldCard label="Tahap Berikutnya" value={nextStepLabel} className="bg-white" />
                </div>
              </div>

              <aside className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white">
                    <FileCheck2 size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-emerald-950">Semua tahap selesai</p>
                    <p className="text-[10px] font-medium text-emerald-700">3 dari 3 bagian pengajuan</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {MAJOR_STEP_LABELS.map(label => (
                    <div key={label} className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2">
                      <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
                      <span className="text-[10px] font-bold text-emerald-950">{label}</span>
                    </div>
                  ))}
                </div>
              </aside>
            </div>

            <div className="border-t border-orange-100 bg-[#FFF9F3] p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <Button
                  type="button"
                  size="lg"
                  onClick={() => navigate({ to: '/pegawai/dokumen' })}
                  className="w-full gap-1.5 bg-orange-600 text-white shadow-md shadow-orange-600/20 hover:bg-orange-700 sm:w-auto"
                >
                  Lihat Daftar Dokumen <ArrowRight size={14} />
                </Button>
                {submittedDocument.id && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => navigate({
                      to: '/pegawai/dokumen/$id',
                      params: { id: submittedDocument.id },
                    })}
                    className="w-full border-orange-200 bg-white sm:w-auto"
                  >
                    Lihat Detail Dokumen
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={handleSubmitAnother}
                  className="w-full border-orange-200 bg-white sm:w-auto"
                >
                  Ajukan Dokumen Lain
                </Button>
              </div>
            </div>
          </PegawaiPanel>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <PegawaiPageHeader
          eyebrow={
            <>
              <FileText size={12} />
              <Link to="/pegawai/dokumen" className="hover:text-orange-900">Dokumen</Link>
              <span>/</span>
              <span>Ajukan Dokumen</span>
            </>
          }
          title="Ajukan Dokumen Baru"
          description="Lengkapi tiga bagian pengajuan. Dokumen Material mengikuti alur validasi dan persetujuan yang berlaku, sedangkan Non-Material disimpan sebagai Tersimpan tanpa nominal realisasi."
        />

        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
          <PegawaiPanel className="min-w-0 overflow-hidden p-0 shadow-lg shadow-orange-950/5">
            <div className="bg-gradient-to-r from-orange-700 via-orange-600 to-orange-500 p-4 text-white sm:p-5">
              <div className="flex items-start gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 shadow-inner ring-1 ring-white/20">
                  {step === 1 ? (
                    <Info size={20} />
                  ) : step === 2 ? (
                    <FileCheck2 size={20} />
                  ) : (
                    <ClipboardList size={20} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">
                      Bagian {step} dari {stepLabels.length}
                    </p>
                    <span className="rounded-full bg-white/15 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white ring-1 ring-white/20">
                      {progressPercentage}% selesai
                    </span>
                  </div>
                  <h2 className="mt-1 font-headline text-lg font-extrabold tracking-tight sm:text-xl">
                    {stepLabels[step - 1]}
                  </h2>
                  <p className="mt-1 max-w-2xl text-[10px] font-semibold leading-relaxed text-white/75 sm:text-xs">
                    {MAJOR_STEP_DESCRIPTIONS[step - 1]}
                  </p>
                </div>
              </div>
            </div>

            <div className="border-b border-orange-100 bg-[#FFF9F3] p-4 sm:p-5">
              <StepIndicator
                currentStep={step}
                completedSteps={completedSteps}
                onStepClick={handleStepClick}
                labels={stepLabels}
                subtitles={MAJOR_STEP_SUBTITLES}
              />
            </div>

            <div className="min-w-0 p-4 sm:p-6">

          {step === 1 && (
            <div className="space-y-4">
              <GroupedFormSection
                number={1}
                title="Informasi Dasar"
                description="Pilih fungsi dan tanggal dokumen."
                complete={canAdvanceFromStep1}
              >
                <StepFungsiTanggal
                  grouped
                  fungsiId={fungsiId}
                  fungsiList={fungsiList}
                  loadingFungsi={loadingFungsi}
                  tanggal={tanggal}
                  tanggalError={tanggalError}
                  tahun={tahun}
                  canAdvanceFromStep1={canAdvanceFromStep1}
                  onFungsiChange={handleFungsiChange}
                  onTanggalChange={handleTanggalChange}
                  onNext={handleNextFromInformation}
                />
              </GroupedFormSection>

              {fungsiId && (
                <GroupedFormSection
                  number={2}
                  title="Detail Kegiatan"
                  description="Pilih kegiatan yang menjadi konteks pengajuan."
                  complete={canAdvanceFromStep2}
                >
                  <StepKegiatan
                    grouped
                    fungsiId={fungsiId}
                    kegiatanId={kegiatanId}
                    kegiatanList={kegiatanList}
                    loadingKegiatan={loadingKegiatan}
                    canAdvanceFromStep2={canAdvanceFromStep2}
                    onKegiatanChange={handleKegiatanChange}
                    onBack={handleBack}
                    onNext={handleNextFromInformation}
                  />
                </GroupedFormSection>
              )}

              {kegiatanId && (
                <GroupedFormSection
                  number={3}
                  title="Jenis Dokumen"
                  description="Tentukan apakah dokumen Material atau Non-Material dan pilih jenisnya."
                  complete={canAdvanceFromStep3}
                >
                  <StepJenisPermintaan
                    grouped
                    kegiatanId={kegiatanId}
                    isNonMaterial={isNonMaterial}
                    jenisPermintaanId={jenisPermintaanId}
                    jenisList={jenisList}
                    loadingJenis={loadingJenis}
                    jenisDokumenId={jenisDokumenId}
                    jenisDokumenList={jenisDokumenList}
                    canAdvanceFromStep3={canAdvanceFromStep3}
                    onToggleNonMaterial={handleToggleNonMaterial}
                    onJenisChange={handleJenisChange}
                    onJenisDokumenChange={handleJenisDokumenChange}
                    onBack={handleBack}
                    onNext={handleNextFromInformation}
                  />
                </GroupedFormSection>
              )}

              {!isNonMaterial && jenisPermintaanId && (
                <GroupedFormSection
                  number={4}
                  title="Kategori Permintaan"
                  description="Pilih kategori yang sesuai dengan jenis permintaan."
                  complete={canAdvanceFromStep4}
                >
                  <StepKategoriPermintaan
                    grouped
                    jenisPermintaanId={jenisPermintaanId}
                    jenisPermintaanNama={jenisPermintaanNama}
                    kategoriPermintaanId={kategoriPermintaanId}
                    kategoriList={kategoriList}
                    loadingKategori={loadingKategori}
                    canAdvanceFromStep4={canAdvanceFromStep4}
                    onKategoriChange={handleKategoriChange}
                    onBack={handleBack}
                    onNext={handleNextFromInformation}
                  />
                </GroupedFormSection>
              )}

              {!isNonMaterial && kategoriPermintaanId && kategoriHasDetail && (
                <GroupedFormSection
                  number={5}
                  title="Detail Permintaan"
                  description="Pilih detail wajib untuk kategori ini."
                  complete={canAdvanceFromStep5}
                >
                  <StepDetailPermintaan
                    grouped
                    kategoriPermintaanId={kategoriPermintaanId}
                    kategoriPermintaanNama={kategoriPermintaanNama}
                    detailPermintaanId={detailPermintaanId}
                    detailList={detailList}
                    canAdvanceFromStep5={canAdvanceFromStep5}
                    onDetailChange={handleDetailChange}
                    onBack={handleBack}
                    onNext={handleNextFromInformation}
                  />
                </GroupedFormSection>
              )}

              <div className="sticky bottom-3 z-10 rounded-2xl border border-orange-100 bg-white/95 p-3 shadow-xl shadow-orange-950/5 backdrop-blur sm:flex sm:justify-end">
                <Button
                  type="button"
                  size="lg"
                  onClick={handleNextFromInformation}
                  disabled={!canAdvanceFromInformation}
                  className="w-full gap-1.5 bg-orange-600 px-5 text-white shadow-md shadow-orange-600/20 hover:bg-orange-700 sm:w-auto"
                >
                  Lanjut ke Kelengkapan <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <StepUploadLampiran
                grouped
                isNonMaterial={isNonMaterial}
                kategoriHasDetail={kategoriHasDetail}
                kegiatanId={kegiatanId}
                kegiatanNama={kegiatanNama}
                jenisDokumenNama={jenisDokumenNama}
                jenisPermintaanId={jenisPermintaanId}
                jenisPermintaanNama={jenisPermintaanNama}
                kategoriPermintaanId={kategoriPermintaanId}
                kategoriPermintaanNama={kategoriPermintaanNama}
                detailPermintaanId={detailPermintaanId}
                detailPermintaanNama={detailPermintaanNama}
                isKetuaTim={isKetuaTim}
                isChairmanLoading={isChairmanLoading}
                chairmanBadgeVisible={chairmanBadgeVisible}
                keteranganDetail={keteranganDetail}
                nominalRealisasi={nominalRealisasi}
                nominalError={nominalError}
                canAdvanceFromStep6={canAdvanceFromStep6}
                onKelengkapanComplete={handleKelengkapanComplete}
                onKeteranganDetailChange={handleKeteranganDetailChange}
                onNominalRealisasiChange={handleNominalRealisasiChange}
                onBack={handleBack}
                onNext={handleNextFromDetails}
              />

              <div className="sticky bottom-3 z-10 flex flex-col-reverse gap-2 rounded-2xl border border-orange-100 bg-white/95 p-3 shadow-xl shadow-orange-950/5 backdrop-blur sm:flex-row sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={handleBack}
                  className="w-full gap-1.5 border-orange-200 bg-white sm:w-auto"
                >
                  <ChevronLeft size={14} /> Kembali
                </Button>
                <Button
                  type="button"
                  size="lg"
                  onClick={handleNextFromDetails}
                  disabled={!canAdvanceFromStep6()}
                  className="w-full gap-1.5 bg-orange-600 px-5 text-white shadow-md shadow-orange-600/20 hover:bg-orange-700 sm:w-auto"
                >
                  Review Pengajuan <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <StepReview
              stepCount={3}
              fungsiNama={fungsiNama}
              kegiatanNama={kegiatanNama}
              tahun={tahun}
              tanggal={tanggal}
              isKetuaTim={isKetuaTim}
              lampiranUrls={lampiranUrls}
              nominalRealisasi={isNonMaterial ? null : nominalRealisasi || null}
              isNonMaterial={isNonMaterial}
              jenisPermintaanNama={isNonMaterial ? jenisDokumenNama : jenisPermintaanNama}
              kategoriPermintaanNama={isNonMaterial ? undefined : kategoriPermintaanNama}
              detailPermintaanNama={isNonMaterial ? undefined : detailPermintaanNama}
              keteranganDetail={isNonMaterial ? keteranganDetail : undefined}
              submitError={submitError}
              submitting={submitting}
              submitDisabled={submitting || missingRequired.length > 0 || lampiranUrls.length === 0}
              onBack={handleBack}
              onSubmit={handleRequestSubmit}
            />
          )}
            </div>
        </PegawaiPanel>

          <aside className="min-w-0 space-y-4 lg:sticky lg:top-6">
            <PegawaiPanel className="hidden p-5 lg:block">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                Progress Pengajuan
              </p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <span className="font-headline text-4xl font-extrabold tracking-tight text-zinc-950">
                  {progressPercentage}%
                </span>
                <span className="mb-1 text-[10px] font-bold text-zinc-500">
                  {step} dari {stepLabels.length} bagian
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-orange-100">
                <div
                  className="h-full rounded-full bg-orange-500 transition-[width]"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>

              <div className="mt-5 space-y-3">
                {stepLabels.map((label, index) => {
                  const stepNumber = index + 1
                  const isActive = stepNumber === step
                  const isComplete = stepNumber < step

                  return (
                    <button
                      key={label}
                      type="button"
                      disabled={!isComplete && !isActive}
                      onClick={() => handleStepClick(stepNumber)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                        isActive
                          ? 'border-orange-200 bg-orange-50'
                          : isComplete
                            ? 'border-emerald-100 bg-emerald-50/70'
                            : 'border-orange-100 bg-[#FFFDF9]'
                      }`}
                    >
                      <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-black ${
                        isActive
                          ? 'bg-orange-600 text-white'
                          : isComplete
                            ? 'bg-emerald-500 text-white'
                            : 'bg-orange-100 text-zinc-400'
                      }`}>
                        {isComplete ? <CheckCircle2 size={13} /> : stepNumber}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[10px] font-black text-zinc-950">{label}</span>
                        <span className="mt-0.5 block text-[9px] font-medium text-zinc-500">
                          {MAJOR_STEP_SUBTITLES[index]}
                        </span>
                      </span>
                      {isActive && <span className="size-2 shrink-0 rounded-full bg-orange-500" />}
                    </button>
                  )
                })}
              </div>
            </PegawaiPanel>

            <PegawaiPanel className="border-orange-200 bg-[#FFF8F1] p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <p className="text-sm font-black text-zinc-950">Sebelum melanjutkan</p>
                  <p className="mt-1 text-xs font-medium leading-relaxed text-zinc-700">
                    Pastikan data sesuai dokumen dan unggah hanya lampiran yang diperlukan.
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-xl border border-orange-100 bg-white/80 p-3">
                <div className="flex items-start gap-2">
                  <Sparkles size={14} className="mt-0.5 shrink-0 text-orange-600" />
                  <p className="text-[10px] font-semibold leading-relaxed text-zinc-600">
                    Tahap review menampilkan ringkasan akhir sebelum konfirmasi diproses.
                  </p>
                </div>
              </div>
            </PegawaiPanel>
          </aside>
        </div>
      </div>

      <AppDialog
        open={submitConfirmationOpen}
        onOpenChange={(open) => {
          if (!submitting) setSubmitConfirmationOpen(open)
        }}
        title={
          <span className="flex items-center gap-3 pr-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
              <Send size={20} />
            </span>
            <span className="font-headline text-xl font-extrabold tracking-tight text-zinc-950">
              Ajukan dokumen ini?
            </span>
          </span>
        }
        description={
          isNonMaterial
            ? 'Pastikan jenis dokumen, kegiatan, keterangan detail, dan kelengkapan sudah benar. Dokumen Non-Material akan disimpan sebagai Tersimpan.'
            : 'Pastikan jenis permintaan, kegiatan, nominal realisasi, dan kelengkapan sudah benar. Dokumen Material akan mengikuti alur validasi dan persetujuan yang berlaku.'
        }
        descriptionClassName="text-sm font-medium leading-relaxed text-zinc-600"
        contentClassName="border-orange-100 bg-[#FFFDF9] shadow-2xl shadow-orange-950/10 sm:rounded-3xl sm:p-6"
        showCloseButton={!submitting}
        size="md"
        footer={
          <>
            <DialogClose render={<Button variant="outline" size="lg" disabled={submitting} className="border-orange-200 bg-white" />}>
              Periksa Kembali
            </DialogClose>
            <Button
              type="button"
              size="lg"
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-orange-600 text-white shadow-md shadow-orange-600/20 hover:bg-orange-700"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  {isNonMaterial ? 'Simpan Dokumen' : 'Ajukan Dokumen'}
                  <Send size={14} />
                </>
              )}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-orange-100 bg-white p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">
                Karakteristik
              </p>
              <p className="mt-1 text-sm font-extrabold text-zinc-950">
                Dokumen {isNonMaterial ? 'Non-Material' : 'Material'}
              </p>
            </div>
            <div className="rounded-2xl border border-orange-100 bg-white p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">
                Lampiran
              </p>
              <p className="mt-1 text-sm font-extrabold text-zinc-950">
                {lampiranUrls.length} file siap diproses
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4">
            <Info size={17} className="mt-0.5 shrink-0 text-orange-700" />
            <div>
              <p className="text-xs font-black text-orange-950">Konsekuensi pengajuan</p>
              <p className="mt-1 text-xs font-medium leading-relaxed text-orange-900">
                {isNonMaterial
                  ? 'Dokumen akan disimpan sebagai Tersimpan tanpa nominal realisasi.'
                  : 'Dokumen akan masuk ke alur validasi dan persetujuan yang berlaku.'}
              </p>
            </div>
          </div>
        </div>
      </AppDialog>
    </PageLayout>
  )
}
