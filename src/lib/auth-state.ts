import { ROLE_NAMES } from './constants/roles'
import type { RoleName } from './types/auth'

const AUTH_STATE_STORAGE_KEY = 'dms_client_auth_state'

type ClientAuthStatus = 'unknown' | 'authenticated' | 'unauthenticated'

export type ClientAuthState = {
  status: ClientAuthStatus
  userId?: string
  username?: string
  roles: RoleName[]
  activeRole?: RoleName
  isReady: boolean
}

const emptyAuthState: ClientAuthState = {
  status: 'unknown',
  roles: [],
  isReady: false,
}

let currentAuthState: ClientAuthState = emptyAuthState

function isRoleName(value: unknown): value is RoleName {
  return typeof value === 'string' && ROLE_NAMES.includes(value as RoleName)
}

function normalizeRoles(value: unknown): RoleName[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRoleName)
}

function readStoredAuthState(): ClientAuthState | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.sessionStorage.getItem(AUTH_STATE_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<ClientAuthState>
    if (parsed.status !== 'authenticated') return null

    const roles = normalizeRoles(parsed.roles)
    return {
      status: 'authenticated',
      userId: typeof parsed.userId === 'string' ? parsed.userId : undefined,
      username: typeof parsed.username === 'string' ? parsed.username : undefined,
      roles,
      activeRole: isRoleName(parsed.activeRole) ? parsed.activeRole : undefined,
      isReady: true,
    }
  } catch {
    return null
  }
}

function writeStoredAuthState(state: ClientAuthState) {
  if (typeof window === 'undefined') return

  try {
    if (state.status !== 'authenticated') {
      window.sessionStorage.removeItem(AUTH_STATE_STORAGE_KEY)
      return
    }

    window.sessionStorage.setItem(AUTH_STATE_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Memory state is still the source of truth for this tab.
  }
}

export function getClientAuthState(): ClientAuthState {
  if (currentAuthState.status === 'unknown') {
    const storedState = readStoredAuthState()
    if (storedState) {
      currentAuthState = storedState
    }
  }

  return currentAuthState
}

export function setClientAuthState(state: ClientAuthState) {
  currentAuthState = {
    ...state,
    roles: normalizeRoles(state.roles),
    activeRole: isRoleName(state.activeRole) ? state.activeRole : undefined,
    isReady: state.isReady,
  }
  writeStoredAuthState(currentAuthState)
}

export function updateClientAuthState(patch: Partial<ClientAuthState>) {
  setClientAuthState({
    ...getClientAuthState(),
    ...patch,
  })
}

export function clearClientAuthState(
  status: Exclude<ClientAuthStatus, 'authenticated'> = 'unknown',
  isReady = false,
) {
  currentAuthState = {
    status,
    roles: [],
    isReady,
  }
  writeStoredAuthState(currentAuthState)
}
