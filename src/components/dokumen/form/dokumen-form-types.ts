export type { LampiranUrl } from '#/lib/dokumen-helpers'
export type {
  FungsiRow,
  KegiatanRow,
  KomponenRow,
  JenisRow,
  KategoriRow,
  DetailRow,
} from '#/lib/master-data'

export interface FormState {
  fungsiId: string
  fungsiNama: string
  tahun: number
  tanggal: string
}

type SetFieldAction = {
  [K in keyof FormState]: {
    type: 'SET_FIELD'
    field: K
    value: FormState[K]
  }
}[keyof FormState]

type ResetFormAction = {
  type: 'RESET_FORM'
  state: FormState
}

export type FormAction = SetFieldAction | ResetFormAction
