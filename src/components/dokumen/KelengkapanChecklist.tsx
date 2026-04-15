/**
 * KelengkapanChecklist — shows required/optional documents for a kegiatan + role.
 * Allows file upload per kelengkapan item.
 */
import { useEffect, useState } from 'react'
import { FileText, AlertCircle } from 'lucide-react'
import { cn } from '#/lib/utils'
import { getBrowserClient } from '#/lib/supabase-browser'
import { FileUploadButton } from './FileUploadButton'
import type { LampiranUrl } from '#/lib/dokumen-helpers'

type KelengkapanItem = {
  id: string
  nama_dokumen: string
  is_ketua_tim: boolean
  required: boolean
}

interface KelengkapanChecklistProps {
  kegiatanId: string
  isKetuaTim: boolean
  dokumenId: string
  initialLampirans?: LampiranUrl[]
  onComplete: (lampirans: LampiranUrl[], missingRequired: KelengkapanItem[]) => void
}

export function KelengkapanChecklist({
  kegiatanId,
  isKetuaTim,
  dokumenId,
  initialLampirans = [],
  onComplete,
}: KelengkapanChecklistProps) {
  const [items, setItems] = useState<KelengkapanItem[]>([])
  const [loading, setLoading] = useState(true)
  const [lampiranUrls, setLampiranUrls] = useState<LampiranUrl[]>(initialLampirans)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchKelengkapan() {
      if (!kegiatanId) return
      setLoading(true)
      setError('')
      try {
        const supabase = getBrowserClient()
        if (!supabase) { setLoading(false); return }

        const { data, error: fetchError } = await supabase
          .from('master_kelengkapan_dokumen')
          .select('id, nama_dokumen, is_ketua_tim, required')
          .eq('kegiatan_id', kegiatanId)
          .eq('is_ketua_tim', isKetuaTim)
          .order('nama_dokumen', { ascending: true })

        if (fetchError) {
          setError('Gagal mengambil daftar kelengkapan')
          return
        }

        setItems(data ?? [])
      } catch {
        setError('Gagal mengambil daftar kelengkapan')
      } finally {
        setLoading(false)
      }
    }

    fetchKelengkapan()
  }, [kegiatanId, isKetuaTim])

  // Notify parent when lampiranUrls changes
  useEffect(() => {
    const missing = items.filter(
      item => item.required && !lampiranUrls.some(l => l.kelengkapan_id === item.id)
    )
    onComplete(lampiranUrls, missing)
  }, [lampiranUrls, items, onComplete])

  function handleUploaded(kelengkapanId: string, lampiran: LampiranUrl) {
    setLampiranUrls(prev => {
      const filtered = prev.filter(l => l.kelengkapan_id !== kelengkapanId)
      return [...filtered, lampiran]
    })
  }

  function handleRemoved(kelengkapanId: string) {
    setLampiranUrls(prev => prev.filter(l => l.kelengkapan_id !== kelengkapanId))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-on-surface-variant">Memuat kelengkapan...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-error text-xs px-3 py-2 bg-error/10 rounded-lg">
        <AlertCircle size={14} />
        {error}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-on-surface-variant">
        Tidak ada kelengkapan untuk kegiatan dan peran ini.
      </div>
    )
  }

  const requiredCount = items.filter(i => i.required).length
  const uploadedCount = lampiranUrls.filter(l =>
    items.some(i => i.id === l.kelengkapan_id && i.required)
  ).length

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center justify-between text-xs text-on-surface-variant">
        <span>
          {lampiranUrls.length} dari {items.length} dokumen diunggah
          {requiredCount > 0 && (
            <span className="ml-1">
              ({uploadedCount}/{requiredCount} wajib)
            </span>
          )}
        </span>
        {requiredCount > 0 && uploadedCount < requiredCount && (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <AlertCircle size={12} />
            {requiredCount - uploadedCount} wajib belum diunggah
          </span>
        )}
      </div>

      {/* Checklist */}
      <div className="space-y-2">
        {items.map(item => {
          const uploaded = lampiranUrls.find(l => l.kelengkapan_id === item.id)
          return (
            <div
              key={item.id}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border transition-colors',
                uploaded
                  ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10'
                  : item.required
                    ? 'border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-900/10'
                    : 'border-border bg-background'
              )}
            >
              <div className="shrink-0 mt-0.5">
                <FileText
                  size={14}
                  className={cn(
                    uploaded ? 'text-green-500' : item.required ? 'text-amber-500' : 'text-outline'
                  )}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-medium text-on-surface">{item.nama_dokumen}</p>
                  {item.required && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 rounded">
                      WAJIB
                    </span>
                  )}
                </div>
                <div className="mt-1.5">
                  {uploaded ? (
                    <FileUploadButton
                      kelengkapanId={item.id}
                      dokumenId={dokumenId}
                      namaDokumen={item.nama_dokumen}
                      initialLampiran={uploaded}
                      onUploaded={(lamp) => handleUploaded(item.id, lamp)}
                      onRemoved={() => handleRemoved(item.id)}
                    />
                  ) : (
                    <FileUploadButton
                      kelengkapanId={item.id}
                      dokumenId={dokumenId}
                      namaDokumen={item.nama_dokumen}
                      onUploaded={(lamp) => handleUploaded(item.id, lamp)}
                    />
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
