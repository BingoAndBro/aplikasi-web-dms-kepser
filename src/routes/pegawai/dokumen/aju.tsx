import { createFileRoute, Link, useBlocker, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState, useCallback } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import {
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

const MAJOR_STEP_LABELS = [
  'Informasi Dasar',
  'Unggah Dokumen',
  'Tinjauan',
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
  const [attachmentDirty, setAttachmentDirty] = useState(false)

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

  const hasFormDirty = Boolean(
    fungsiId
    || kegiatanId
    || isNonMaterial
    || jenisPermintaanId
    || jenisDokumenId
    || kategoriPermintaanId
    || detailPermintaanId
    || nominalRealisasi
    || keteranganDetail.trim()
    || lampiranUrls.length > 0
    || tanggal !== today
    || tahun !== new Date().getFullYear()
  )
  const isDirty = !submittedDocument && !submitting && (hasFormDirty || attachmentDirty)
  const shouldBlockLeave = useCallback(
    ({ current, next }: { current: { pathname: string }; next: { pathname: string } }) => {
      return isDirty && current.pathname !== next.pathname
    },
    [isDirty],
  )
  const leaveBlocker = useBlocker({
    shouldBlockFn: shouldBlockLeave,
    enableBeforeUnload: false,
    disabled: !isDirty,
    withResolver: true,
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !isDirty) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = 'Perubahan yang belum disimpan akan hilang.'
      return 'Perubahan yang belum disimpan akan hilang.'
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

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
      setAttachmentDirty(false)
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
    setAttachmentDirty(false)
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
      <PageLayout className="min-h-full bg-[#FFF9F4] px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex min-h-[calc(100vh-9rem)] items-center justify-center">
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
            <div className="flex size-20 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={38} strokeWidth={2.4} />
            </div>

            <h1 className="mt-8 font-headline text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-3xl">
              {submittedDocument.is_non_material ? 'Dokumen Berhasil Tersimpan' : 'Pengajuan Berhasil'}
            </h1>

            <p className="mt-4 max-w-2xl text-sm font-medium leading-relaxed text-zinc-700 sm:text-base">
              Dokumen <span className="font-extrabold text-zinc-950">{submittedDocument.judul || 'baru'}</span>
              {' '}telah diterima sistem.
            </p>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold text-zinc-600">
              <span className="rounded-full bg-[#FFFDF9] px-3 py-1.5 shadow-sm ring-1 ring-[#F0E1D5]">
                {submittedDocument.is_non_material ? 'Non-Material' : 'Material'}
              </span>
              <span className="rounded-full bg-[#FFFDF9] px-3 py-1.5 shadow-sm ring-1 ring-[#F0E1D5]">
                {statusLabel}
              </span>
              <span className="rounded-full bg-[#FFFDF9] px-3 py-1.5 shadow-sm ring-1 ring-[#F0E1D5]">
                {lampiranUrls.length} file lampiran
              </span>
            </div>

            <p className="mt-4 max-w-xl text-xs font-medium leading-relaxed text-zinc-500 sm:text-sm">
              {nextStepLabel === 'Tidak ada alur persetujuan lanjutan'
                ? 'Dokumen Non-Material tersimpan dan dapat dipantau dari daftar dokumen.'
                : `Tahap berikutnya: ${nextStepLabel}. Pantau status terbaru dari daftar atau detail dokumen.`}
            </p>

            <div className="mt-10 flex w-full flex-col items-stretch justify-center gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  size="lg"
                  onClick={() => navigate({ to: '/pegawai/dokumen' })}
                  className="w-full gap-1.5 bg-[#F97316] text-white hover:bg-[#EA580C] sm:w-auto"
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
                    className="w-full border-[#F0E1D5] bg-white sm:w-auto"
                  >
                    Lihat Detail Dokumen
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={handleSubmitAnother}
                  className="w-full border-[#F0E1D5] bg-white sm:w-auto"
                >
                  Ajukan Dokumen Lain
                </Button>
              </div>
          </div>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout className="min-h-full bg-[#FFF9F4] px-4 py-4 sm:px-6 lg:px-7 lg:py-5">
      <div className="mx-auto max-w-[92rem] space-y-4">
        <div className="flex items-center gap-3">
          <Link
            to="/pegawai"
            aria-label="Kembali ke dashboard pegawai"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-800"
          >
            <ChevronLeft size={18} />
          </Link>
          <div className="min-w-0">
            <h1 className="font-headline text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">
              Ajukan Dokumen Baru
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <FileText size={13} className="text-zinc-500" />
              <span className="font-medium text-zinc-800">Sistem Manajemen</span>
              <ChevronRight size={12} className="text-zinc-300" />
              <span>Pengajuan Dokumen</span>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 px-1 py-1 sm:px-2">
            <StepIndicator
              currentStep={step}
              completedSteps={completedSteps}
              onStepClick={handleStepClick}
              labels={stepLabels}
              subtitles={MAJOR_STEP_SUBTITLES}
            />
          </div>
        </div>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
          <PegawaiPanel className="min-w-0 overflow-visible border-0 bg-transparent p-0 shadow-none">
            <div className="rounded-t-[1.5rem] bg-gradient-to-r from-[#F97316] to-[#FB923C] px-4 py-4 text-white sm:px-5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white">
                  {step === 1 ? (
                    <Info size={17} />
                  ) : step === 2 ? (
                    <FileCheck2 size={17} />
                  ) : (
                    <ClipboardList size={17} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-headline text-base font-bold tracking-tight text-white sm:text-lg">
                    {stepLabels[step - 1]}
                  </h2>
                  <p className="mt-0.5 max-w-2xl text-[10px] font-medium leading-relaxed text-white/90 sm:text-xs">
                    {MAJOR_STEP_DESCRIPTIONS[step - 1]}
                  </p>
                </div>
              </div>
            </div>

            <div className="min-w-0 rounded-b-[1.5rem] border border-t-0 border-[#F1E5DA] bg-[#FFFDF9] p-4 sm:p-5">

          {step === 1 && (
            <div className="space-y-4">
              <StepFungsiTanggal
                grouped
                showTanggal={false}
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

              {fungsiId && (
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
              )}

              {kegiatanId && (
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
              )}

              {!isNonMaterial && jenisPermintaanId && (
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
              )}

              {!isNonMaterial && kategoriPermintaanId && kategoriHasDetail && (
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
              )}

              {kegiatanId && (
                <StepFungsiTanggal
                  grouped
                  showFungsi={false}
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
              )}

              <div className="flex border-t border-[#F0E1D5] pt-4 sm:justify-end">
                <Button
                  type="button"
                  size="lg"
                  onClick={handleNextFromInformation}
                  disabled={!canAdvanceFromInformation}
                  className="w-full gap-1.5 bg-[#F97316] px-5 text-white hover:bg-[#EA580C] sm:w-auto"
                >
                  Lanjut ke Kelengkapan <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <StepUploadLampiran
                grouped
                isNonMaterial={isNonMaterial}
                kategoriHasDetail={kategoriHasDetail}
                kegiatanId={kegiatanId}
                fungsiNama={fungsiNama}
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
                lampiranUrls={lampiranUrls}
                keteranganDetail={keteranganDetail}
                nominalRealisasi={nominalRealisasi}
                nominalError={nominalError}
                canAdvanceFromStep6={canAdvanceFromStep6}
                onKelengkapanComplete={handleKelengkapanComplete}
                onAttachmentDirtyChange={setAttachmentDirty}
                onKeteranganDetailChange={handleKeteranganDetailChange}
                onNominalRealisasiChange={handleNominalRealisasiChange}
                onBack={handleBack}
                onNext={handleNextFromDetails}
              />

              <div className="sticky bottom-0 z-10 -mx-4 flex flex-col-reverse gap-2 border-t border-[#F0E1D5] bg-[#FFFDF9]/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:flex-row sm:justify-between sm:bg-transparent sm:px-0 sm:pb-0">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={handleBack}
                  className="w-full gap-1.5 border-[#F0E1D5] bg-white sm:w-auto"
                >
                  <ChevronLeft size={14} /> Kembali
                </Button>
                <Button
                  type="button"
                  size="lg"
                  onClick={handleNextFromDetails}
                  disabled={!canAdvanceFromStep6()}
                  className="w-full gap-1.5 bg-[#F97316] px-5 text-white hover:bg-[#EA580C] sm:w-auto"
                >
                  Lanjut <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <StepReview
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

          <aside className="min-w-0 space-y-4 xl:sticky xl:top-6">
            <PegawaiPanel className="hidden border-[#F1E5DA] bg-[#FFFDF9] p-5 shadow-none xl:block">
              <p className="text-xs font-semibold text-zinc-600">
                Progress Pengajuan
              </p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <span className="font-headline text-3xl font-bold tracking-tight text-zinc-950">
                  {progressPercentage}%
                </span>
                <span className="mb-1 text-[10px] font-bold text-zinc-500">
                  {step} dari {stepLabels.length} bagian
                </span>
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-[#F97316] transition-[width]"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>

              <div className="mt-4 space-y-1.5">
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
                      className="flex w-full items-center gap-3 px-0 py-2 text-left transition"
                    >
                      <span className={`flex size-6 shrink-0 items-center justify-center text-[10px] font-bold ${
                        isActive
                          ? 'rounded-md bg-[#F97316] text-white'
                          : isComplete
                            ? 'text-emerald-600'
                            : 'rounded-md bg-zinc-100 text-zinc-400'
                      }`}>
                        {isComplete ? <CheckCircle2 size={17} strokeWidth={2.25} /> : stepNumber}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-semibold text-zinc-950">{label}</span>
                      </span>
                      {isComplete && (
                        <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-600">Selesai</span>
                      )}
                      {isActive && (
                        <span className="text-[9px] font-bold uppercase tracking-wide text-[#D97706]">Aktif</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </PegawaiPanel>

            <PegawaiPanel className="border-[#FDBA8C] bg-[#FFF1E7] p-5 shadow-none">
              <div className="flex items-start gap-3">
                <div className="flex size-7 shrink-0 items-center justify-center text-[#FF5A00]">
                  <Info size={17} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#FF5A00]">
                    Periksa Sebelum Mengajukan
                  </p>
                  <p className="mt-2 text-xs font-medium leading-relaxed text-zinc-700">
                    Baca kembali seluruh isian dan pastikan data serta lampiran sudah benar sebelum mengajukan dokumen.
                  </p>
                </div>
              </div>
            </PegawaiPanel>
          </aside>
        </div>
      </div>

      <AppDialog
        open={leaveBlocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open && leaveBlocker.status === 'blocked') leaveBlocker.reset()
        }}
        title={
          <span className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#FFF3D6] text-[#D97706]">
              <Info size={22} />
            </span>
            <span className="font-headline text-lg font-bold tracking-tight text-zinc-950">
              Keluar tanpa menyimpan?
            </span>
          </span>
        }
        description="Perubahan yang belum disimpan akan hilang."
        descriptionClassName="text-sm font-medium leading-relaxed text-zinc-600"
        contentClassName="border-[#F0E1D5] bg-[#FFFAF6] shadow-2xl shadow-zinc-950/10 sm:rounded-3xl sm:p-6"
        showCloseButton
        size="sm"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => leaveBlocker.status === 'blocked' && leaveBlocker.reset()}
              className="border-[#F0E1D5] bg-[#FFFAF6]"
            >
              Tetap di halaman
            </Button>
            <Button
              type="button"
              onClick={() => leaveBlocker.status === 'blocked' && leaveBlocker.proceed()}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Keluar tanpa menyimpan
            </Button>
          </>
        }
      >
        <div />
      </AppDialog>

      <AppDialog
        open={submitConfirmationOpen}
        onOpenChange={(open) => {
          if (!submitting) setSubmitConfirmationOpen(open)
        }}
        title={
          <span className="flex items-center gap-3 pr-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF3D6] text-[#D97706]">
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
        contentClassName="border-[#F0E1D5] bg-[#FFFAF6] shadow-lg shadow-zinc-950/5 sm:rounded-2xl sm:p-6"
        showCloseButton={!submitting}
        size="md"
        footer={
          <>
            <DialogClose render={<Button variant="outline" size="lg" disabled={submitting} className="border-[#F0E1D5] bg-white" />}>
              Periksa Kembali
            </DialogClose>
            <Button
              type="button"
              size="lg"
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-[#F97316] text-white hover:bg-[#EA580C]"
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
            <div className="rounded-xl border border-[#F0E1D5] bg-[#FFFDF9] p-4">
              <p className="text-[10px] font-semibold text-zinc-500">
                Karakteristik
              </p>
              <p className="mt-1 text-sm font-extrabold text-zinc-950">
                Dokumen {isNonMaterial ? 'Non-Material' : 'Material'}
              </p>
            </div>
            <div className="rounded-xl border border-[#F0E1D5] bg-[#FFFDF9] p-4">
              <p className="text-[10px] font-semibold text-zinc-500">
                Lampiran
              </p>
              <p className="mt-1 text-sm font-extrabold text-zinc-950">
                {lampiranUrls.length} file siap diproses
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl bg-[#FFF3D6] p-4">
            <Info size={17} className="mt-0.5 shrink-0 text-[#D97706]" />
            <div>
              <p className="text-xs font-bold text-zinc-950">Konsekuensi pengajuan</p>
              <p className="mt-1 text-xs font-medium leading-relaxed text-zinc-700">
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
