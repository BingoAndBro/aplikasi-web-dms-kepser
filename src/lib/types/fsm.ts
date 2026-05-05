// src/lib/types/fsm.ts
// Finite State Machine types for document status transitions
// This file is the single source of truth for FSM types

/** Status dokumen — 7 kemungkinan status */
export type StatusDokumen =
  | 'DRAFT' // Belum diajukan / draft
  | 'IN_PPK_VALIDATION' // Sedang divalidasi PPK (Material)
  | 'IN_BENDAHARA_APPROVAL' // Sedang disetujui Bendahara (Material)
  | 'NEED_REVISION' // Ditolak — ada yang perlu diperbaiki
  | 'COMPLETED' // Selesai semua persetujuan (Material)
  | 'TERSIMPAN' // Dokumen Non-Material tersimpan
  | 'ARCHIVED' // Sudah diarsipkan Arsiparis

/** Step saat ini dalam alur berjenjang. null saat DRAFT, COMPLETED, ARCHIVED */
export type CurrentStep = 'PPK' | 'BENDAHARA' | null

/** Target revisi — siapa yang perlu memperbaiki. null saat tidak ada revision pending */
export type RevisionTarget = 'USER' | 'PPK' | null

/** Aksi yang bisa dilakukan pada dokumen */
export type FSMAction =
  | 'SUBMIT' // Pegawai ajukan dokumen Material
  | 'APPROVE' // PPK/Bendahara approve
  | 'REJECT' // PPK/Bendahara reject dari validasi/approval
  | 'RESUBMIT' // USER resubmit setelah perbaikan (target=USER)
  | 'RESUBMIT_PPK' // PPK resubmit setelah Bendahara reject (target=PPK)
  | 'KEMBALIKAN' // PPK kembalikan ke USER dari revision page (target=PPK -> USER)
  | 'ARCHIVE' // Arsiparis arsipkan
  | 'SKIP' // Arsiparis skip (tidak arsip, tetap COMPLETED)

/** Return type dari transition() */
export interface TransitionResult {
  success: boolean
  newStatus: StatusDokumen
  newCurrentStep: CurrentStep
  newRevisionTarget: RevisionTarget
  /** Step ke berapa saat aksi dilakukan (untuk log_aktivitas). null untuk ARCHIVE/SKIP */
  stepUrutan: number | null
  error?: string
}
