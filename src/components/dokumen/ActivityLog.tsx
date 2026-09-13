"use client"

import { useEffect, useState } from 'react'
import { Clock, User, FileText, CheckCircle2, XCircle, AlertTriangle, Upload, ArrowRight } from 'lucide-react'
import { apiFetch } from '#/lib/api-client'
import { formatDateTime } from '#/lib/utils/format'

type LogEntry = {
  id: string
  aksi: string
  catatan: string | null
  stepUrutan: number | null
  createdAt: string
  userId: string
  userNama: string
  userEmail: string
}

const AKSI_CONFIG: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  // Material documents
  SUBMIT: { label: 'Diajukan ke PPK', icon: Upload, color: 'text-amber-600 bg-amber-50' },
  APPROVE: { label: 'Disetujui', icon: CheckCircle2, color: 'text-green-600 bg-green-50' },
  REJECT: { label: 'Ditolak', icon: XCircle, color: 'text-red-600 bg-red-50' },
  PPK_APPROVE: { label: 'Divalidasi oleh PPK', icon: CheckCircle2, color: 'text-green-600 bg-green-50' },
  PPK_REJECT: { label: 'Ditolak oleh PPK', icon: XCircle, color: 'text-red-600 bg-red-50' },
  PPSPM_APPROVE: { label: 'Disetujui PPSPM', icon: CheckCircle2, color: 'text-green-600 bg-green-50' },
  PPSPM_REJECT: { label: 'Dikembalikan PPSPM', icon: XCircle, color: 'text-red-600 bg-red-50' },
  // Legacy aksi values from before the bendahara->ppspm rename. log_aktivitas is
  // append-only, so historical rows keep the old literal forever.
  BENDAHARA_APPROVE: { label: 'Disetujui PPSPM', icon: CheckCircle2, color: 'text-green-600 bg-green-50' },
  BENDAHARA_REJECT: { label: 'Dikembalikan PPSPM', icon: XCircle, color: 'text-red-600 bg-red-50' },
  RESUBMIT: { label: 'Diajukan ulang ke PPK', icon: Upload, color: 'text-amber-600 bg-amber-50' },
  RESUBMIT_PPK: { label: 'Diajukan ulang ke PPSPM', icon: ArrowRight, color: 'text-blue-600 bg-blue-50' },
  PPK_KEMBALIKAN: { label: 'Dikembalikan ke Pegawai', icon: XCircle, color: 'text-red-600 bg-red-50' },
  ARCHIVE: { label: 'Diarsipkan', icon: FileText, color: 'text-purple-600 bg-purple-50' },
  // Non-Material documents
  STORE: { label: 'Laporan kegiatan disimpan', icon: Upload, color: 'text-purple-600 bg-purple-50' },
  UPDATE: { label: 'Lampiran diperbarui', icon: FileText, color: 'text-blue-600 bg-blue-50' },
  DELETE: { label: 'Dokumen dihapus', icon: XCircle, color: 'text-red-600 bg-red-50' },
}

interface ActivityLogProps {
  dokumenId: string
  className?: string
}

type ActivityLogResponse = {
  logs?: LogEntry[]
  error?: string
}

export function ActivityLog({ dokumenId, className = '' }: ActivityLogProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!dokumenId) return

    setLoading(true)
    apiFetch<ActivityLogResponse>(`/dokumen/${dokumenId}/log`)
      .then(d => {
        if (d.error) {
          setError(d.error)
        } else {
          setLogs(d.logs ?? [])
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [dokumenId])

  if (loading) {
    return (
      <div className={`bg-[#FFFDF9] rounded-xl border border-outline-variant/30 p-5 ${className}`}>
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-on-surface">Riwayat Aktivitas</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`bg-[#FFFDF9] rounded-xl border border-outline-variant/30 p-5 ${className}`}>
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-on-surface">Riwayat Aktivitas</h3>
        </div>
        <p className="text-xs text-error">{error}</p>
      </div>
    )
  }

  return (
    <div className={`bg-[#FFFDF9] rounded-xl border border-outline-variant/30 p-5 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <Clock size={16} className="text-primary" />
        <h3 className="text-sm font-semibold text-on-surface">Riwayat Aktivitas</h3>
      </div>

      {logs.length === 0 ? (
        <p className="text-xs text-on-surface-variant text-center py-4">Belum ada aktivitas</p>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => {
            const config = AKSI_CONFIG[log.aksi] ?? { label: log.aksi, icon: FileText, color: 'text-gray-600 bg-gray-50' }
            const IconComponent = config.icon

            return (
              <div key={log.id} className="flex items-start gap-3 p-3 bg-surface-container-low/20 rounded-lg">
                <div className={`p-2 rounded-lg shrink-0 ${config.color}`}>
                  <IconComponent size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-on-surface">{config.label}</span>
                    {log.stepUrutan && (
                      <span className="text-[10px] text-on-surface-variant bg-surface-container-low px-1.5 py-0.5 rounded">
                        Step {log.stepUrutan}
                      </span>
                    )}
                  </div>
                  {log.catatan && (
                    <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">{log.catatan}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <User size={10} className="text-outline" />
                    <span className="text-[10px] text-outline">{log.userNama}</span>
                    <span className="text-[10px] text-outline">•</span>
                    <span className="text-[10px] text-outline">{formatDateTime(log.createdAt)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
