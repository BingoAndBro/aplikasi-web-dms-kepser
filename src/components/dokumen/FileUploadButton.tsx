/**
 * FileUploadButton — handles file selection, validation, and upload.
 * States: idle → uploading → uploaded | error
 */
import { useRef, useState } from 'react'
import { Upload, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import type { LampiranUrl } from '#/lib/dokumen-helpers'

const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx']
const MAX_SIZE = 2 * 1024 * 1024 // 2MB

type UploadState = 'idle' | 'uploading' | 'uploaded' | 'error'

interface FileUploadButtonProps {
  kelengkapanId: string
  namaDokumen: string
  initialLampiran?: LampiranUrl // pre-populated for edit/resubmit page
  onUploaded: (lampiran: LampiranUrl) => void
  onRemoved?: () => void
  className?: string
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileUploadButton({
  kelengkapanId,
  namaDokumen,
  initialLampiran,
  onUploaded,
  onRemoved,
  className,
}: FileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>(initialLampiran ? 'uploaded' : 'idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [filename, setFilename] = useState(initialLampiran?.url.split('/').pop() ?? '')
  const [fileSize, setFileSize] = useState<number>(0)

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrorMsg(`Tipe file tidak diizinkan. Gunakan: ${ALLOWED_EXTENSIONS.join(', ')}`)
      setState('error')
      return
    }

    // Validate size
    if (file.size > MAX_SIZE) {
      setErrorMsg('Ukuran file maksimal 2MB')
      setState('error')
      return
    }

    setFilename(file.name)
    setFileSize(file.size)
    setErrorMsg('')
    setState('uploading')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('kelengkapan_id', kelengkapanId)
      formData.append('nama_dokumen', namaDokumen)

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })

      const json = await res.json()

      if (!res.ok) {
        setErrorMsg(json.error ?? 'Gagal mengunggah file')
        setState('error')
        return
      }

      const lampiran: LampiranUrl = {
        kelengkapan_id: json.kelengkapan_id,
        nama: json.nama,
        url: json.url,
        uploaded_at: json.uploaded_at,
      }

      onUploaded(lampiran)
      setState('uploaded')
    } catch {
      setErrorMsg('Terjadi kesalahan saat mengunggah. Coba lagi.')
      setState('error')
    }

    // Reset input
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  if (state === 'uploaded') {
    return (
      <div className={cn('flex min-w-0 items-center gap-2 rounded-lg bg-emerald-50/70 px-2.5 py-1.5', className)}>
        <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-semibold text-stone-700">{filename}</p>
          {fileSize > 0 && (
            <p className="text-[9px] text-emerald-600">{formatFileSize(fileSize)}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setState('idle')
            setFilename('')
            setFileSize(0)
            onRemoved?.()
          }}
          className="shrink-0 rounded-md px-2 py-1 text-[9px] font-semibold text-stone-400 transition hover:bg-red-50 hover:text-error"
        >
          Hapus
        </button>
      </div>
    )
  }

  if (state === 'uploading') {
    return (
      <div className={cn('flex items-center gap-2 rounded-lg bg-[#FFF3D6] px-3 py-2', className)}>
        <Loader2 size={14} className="shrink-0 animate-spin text-[#D97706]" />
        <p className="text-[10px] font-semibold text-stone-600">Mengunggah...</p>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className={cn('flex flex-col gap-2 rounded-lg border border-red-100 bg-red-50 p-2.5', className)}>
        <div className="flex items-center gap-2">
          <XCircle size={14} className="shrink-0 text-error" />
          <p className="text-[10px] font-semibold text-error">{errorMsg}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => { setState('idle'); setErrorMsg('') }}
          className="self-start"
        >
          Coba Lagi
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('flex min-w-0 items-center justify-end', className)}>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS.join(',')}
        onChange={handleFileSelect}
        className="hidden"
      />
      <Button
        type="button"
        size="sm"
        className="h-9 w-full gap-1.5 bg-[#FFF0DD] px-4 text-[10px] font-bold uppercase tracking-wide text-[#C55A00] hover:bg-[#FFE4BF] sm:w-auto"
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={12} />
        Unggah
      </Button>
    </div>
  )
}
