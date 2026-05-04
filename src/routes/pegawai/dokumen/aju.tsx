import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState, useCallback } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '#/components/ui/select'
import { DatePicker } from '#/components/ui/date-picker'
import { StepIndicator } from '#/components/dokumen/StepIndicator'
import { KelengkapanChecklist } from '#/components/dokumen/KelengkapanChecklist'
import { ReviewSummary } from '#/components/dokumen/ReviewSummary'
import { getBrowserClient } from '#/lib/supabase-browser'
import type { LampiranUrl } from '#/lib/dokumen-helpers'
import {
  getAllFungsi,
  getKegiatanByFungsi,
  getAllJenis,
  getKategoriByJenis,
  getDetailByKategori,
  type FungsiRow,
  type KegiatanRow,
  type JenisRow,
  type KategoriRow,
  type DetailRow,
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

  // Step 3: Jenis Permintaan
  const [jenisPermintaanId, setJenisPermintaanId] = useState('')
  const [jenisPermintaanNama, setJenisPermintaanNama] = useState('')

  // Step 4: Kategori Permintaan
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

  // Step 7: Lampiran
  const [lampiranUrls, setLampiranUrls] = useState<LampiranUrl[]>([])
  const [missingRequired, setMissingRequired] = useState<any[]>([])

  // Data lists
  const [fungsiList, setFungsiList] = useState<FungsiRow[]>([])
  const [kegiatanList, setKegiatanList] = useState<KegiatanRow[]>([])
  const [jenisList, setJenisList] = useState<JenisRow[]>([])
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

  // Load jenis when kegiatan is selected (jenis BEBAS — tidak bergantung ke apapun)
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

  // Load kategori when jenis changes
  useEffect(() => {
    if (!jenisPermintaanId) { setKategoriList([]); return }
    async function load() {
      setLoadingKategori(true)
      const supabase = getBrowserClient()
      if (!supabase) { setLoadingKategori(false); return }
      const data = await getKategoriByJenis(supabase, jenisPermintaanId)
      setKategoriList(data)
      setLoadingKategori(false)
    }
    load()
  }, [jenisPermintaanId])

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

  function handleKegiatanChange(id: string) {
    setKegiatanId(id)
    const kn = kegiatanList.find(k => k.id === id)
    setKegiatanNama(kn?.nama ?? '')
    setJenisPermintaanId(''); setJenisPermintaanNama('')
    setKategoriPermintaanId(''); setKategoriPermintaanNama('')
    setDetailPermintaanId(''); setDetailPermintaanNama('')
    setKategoriHasDetail(false)
    // Check chairman status for the selected kegiatan
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

  function handleKategoriChange(id: string) {
    setKategoriPermintaanId(id)
    const kn = kategoriList.find(k => k.id === id)
    setKategoriPermintaanNama(kn?.nama ?? '')
    setDetailPermintaanId(''); setDetailPermintaanNama('')
  }

  // Dynamic step labels - removed "Peran" step (now auto-detected)
  const stepLabels = kategoriHasDetail
    ? ['Fungsi', 'Kegiatan', 'Jenis', 'Kategori', 'Detail', 'Unggah', 'Review']
    : ['Fungsi', 'Kegiatan', 'Jenis', 'Kategori', 'Unggah', 'Review']

  // Map visual step to internal step logic
  function getVisualStepLabel(currentStep: number): string {
    return stepLabels[currentStep - 1] ?? String(currentStep)
  }

  // Completed steps for indicator - updated for removed "Peran" step
  const completedSteps: number[] = []
  if (step > 1) completedSteps.push(1)
  if (step > 2) completedSteps.push(2)
  if (step > 3) completedSteps.push(3)
  if (step > 4) completedSteps.push(4)
  if (step > 5) completedSteps.push(5)
  if (step > 6) completedSteps.push(6)
  if (step > 7) completedSteps.push(7)

  // Step validation - updated for removed "Peran" step
  const canAdvanceFromStep1 = !!fungsiId && !!tahun && !!tanggal && !tanggalError
  const canAdvanceFromStep2 = !!kegiatanId
  const canAdvanceFromStep3 = !!jenisPermintaanId
  const canAdvanceFromStep4 = !!kategoriPermintaanId
  const canAdvanceFromStep5 = !kategoriHasDetail || !!detailPermintaanId
  const canAdvanceFromStep6 = true // Upload step - always can advance (validation is in submit)

  function handleNext() {
    if (step === 1 && tanggal > today) {
      setTanggalError('Tanggal tidak boleh melewati hari ini')
      return
    }
    if (step < (kategoriHasDetail ? 7 : 6)) setStep(step + 1)
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

  // Check chairman status when kegiatan is selected
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
    if (missingRequired.length > 0) return
    if (lampiranUrls.length === 0) {
      setSubmitError('Minimal upload satu lampiran sebelum mengajukan dokumen')
      return
    }

    // Safety check: is_ketua_tim must be determined (from chairman status)
    if (!chairmanBadgeVisible && !isChairmanLoading) {
      setSubmitError('Peran belum ditentukan. Silakan pilih kegiatan terlebih dahulu.')
      return
    }

    setSubmitting(true)
    setSubmitError('')

    try {
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
          jenisPermintaanId: jenisPermintaanId || undefined,
          kategoriPermintaanId: kategoriPermintaanId || undefined,
          detailPermintaanId: detailPermintaanId || undefined,
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
            Ikuti {kategoriHasDetail ? '7' : '6'} langkah untuk mengajukan dokumen SPD baru.
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
            <div className="space-y-4">
              <h3 className="font-headline text-base font-bold text-on-surface">
                1. Pilih Fungsi & Informasi Dasar
              </h3>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-on-surface">
                  Fungsi <span className="text-error">*</span>
                </label>
                {loadingFungsi ? (
                  <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                    <Loader2 size={14} className="animate-spin" />Memuat...
                  </div>
                ) : (
                  <Select value={fungsiId} onValueChange={v => handleFungsiChange(v ?? '')}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pilih fungsi...">
                        {v => v ? (fungsiList.find(f => f.id === v)?.nama ?? '') : 'Pilih fungsi...'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {fungsiList.map(f => (
                        <SelectItem key={f.id} value={f.id} label={f.nama}>
                          {f.nama}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-on-surface">
                  Tanggal <span className="text-error">*</span>
                </label>
                <DatePicker
                  value={tanggal}
                  onChange={newTanggal => {
                    if (!newTanggal) return
                    setTanggal(newTanggal)
                    setTahun(new Date(newTanggal).getFullYear())
                    if (newTanggal <= today) setTanggalError('')
                  }}
                  placeholder="Pilih tanggal..."
                />
                {tanggalError ? (
                  <p className="text-[10px] text-error flex items-center gap-1">
                    <span>⚠</span> {tanggalError}
                  </p>
                ) : tahun ? (
                  <p className="text-[10px] text-on-surface-variant">
                    Tahun: <span className="font-semibold text-primary">{tahun}</span>
                  </p>
                ) : null}
              </div>

              <Button onClick={handleNext} disabled={!canAdvanceFromStep1} className="w-full gap-1.5">
                Lanjut <ChevronRight size={14} />
              </Button>
            </div>
          )}

          {/* STEP 2: Kegiatan */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-headline text-base font-bold text-on-surface">
                2. Pilih Kegiatan
              </h3>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-on-surface">
                  Kegiatan <span className="text-error">*</span>
                </label>
                {loadingKegiatan ? (
                  <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                    <Loader2 size={14} className="animate-spin" />Memuat...
                  </div>
                ) : kegiatanList.length === 0 ? (
                  <p className="text-xs text-on-surface-variant p-3 bg-muted rounded-lg">
                    Tidak ada kegiatan untuk fungsi yang dipilih.
                  </p>
                ) : (
                  <Select value={kegiatanId} onValueChange={v => handleKegiatanChange(v ?? '')}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pilih kegiatan...">
                        {v => kegiatanList.find(k => k.id === v)?.nama ?? ''}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {kegiatanList.map(k => (
                        <SelectItem key={k.id} value={k.id} label={k.nama}>
                          {k.nama}
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
                <Button onClick={handleNext} disabled={!canAdvanceFromStep2} className="gap-1.5 flex-1">
                  Lanjut <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: Jenis Permintaan */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-headline text-base font-bold text-on-surface">
                3. Pilih Jenis Permintaan
              </h3>

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

          {/* STEP 4: Kategori Permintaan */}
          {step === 4 && (
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

          {/* STEP 5: Detail Permintaan (OPSIONAL — hanya jika kategori punya anak) */}
          {step === 5 && kategoriHasDetail && (
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

          {/* STEP 5/6: Upload - step 6 (with detail) or 5 (without detail) */}
          {step === (kategoriHasDetail ? 6 : 5) && (
            <div className="space-y-4">
              <h3 className="font-headline text-base font-bold text-on-surface">
                {kategoriHasDetail ? '6' : '5'}. Unggah Lampiran
              </h3>

              <p className="text-xs text-on-surface-variant">
                Kelengkapan untuk <strong className="text-on-surface">{kegiatanNama}</strong>{' '}
                — <strong className="text-on-surface">{jenisPermintaanNama}</strong>{' / '}
                <strong className="text-on-surface">{kategoriPermintaanNama}</strong>
                {detailPermintaanNama && <> / <strong className="text-on-surface">{detailPermintaanNama}</strong></>}
                {' sebagai '}
                <strong className="text-on-surface">{isKetuaTim ? 'Ketua Tim' : 'Anggota'}</strong>
              </p>

              {/* Auto-detected badge - shown below upload section */}
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
                          ? 'Dokumen akan masuk ke Laporan Kegiatan. Anggota tim dapat melihat dokumen ini.'
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
                jenisPermintaanId={jenisPermintaanId || undefined}
                kategoriPermintaanId={kategoriPermintaanId || undefined}
                detailPermintaanId={detailPermintaanId || undefined}
              />

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleBack} className="gap-1.5 flex-1">
                  <ChevronLeft size={14} />Kembali
                </Button>
                <Button
                  onClick={handleNext}
                  disabled={missingRequired.length > 0}
                  className="gap-1.5 flex-1"
                >
                  Lanjut <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 6/7: Review - step 7 (with detail) or 6 (without detail) */}
          {step === (kategoriHasDetail ? 7 : 6) && (
            <div className="space-y-4">
              <h3 className="font-headline text-base font-bold text-on-surface">
                {kategoriHasDetail ? '7' : '6'}. Review & Ajukan
              </h3>

              <ReviewSummary
                fungsiNama={fungsiNama}
                kegiatanNama={kegiatanNama}
                tahun={tahun}
                tanggal={tanggal}
                isKetuaTim={isKetuaTim}
                lampiranUrls={lampiranUrls}
                jenisPermintaanNama={jenisPermintaanNama}
                kategoriPermintaanNama={kategoriPermintaanNama}
                detailPermintaanNama={detailPermintaanNama}
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
