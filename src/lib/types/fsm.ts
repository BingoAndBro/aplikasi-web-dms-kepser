// src/lib/types/fsm.ts
// Finite State Machine types for document status transitions
// This file is the single source of truth for FSM types
// Used by: src/lib/fsm.ts, and all consumer specs (03, 04, 05)

/** Status dokumen — 6 kemungkinan status */
export type StatusDokumen =
  | 'DRAFT' // Belum diajukan
  | 'IN_PPK_VALIDATION' // Sedang divalidasi PPK
  | 'IN_BENDAHARA_APPROVAL' // Sedang disetujui Bendahara
  | 'NEED_REVISION' // Ditolak — ada yang perlu diperbaiki
  | 'COMPLETED' // Selesai semua persetujuan
  | 'ARCHIVED' // Sudah diarsipkan Arsiparis

/** Step saat ini dalam alur berjenjang. null saat DRAFT, COMPLETED, ARCHIVED */
export type CurrentStep = 'PPK' | 'BENDAHARA' | null

/** Target revisi — siapa yang perlu memperbaiki. null saat tidak ada revision pending */
export type RevisionTarget = 'USER' | 'PPK' | null

/** Aksi yang bisa dilakukan pada dokumen */
export type FSMAction =
  | 'SUBMIT' // Pegawai ajukan dokumen
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
