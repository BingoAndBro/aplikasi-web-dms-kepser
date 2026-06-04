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
import { ConfirmDialog } from '#/components/ui/ConfirmDialog'
import { useAppToast } from '#/components/ui/AppToast'
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
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  ShieldCheck,
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
    <section className="overflow-hidden rounded-2xl border border-orange-100 bg-[#FFFDF9]">
      <div className="flex items-start gap-3 border-b border-orange-100 bg-[#FFF8F1] p-4">
        <div
          className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
            complete
              ? 'bg-emerald-500 text-white'
              : 'bg-orange-100 text-orange-800'
          }`}
        >
          {complete ? <CheckCircle2 size={16} /> : number}
        </div>
        <div>
          <h2 className="font-headline text-sm font-bold text-zinc-950">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-600">{description}</p>
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
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
        <div className="mx-auto max-w-4xl space-y-6">
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

          <PegawaiPanel className="overflow-hidden p-0">
            <div className="flex flex-col items-center border-b border-emerald-100 bg-emerald-50 px-5 py-8 text-center sm:px-8">
              <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
                <CheckCircle2 size={32} />
              </div>
              <h2 className="mt-5 font-headline text-xl font-extrabold text-emerald-950 sm:text-2xl">
                {submittedDocument.judul || 'Dokumen baru'}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-emerald-800">
                Pengajuan telah diterima sistem. Gunakan tindakan di bawah untuk melihat hasil atau mengajukan dokumen lain.
              </p>
            </div>

            <div className="space-y-5 p-5 sm:p-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <PegawaiFieldCard
                  label="Jenis Dokumen"
                  value={submittedDocument.is_non_material ? 'Non-Material' : 'Material'}
                />
                <PegawaiFieldCard label="Status Hasil" value={statusLabel} />
                <PegawaiFieldCard label="Tahap Berikutnya" value={nextStepLabel} />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  onClick={() => navigate({ to: '/pegawai/dokumen' })}
                  className="w-full sm:w-auto"
                >
                  Lihat Daftar Dokumen
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSubmitAnother}
                  className="w-full sm:w-auto"
                >
                  Ajukan Dokumen Lain
                </Button>
                {submittedDocument.id && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate({
                      to: '/pegawai/dokumen/$id',
                      params: { id: submittedDocument.id },
                    })}
                    className="w-full sm:w-auto"
                  >
                    Lihat Detail Dokumen
                  </Button>
                )}
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

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <PegawaiPanel className="min-w-0 p-4">
            <StepIndicator
              currentStep={step}
              completedSteps={completedSteps}
              onStepClick={handleStepClick}
              labels={stepLabels}
            />
          </PegawaiPanel>
          <PegawaiPanel className="space-y-3 bg-[#FFF8F1]">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
                <ShieldCheck size={18} />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-950">Aturan alur</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-700">
                  Gunakan istilah dokumen. Jangan unggah data di luar kebutuhan pengajuan.
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-orange-100 bg-white/80 p-3 text-xs text-zinc-700">
              <p className="font-semibold text-zinc-950">Bagian aktif</p>
              <p className="mt-1">{step}. {stepLabels[step - 1]}</p>
            </div>
          </PegawaiPanel>
        </div>

        <PegawaiPanel className="min-w-0 p-4 sm:p-6">
          <div className="mb-5 flex items-center gap-2 border-b border-orange-100 pb-4">
            <ClipboardList size={16} className="text-orange-700" />
            <div>
              <p className="text-sm font-bold text-zinc-950">{stepLabels[step - 1]}</p>
              <p className="text-xs text-zinc-500">
                {step === 1
                  ? 'Lengkapi informasi dasar dan jenis dokumen.'
                  : step === 2
                    ? 'Lengkapi lampiran dan detail pengajuan.'
                    : 'Tinjau ringkasan sebelum mengajukan dokumen.'}
              </p>
            </div>
          </div>

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

              <div className="sticky bottom-3 z-10 rounded-2xl border border-orange-100 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex sm:justify-end">
                <Button
                  type="button"
                  onClick={handleNextFromInformation}
                  disabled={!canAdvanceFromInformation}
                  className="w-full gap-1.5 sm:w-auto"
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

              <div className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-2xl border border-orange-100 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  className="w-full gap-1.5 sm:w-auto"
                >
                  <ChevronLeft size={14} /> Kembali
                </Button>
                <Button
                  type="button"
                  onClick={handleNextFromDetails}
                  disabled={!canAdvanceFromStep6()}
                  className="w-full gap-1.5 sm:w-auto"
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
        </PegawaiPanel>
      </div>

      <ConfirmDialog
        open={submitConfirmationOpen}
        onOpenChange={(open) => {
          if (!submitting) setSubmitConfirmationOpen(open)
        }}
        title="Ajukan dokumen ini?"
        description={
          isNonMaterial
            ? 'Pastikan jenis dokumen, kegiatan, keterangan detail, dan kelengkapan sudah benar. Dokumen Non-Material akan disimpan sebagai Tersimpan.'
            : 'Pastikan jenis permintaan, kegiatan, nominal realisasi, dan kelengkapan sudah benar. Dokumen Material akan mengikuti alur validasi dan persetujuan yang berlaku.'
        }
        confirmLabel={isNonMaterial ? 'Simpan Dokumen' : 'Ajukan Dokumen'}
        cancelLabel="Periksa Kembali"
        onConfirm={handleSubmit}
        pending={submitting}
        disabled={submitting}
      />
    </PageLayout>
  )
}
