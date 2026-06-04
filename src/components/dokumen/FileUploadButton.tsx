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
      <div className={cn('flex min-w-0 items-center gap-3 rounded-xl border border-emerald-100 bg-white p-2.5', className)}>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <CheckCircle2 size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-zinc-950">{filename}</p>
          {fileSize > 0 && (
            <p className="mt-0.5 text-[10px] font-medium text-emerald-600">{formatFileSize(fileSize)}</p>
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
          className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold text-error transition hover:bg-red-50"
        >
          Hapus
        </button>
      </div>
    )
  }

  if (state === 'uploading') {
    return (
      <div className={cn('flex items-center gap-2 rounded-xl border border-orange-100 bg-orange-50/60 p-3', className)}>
        <Loader2 size={16} className="shrink-0 animate-spin text-orange-600" />
        <p className="text-xs font-semibold text-orange-800">Mengunggah...</p>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className={cn('flex flex-col gap-2 rounded-xl border border-red-100 bg-red-50 p-3', className)}>
        <div className="flex items-center gap-2">
          <XCircle size={16} className="text-error shrink-0" />
          <p className="text-xs font-semibold text-error">{errorMsg}</p>
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
    <div className={cn('flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center', className)}>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS.join(',')}
        onChange={handleFileSelect}
        className="hidden"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full gap-1.5 border-orange-200 bg-white text-orange-800 hover:bg-orange-50 sm:w-auto"
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={14} />
        Unggah File
      </Button>
      <p className="text-[10px] font-medium leading-relaxed text-zinc-500">
        PDF, DOC, DOCX, XLS, XLSX - Maks 2MB
      </p>
    </div>
  )
}
