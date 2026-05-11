import type { FormAction, FormState } from './dokumen-form-types'

export function dokumenFormReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_FIELD':
      return {
        ...state,
        [action.field]: action.value,
      }
    case 'RESET_FORM':
      return action.state
    default:
      return state
  }
}
