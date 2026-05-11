import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState, useCallback } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '#/components/ui/select'
import { StepIndicator } from '#/components/dokumen/StepIndicator'
import { KelengkapanChecklist } from '#/components/dokumen/KelengkapanChecklist'
import { ReviewSummary } from '#/components/dokumen/ReviewSummary'
import { StepFungsiTanggal } from '#/components/dokumen/form/StepFungsiTanggal'
import { StepKegiatan } from '#/components/dokumen/form/StepKegiatan'
import { getBrowserClient } from '#/lib/supabase-browser'
import type {
  LampiranUrl,
  FungsiRow,
  KegiatanRow,
  JenisRow,
  KategoriRow,
  DetailRow,
  JenisDokumenRow,
} from '#/components/dokumen/form/dokumen-form-types'
import {
  getAllFungsi,
  getKegiatanByFungsi,
  getAllJenis,
  getKategoriByJenis,
  getDetailByKategori,
  getAllJenisDokumen,
} from '#/lib/master-data'
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  AlertCircle,
  Loader2,
  Tag,
  Trophy,
  Medal,
  FileCheck,
} from 'lucide-react'

export const Route = createFileRoute('/pegawai/dokumen/aju')({
  component: AjukanDokumenPage,
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

function AjukanDokumenPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
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
      const supabase = getBrowserClient()
      if (!supabase) return
      const data = await getAllFungsi(supabase)
      setFungsiList(data)
      setLoadingFungsi(false)
    }
    load()
  }, [])

  // Load kegiatan when fungsi changes
  useEffect(() => {
    if (!fungsiId) { setKegiatanList([]); return }
    async function load() {
      setLoadingKegiatan(true)
      const supabase = getBrowserClient()
      if (!supabase) { setLoadingKegiatan(false); return }
      const data = await getKegiatanByFungsi(supabase, fungsiId)
      setKegiatanList(data)
      setLoadingKegiatan(false)
    }
    load()
  }, [fungsiId])

  // Load jenis permintaan when kegiatan is selected
  useEffect(() => {
    if (!kegiatanId) { setJenisList([]); return }
    async function load() {
      setLoadingJenis(true)
      const supabase = getBrowserClient()
      if (!supabase) { setLoadingJenis(false); return }
      const data = await getAllJenis(supabase)
      setJenisList(data)
      setLoadingJenis(false)
    }
    load()
  }, [kegiatanId])

  // Load jenis dokumen (for Non-Material)
  useEffect(() => {
    if (!isNonMaterial) { setJenisDokumenList([]); return }
    async function load() {
      const supabase = getBrowserClient()
      if (!supabase) return
      const data = await getAllJenisDokumen(supabase)
      setJenisDokumenList(data)
    }
    load()
  }, [isNonMaterial])

  // Load kategori when jenis changes (Material only)
  useEffect(() => {
    if (!jenisPermintaanId || isNonMaterial) { setKategoriList([]); return }
    async function load() {
      setLoadingKategori(true)
      const supabase = getBrowserClient()
      if (!supabase) { setLoadingKategori(false); return }
      const data = await getKategoriByJenis(supabase, jenisPermintaanId)
      setKategoriList(data)
      setLoadingKategori(false)
    }
    load()
  }, [jenisPermintaanId, isNonMaterial])

  // Load detail when kategori changes, check if has children
  useEffect(() => {
    if (!kategoriPermintaanId) { setDetailList([]); setKategoriHasDetail(false); return }
    async function load() {
      const supabase = getBrowserClient()
      if (!supabase) return
      const data = await getDetailByKategori(supabase, kategoriPermintaanId)
      setDetailList(data)
      setKategoriHasDetail(data.length > 0)
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

  // Dynamic step labels
  // Material: Fungsi -> Kegiatan -> Jenis -> Kategori -> Detail -> Unggah -> Review
  // Non-Material: Fungsi -> Kegiatan -> Jenis Dokumen -> Unggah -> Review
  const getStepLabels = () => {
    if (isNonMaterial) {
      return ['Fungsi', 'Kegiatan', 'Jenis Dokumen', 'Unggah', 'Review']
    }
    return kategoriHasDetail
      ? ['Fungsi', 'Kegiatan', 'Jenis', 'Kategori', 'Detail', 'Unggah', 'Review']
      : ['Fungsi', 'Kegiatan', 'Jenis', 'Kategori', 'Unggah', 'Review']
  }

  const stepLabels = getStepLabels()

  // Completed steps
  const getCompletedSteps = () => {
    const completed: number[] = []
    if (step > 1) completed.push(1)
    if (step > 2) completed.push(2)
    if (step > 3) completed.push(3)
    if (step > 4) completed.push(4)
    if (step > 5) completed.push(5)
    if (step > 6) completed.push(6)
    if (step > 7) completed.push(7)
    return completed
  }
  const completedSteps = getCompletedSteps()

  // Step validation
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

  function handleNext() {
    if (step === 1 && tanggal > today) {
      setTanggalError('Tanggal tidak boleh melewati hari ini')
      return
    }

    // Validate nominal when advancing from step 6 (Material docs)
    if (step === stepLabels.length - 1 && !isNonMaterial) {
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

    const maxStep = stepLabels.length
    if (step < maxStep) setStep(step + 1)
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

  async function checkChairmanStatus(kegId: string) {
    setIsChairmanLoading(true)
    setChairmanBadgeVisible(false)

    try {
      const res = await fetch(`/api/users/me/is-ketua-tim/${kegId}`, {
        credentials: 'include'
      })

      if (res.ok) {
        const data = await res.json()
        setIsKetuaTim(data.is_ketua_tim === true)
        setChairmanBadgeVisible(true)
      } else {
        setIsKetuaTim(false)
        setChairmanBadgeVisible(true)
      }
    } catch (err) {
      console.error('Failed to check chairman status:', err)
      setIsKetuaTim(false)
      setChairmanBadgeVisible(true)
    } finally {
      setIsChairmanLoading(false)
    }
  }

  async function handleSubmit() {
    // Validate based on document type
    if (!isNonMaterial) {
      // Strip dots before validation (e.g., "1.000.000" -> "1000000")
      const rawNominal = nominalRealisasi.replace(/[^\d]/g, '')
      const nominal = parseInt(rawNominal, 10)
      if (isNaN(nominal) || nominal <= 0) {
        setNominalError('Nominal Realisasi wajib diisi dan harus lebih dari 0 untuk dokumen Material')
        return
      }
    } else {
      if (!keteranganDetail.trim()) {
        setSubmitError('Keterangan detail dokumen wajib diisi untuk dokumen Non-Material')
        return
      }
    }

    if (missingRequired.length > 0) return
    if (lampiranUrls.length === 0) {
      setSubmitError('Minimal upload satu lampiran sebelum mengajukan dokumen')
      return
    }

    if (!chairmanBadgeVisible && !isChairmanLoading) {
      setSubmitError('Peran belum ditentukan. Silakan pilih kegiatan terlebih dahulu.')
      return
    }

    setSubmitting(true)
    setSubmitError('')

    try {
      // Strip dots from formatted number (e.g., "1.000.000" -> "1000000") before parsing
      const rawNominal = nominalRealisasi.replace(/[^\d]/g, '')
      const nominalValue = isNonMaterial ? null : (parseInt(rawNominal, 10) || null)
      const selectedJenisPermintaanId = jenisPermintaanId || undefined
      const selectedKategoriPermintaanId = kategoriPermintaanId || undefined
      const selectedDetailPermintaanId = detailPermintaanId || undefined

      const res = await fetch('/api/dokumen/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
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
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        setSubmitError(json.error ?? 'Gagal mengajukan dokumen')
        return
      }

      navigate({ to: '/pegawai/dokumen' })
    } catch {
      setSubmitError('Terjadi kesalahan. Coba lagi.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageLayout>
      <div className="space-y-6 max-w-2xl mx-auto">
        {/* Header */}
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
            <FileText size={12} />
            <Link to="/pegawai/dokumen" className="hover:text-primary">Dokumen</Link>
            <span>/</span>
            <span className="text-primary">Ajukan Dokumen</span>
          </div>
          <h2 className="font-headline text-2xl font-extrabold text-on-surface">
            Ajukan Dokumen Baru
          </h2>
          <p className="text-on-surface-variant text-xs mt-1">
            Ikuti {stepLabels.length} langkah untuk mengajukan dokumen baru.
          </p>
        </div>

        {/* Step Indicator */}
        <div className="bg-white/5 rounded-xl border border-white/10 p-4">
          <StepIndicator
            currentStep={step}
            completedSteps={completedSteps}
            onStepClick={handleStepClick}
            labels={stepLabels}
          />
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-xl border border-outline-variant/30 shadow-sm p-6">
          {/* STEP 1: Fungsi & Info Dasar */}
          {step === 1 && (
            <StepFungsiTanggal
              fungsiId={fungsiId}
              fungsiList={fungsiList}
              loadingFungsi={loadingFungsi}
              tanggal={tanggal}
              tanggalError={tanggalError}
              tahun={tahun}
              canAdvanceFromStep1={canAdvanceFromStep1}
              onFungsiChange={handleFungsiChange}
              onTanggalChange={handleTanggalChange}
              onNext={handleNext}
            />
          )}

          {/* STEP 2: Kegiatan */}
          {step === 2 && (
            <StepKegiatan
              fungsiId={fungsiId}
              kegiatanId={kegiatanId}
              kegiatanList={kegiatanList}
              loadingKegiatan={loadingKegiatan}
              canAdvanceFromStep2={canAdvanceFromStep2}
              onKegiatanChange={handleKegiatanChange}
              onBack={handleBack}
              onNext={handleNext}
            />
          )}

          {/* STEP 3: Jenis Permintaan (Material) / Jenis Dokumen (Non-Material) */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-headline text-base font-bold text-on-surface">
                3. {isNonMaterial ? 'Pilih Jenis Dokumen' : 'Pilih Jenis Permintaan'}
              </h3>

              {/* Non-Material Toggle */}
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <input
                  type="checkbox"
                  id="isNonMaterial"
                  checked={isNonMaterial}
                  onChange={(e) => handleToggleNonMaterial(e.target.checked)}
                  className="w-4 h-4 rounded border-blue-400 text-primary focus:ring-primary"
                />
                <label htmlFor="isNonMaterial" className="text-sm text-blue-800 cursor-pointer flex-1">
                  <span className="font-semibold">Dokumen Non-Material</span>
                  <span className="text-xs text-blue-600 block">
                    Centang jika dokumen tidak memerlukan nominal (misalnya: rapat, perjalanan non-SPD)
                  </span>
                </label>
              </div>

              {isNonMaterial ? (
                // Non-Material: Jenis Dokumen dropdown
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-on-surface">
                    Jenis Dokumen <span className="text-error">*</span>
                  </label>
                  {jenisDokumenList.length === 0 ? (
                    <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                      <Loader2 size={14} className="animate-spin" />Memuat jenis dokumen...
                    </div>
                  ) : (
                    <Select value={jenisDokumenId} onValueChange={v => handleJenisDokumenChange(v ?? '')}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pilih jenis dokumen...">
                          {v => jenisDokumenList.find(j => j.id === v)?.nama ?? ''}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {jenisDokumenList.map(j => (
                          <SelectItem key={j.id} value={j.id} label={j.nama}>
                            <div>
                              <p className="font-medium">{j.nama}</p>
                              {j.deskripsi && <p className="text-[10px] text-on-surface-variant">{j.deskripsi}</p>}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ) : (
                // Material: Jenis Permintaan dropdown
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-on-surface">
                    Jenis Permintaan <span className="text-error">*</span>
                  </label>
                  {loadingJenis ? (
                    <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                      <Loader2 size={14} className="animate-spin" />Memuat...
                    </div>
                  ) : jenisList.length === 0 ? (
                    <p className="text-xs text-on-surface-variant p-3 bg-muted rounded-lg">
                      Tidak ada jenis permintaan tersedia.
                    </p>
                  ) : (
                    <Select value={jenisPermintaanId} onValueChange={v => handleJenisChange(v ?? '')}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pilih jenis permintaan...">
                          {v => jenisList.find(j => j.id === v)?.nama ?? ''}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {jenisList.map(j => (
                          <SelectItem key={j.id} value={j.id} label={j.nama}>
                            <div>
                              <p className="font-medium">{j.nama}</p>
                              {j.deskripsi && <p className="text-[10px] text-on-surface-variant">{j.deskripsi}</p>}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleBack} className="gap-1.5 flex-1">
                  <ChevronLeft size={14} />Kembali
                </Button>
                <Button onClick={handleNext} disabled={!canAdvanceFromStep3} className="gap-1.5 flex-1">
                  Lanjut <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 4: Kategori Permintaan (Material only) */}
          {!isNonMaterial && step === 4 && (
            <div className="space-y-4">
              <h3 className="font-headline text-base font-bold text-on-surface">
                4. Pilih Kategori Permintaan
              </h3>

              <p className="text-xs text-on-surface-variant">
                Untuk <strong className="text-on-surface">{jenisPermintaanNama}</strong>
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-on-surface">
                  Kategori <span className="text-error">*</span>
                </label>
                {loadingKategori ? (
                  <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                    <Loader2 size={14} className="animate-spin" />Memuat...
                  </div>
                ) : kategoriList.length === 0 ? (
                  <p className="text-xs text-on-surface-variant p-3 bg-muted rounded-lg">
                    Tidak ada kategori untuk jenis yang dipilih.
                  </p>
                ) : (
                  <Select value={kategoriPermintaanId} onValueChange={v => handleKategoriChange(v ?? '')}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pilih kategori...">
                        {v => kategoriList.find(k => k.id === v)?.nama ?? ''}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {kategoriList.map(k => (
                        <SelectItem key={k.id} value={k.id} label={k.nama}>
                          <div>
                            <p className="font-medium">{k.nama}</p>
                            {k.deskripsi && <p className="text-[10px] text-on-surface-variant">{k.deskripsi}</p>}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleBack} className="gap-1.5 flex-1">
                  <ChevronLeft size={14} />Kembali
                </Button>
                <Button onClick={handleNext} disabled={!canAdvanceFromStep4} className="gap-1.5 flex-1">
                  Lanjut <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 5: Detail Permintaan (Material only, opsional) */}
          {!isNonMaterial && step === 5 && kategoriHasDetail && (
            <div className="space-y-4">
              <h3 className="font-headline text-base font-bold text-on-surface">
                5. Pilih Detail Permintaan
              </h3>

              <p className="text-xs text-on-surface-variant">
                Untuk kategori <strong className="text-on-surface">{kategoriPermintaanNama}</strong>
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-on-surface">
                  Detail <span className="text-error">*</span>
                </label>
                <Select value={detailPermintaanId} onValueChange={v => {
                  setDetailPermintaanId(v ?? '')
                  const dn = detailList.find(d => d.id === v)
                  setDetailPermintaanNama(dn?.nama ?? '')
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pilih detail...">
                      {v => detailList.find(d => d.id === v)?.nama ?? ''}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {detailList.map(d => (
                      <SelectItem key={d.id} value={d.id} label={d.nama}>
                        <div>
                          <p className="font-medium">{d.nama}</p>
                          {d.deskripsi && <p className="text-[10px] text-on-surface-variant">{d.deskripsi}</p>}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleBack} className="gap-1.5 flex-1">
                  <ChevronLeft size={14} />Kembali
                </Button>
                <Button onClick={handleNext} disabled={!canAdvanceFromStep5} className="gap-1.5 flex-1">
                  Lanjut <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}

          {/* STEP: Unggah + Nominal/Keterangan */}
          {(step === (isNonMaterial ? 4 : (kategoriHasDetail ? 6 : 5))) && (
            <div className="space-y-4">
              <h3 className="font-headline text-base font-bold text-on-surface">
                {isNonMaterial ? '4' : (kategoriHasDetail ? '6' : '5')}. Unggah Lampiran
                {isNonMaterial ? '' : ' & Nominal'}
              </h3>

              <p className="text-xs text-on-surface-variant">
                Kelengkapan untuk <strong className="text-on-surface">{kegiatanNama}</strong>
                {isNonMaterial ? (
                  <> — <strong className="text-on-surface">{jenisDokumenNama}</strong></>
                ) : (
                  <> — <strong className="text-on-surface">{jenisPermintaanNama}</strong>{' / '}
                  <strong className="text-on-surface">{kategoriPermintaanNama}</strong>
                  {detailPermintaanNama && <> / <strong className="text-on-surface">{detailPermintaanNama}</strong></>}
                </>
                )}
                {' sebagai '}
                <strong className="text-on-surface">{isKetuaTim ? 'Ketua Tim' : 'Anggota'}</strong>
              </p>

              {/* Auto-detected badge */}
              {chairmanBadgeVisible && (
                <div className={`rounded-lg p-3 transition-all ${
                  isKetuaTim
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-blue-50 border border-blue-200'
                }`}>
                  <div className="flex items-center gap-3">
                    {isChairmanLoading ? (
                      <Loader2 size={18} className="animate-spin text-primary" />
                    ) : isKetuaTim ? (
                      <Trophy size={18} className="text-green-600" />
                    ) : (
                      <Medal size={18} className="text-blue-600" />
                    )}
                    <div>
                      <p className={`text-sm font-semibold ${
                        isKetuaTim ? 'text-green-800' : 'text-blue-800'
                      }`}>
                        {isKetuaTim
                          ? 'Anda adalah Ketua Tim di kegiatan ini'
                          : 'Anda adalah Anggota di kegiatan ini'}
                      </p>
                      <p className={`text-xs mt-0.5 ${
                        isKetuaTim ? 'text-green-600' : 'text-blue-600'
                      }`}>
                        {isKetuaTim
                          ? 'Dokumen akan masuk ke Laporan Kegiatan.'
                          : 'Dokumen akan masuk ke Laporan Saya.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!chairmanBadgeVisible && (
                <div className="flex items-center justify-center py-2">
                  <Loader2 size={18} className="animate-spin text-outline" />
                  <span className="ml-2 text-sm text-on-surface-variant">Memeriksa peran...</span>
                </div>
              )}

              <KelengkapanChecklist
                kegiatanId={kegiatanId}
                isKetuaTim={isKetuaTim}
                onComplete={handleKelengkapanComplete}
                jenisPermintaanId={!isNonMaterial ? jenisPermintaanId || undefined : undefined}
                kategoriPermintaanId={!isNonMaterial ? kategoriPermintaanId || undefined : undefined}
                detailPermintaanId={!isNonMaterial ? detailPermintaanId || undefined : undefined}
                isNonMaterial={isNonMaterial}
              />

              {/* Nominal / Keterangan Section */}
              {isNonMaterial ? (
                // Non-Material: Keterangan Detail
                <div className="space-y-1.5 p-3 border border-outline-variant/30 rounded-lg bg-muted/30">
                  <label className="text-xs font-medium text-on-surface">
                    Keterangan Detail Dokumen <span className="text-error">*</span>
                  </label>
                  <input
                    type="text"
                    value={keteranganDetail}
                    onChange={(e) => {
                      setKeteranganDetail(e.target.value)
                      setSubmitError('')
                    }}
                    placeholder={`Contoh: ${jenisDokumenNama || 'Judul kegiatan'}...`}
                    className="w-full px-3 py-2 border border-outline rounded-lg text-sm bg-surface text-on-surface
                      focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                      placeholder:text-outline"
                  />
                  <p className="text-[10px] text-on-surface-variant">
                    Jelaskan detail dokumen, contoh: "{jenisDokumenNama || 'Rapat'} Bersama Pimpinan"
                  </p>
                </div>
              ) : (
                // Material: Nominal Realisasi
                <div className="space-y-1.5 p-3 border border-outline-variant/30 rounded-lg bg-muted/30">
                  <label className="text-xs font-medium text-on-surface">
                    Nominal Realisasi (Rp) <span className="text-error">*</span>
                  </label>
                  <input
                    type="text"
                    value={nominalRealisasi}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^\d]/g, '')
                      const num = parseInt(raw, 10)
                      setNominalRealisasi(raw ? num.toLocaleString('id-ID') : '')
                      setNominalError('')
                    }}
                    placeholder="Contoh: 1.500.000"
                    className="w-full px-3 py-2 border border-outline rounded-lg text-sm bg-surface text-on-surface
                      focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                      placeholder:text-outline"
                  />
                  {nominalError && (
                    <p className="text-[10px] text-error flex items-center gap-1">
                      <AlertCircle size={12} /> {nominalError}
                    </p>
                  )}
                  <p className="text-[10px] text-on-surface-variant">
                    Masukkan nominal dalam rupiah.
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleBack} className="gap-1.5 flex-1">
                  <ChevronLeft size={14} />Kembali
                </Button>
                <Button
                  onClick={handleNext}
                  disabled={!canAdvanceFromStep6()}
                  className="gap-1.5 flex-1"
                >
                  Lanjut <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}

          {/* STEP: Review */}
          {step === stepLabels.length && (
            <div className="space-y-4">
              <h3 className="font-headline text-base font-bold text-on-surface">
                {stepLabels.length}. Review & Ajukan
              </h3>

              <ReviewSummary
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
              />

              {submitError && (
                <div className="flex items-start gap-2 text-error text-xs p-3 bg-error/10 rounded-lg">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  {submitError}
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleBack} className="gap-1.5 flex-1" disabled={submitting}>
                  <ChevronLeft size={14} />Kembali
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || missingRequired.length > 0 || lampiranUrls.length === 0}
                  className="gap-1.5 flex-1"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Mengajukan...
                    </>
                  ) : (
                    'Ajukan Dokumen'
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  )
}
