import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState, useCallback } from 'react'
import { DashboardShell } from '#/components/dashboard/DashboardShell'
import { Button } from '#/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '#/components/ui/select'
import { StepIndicator } from '#/components/dokumen/StepIndicator'
import { KelengkapanChecklist } from '#/components/dokumen/KelengkapanChecklist'
import { ReviewSummary } from '#/components/dokumen/ReviewSummary'
import { getBrowserClient } from '#/lib/supabase-browser'
import { getTahunOptions } from '#/lib/utils/tahun'
import type { LampiranUrl } from '#/lib/dokumen-helpers'
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  AlertCircle,
  Loader2,
} from 'lucide-react'

export const Route = createFileRoute('/dokumen/aju')({
  component: AjukanDokumenPage,
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Fungsi = {
  id: string
  nama: string
}

type Kegiatan = {
  id: string
  nama: string
  fungsi_id: string
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

function AjukanDokumenPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Form state
  const [fungsiId, setFungsiId] = useState('')
  const [fungsiNama, setFungsiNama] = useState('')
  const [tahun, setTahun] = useState(new Date().getFullYear())
  const [tanggal, setTanggal] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [kegiatanId, setKegiatanId] = useState('')
  const [kegiatanNama, setKegiatanNama] = useState('')
  const [isKetuaTim, setIsKetuaTim] = useState(false)
  const [dokumenId, setDokumenId] = useState('') // generated after create
  const [lampiranUrls, setLampiranUrls] = useState<LampiranUrl[]>([])
  const [missingRequired, setMissingRequired] = useState<any[]>([])

  // Data for dropdowns
  const [fungsiList, setFungsiList] = useState<Fungsi[]>([])
  const [kegiatanList, setKegiatanList] = useState<Kegiatan[]>([])
  const [loadingFungsi, setLoadingFungsi] = useState(true)
  const [loadingKegiatan, setLoadingKegiatan] = useState(false)

  // Load fungsi on mount
  useEffect(() => {
    async function load() {
      const supabase = getBrowserClient()
      if (!supabase) return
      const { data } = await supabase
        .from('master_fungsi')
        .select('id, nama')
        .eq('is_active', true)
        .order('nama', { ascending: true })
      setFungsiList(data ?? [])
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
      const { data } = await supabase
        .from('master_kegiatan')
        .select('id, nama, fungsi_id')
        .eq('fungsi_id', fungsiId)
        .eq('is_active', true)
        .order('nama', { ascending: true })
      setKegiatanList(data ?? [])
      setLoadingKegiatan(false)
    }
    load()
  }, [fungsiId])

  // Track completed steps for StepIndicator
  const completedSteps = [
    step > 1 ? 1 : null,
    step > 2 ? 2 : null,
    step > 3 ? 3 : null,
    step > 4 ? 4 : null,
  ].filter((s): s is number => s !== null)

  // Step validation
  const canAdvanceFromStep1 = !!fungsiId && !!tahun && !!tanggal
  const canAdvanceFromStep2 = !!kegiatanId
  const canAdvanceFromStep3 = true // Role is always selected

  function handleNext() {
    if (step < 5) setStep(step + 1)
  }

  function handleBack() {
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

  async function handleSubmit() {
    if (missingRequired.length > 0) return
    if (lampiranUrls.length === 0) {
      setSubmitError('Minimal upload satu lampiran sebelum mengajukan dokumen')
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
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        setSubmitError(json.error ?? 'Gagal mengajukan dokumen')
        return
      }

      // Success — navigate to dokumen saya
      navigate({ to: '/dokumen/saya' })
    } catch {
      setSubmitError('Terjadi kesalahan. Coba lagi.')
    } finally {
      setSubmitting(false)
    }
  }

  const tahunOptions = getTahunOptions()

  return (
    <DashboardShell role="PEGAWAI">
      <div className="space-y-6 max-w-2xl mx-auto">
        {/* Header */}
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
            <FileText size={12} />
            <Link href="/dokumen/saya" className="hover:text-primary">Dokumen</Link>
            <span>/</span>
            <span className="text-primary">Ajukan Dokumen</span>
          </div>
          <h2 className="font-headline text-2xl font-extrabold text-on-surface">
            Ajukan Dokumen Baru
          </h2>
          <p className="text-on-surface-variant text-xs mt-1">
            Ikuti 5 langkah untuk mengajukan dokumen SPD baru.
          </p>
        </div>

        {/* Step Indicator */}
        <div className="bg-white/5 rounded-xl border border-white/10 p-4">
          <StepIndicator
            currentStep={step}
            completedSteps={completedSteps}
            onStepClick={handleStepClick}
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
                  <Select
                    value={fungsiId}
                    onValueChange={v => {
                      setFungsiId(v)
                      const fn = fungsiList.find(f => f.id === v)
                      setFungsiNama(fn?.nama ?? '')
                      setKegiatanId('')
                      setKegiatanNama('')
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pilih fungsi..." />
                    </SelectTrigger>
                    <SelectContent>
                      {fungsiList.map(f => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nama}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-on-surface">
                    Tahun <span className="text-error">*</span>
                  </label>
                  <Select value={String(tahun)} onValueChange={v => setTahun(parseInt(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tahunOptions.map(y => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-on-surface">
                    Tanggal <span className="text-error">*</span>
                  </label>
                  <input
                    type="date"
                    value={tanggal}
                    onChange={e => setTanggal(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-xs text-foreground outline-none focus:ring-1 focus:ring-ring/40"
                  />
                </div>
              </div>

              <Button
                onClick={handleNext}
                disabled={!canAdvanceFromStep1}
                className="w-full gap-1.5"
              >
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
                  <Select
                    value={kegiatanId}
                    onValueChange={v => {
                      setKegiatanId(v)
                      const kn = kegiatanList.find(k => k.id === v)
                      setKegiatanNama(kn?.nama ?? '')
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pilih kegiatan..." />
                    </SelectTrigger>
                    <SelectContent>
                      {kegiatanList.map(k => (
                        <SelectItem key={k.id} value={k.id}>
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
                <Button
                  onClick={handleNext}
                  disabled={!canAdvanceFromStep2}
                  className="gap-1.5 flex-1"
                >
                  Lanjut <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: Role */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-headline text-base font-bold text-on-surface">
                3. Peran dalam Kegiatan
              </h3>

              <div className="space-y-2">
                <label className="text-xs font-medium text-on-surface">
                  Apakah Anda sebagai Ketua Tim?
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsKetuaTim(false)}
                    className={`flex-1 p-4 rounded-lg border-2 transition-all text-left ${
                      !isKetuaTim
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <p className="text-sm font-semibold text-on-surface">Anggota</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      Saya adalah anggota tim, bukan ketua.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsKetuaTim(true)}
                    className={`flex-1 p-4 rounded-lg border-2 transition-all text-left ${
                      isKetuaTim
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <p className="text-sm font-semibold text-on-surface">Ketua Tim</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      Saya adalah penanggung jawab kegiatan ini.
                    </p>
                  </button>
                </div>
              </div>

              <p className="text-xs text-on-surface-variant bg-surface-container-low/30 p-3 rounded-lg">
                {isKetuaTim
                  ? 'Anda perlu mengunggah kelengkapan untuk Ketua Tim.'
                  : 'Anda perlu mengunggah kelengkapan untuk Anggota.'}
              </p>

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

          {/* STEP 4: Upload */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-headline text-base font-bold text-on-surface">
                4. Unggah Lampiran
              </h3>

              <p className="text-xs text-on-surface-variant">
                {isKetuaTim ? 'Kelengkapan untuk' : 'Kelengkapan untuk'}{' '}
                <strong className="text-on-surface">{kegiatanNama}</strong>{' '}
                sebagai <strong className="text-on-surface">{isKetuaTim ? 'Ketua Tim' : 'Anggota'}</strong>
              </p>

              <KelengkapanChecklist
                kegiatanId={kegiatanId}
                isKetuaTim={isKetuaTim}
                dokumenId={dokumenId || 'new'}
                onComplete={handleKelengkapanComplete}
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

          {/* STEP 5: Review */}
          {step === 5 && (
            <div className="space-y-4">
              <h3 className="font-headline text-base font-bold text-on-surface">
                5. Review & Ajukan
              </h3>

              <ReviewSummary
                fungsiNama={fungsiNama}
                kegiatanNama={kegiatanNama}
                tahun={tahun}
                tanggal={tanggal}
                isKetuaTim={isKetuaTim}
                lampiranUrls={lampiranUrls}
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
    </DashboardShell>
  )
}
