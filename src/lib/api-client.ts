const API_PREFIX = '/api'

type ApiQueryPrimitive = string | number | boolean | null | undefined
type ApiQueryValue = ApiQueryPrimitive | ApiQueryPrimitive[]

export type ApiQueryParams =
  | URLSearchParams
  | Record<string, ApiQueryValue>

export interface ApiFetchOptions extends RequestInit {
  query?: ApiQueryParams
  parseAs?: 'json' | 'text' | 'blob' | 'arrayBuffer' | 'formData'
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public payload: unknown,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function buildApiUrl(endpoint: string, query?: ApiQueryParams): string {
  const normalizedEndpoint = endpoint.startsWith(API_PREFIX)
    ? endpoint
    : `${API_PREFIX}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`

  if (!query) {
    return normalizedEndpoint
  }

  const searchParams = new URLSearchParams()

  if (query instanceof URLSearchParams) {
    query.forEach((value, key) => {
      searchParams.append(key, value)
    })
  } else {
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item !== null && item !== undefined) {
            searchParams.append(key, String(item))
          }
        }
        continue
      }

      if (value !== null && value !== undefined) {
        searchParams.append(key, String(value))
      }
    }
  }

  const queryString = searchParams.toString()
  if (!queryString) {
    return normalizedEndpoint
  }

  return normalizedEndpoint.includes('?')
    ? `${normalizedEndpoint}&${queryString}`
    : `${normalizedEndpoint}?${queryString}`
}

async function parseResponsePayload(
  response: Response,
  parseAs: NonNullable<ApiFetchOptions['parseAs']>,
): Promise<unknown> {
  if (parseAs === 'blob') {
    return response.blob()
  }

  if (parseAs === 'arrayBuffer') {
    return response.arrayBuffer()
  }

  if (parseAs === 'formData') {
    return response.formData()
  }

  if (parseAs === 'text') {
    return response.text()
  }

  const text = await response.text()
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function getApiErrorMessage(payload: unknown, response: Response): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const errorMessage = payload.error
    if (typeof errorMessage === 'string' && errorMessage) {
      return errorMessage
    }
  }

  return response.statusText || 'Request failed'
}

export async function apiFetch<T>(
  endpoint: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const {
    query,
    parseAs = 'json',
    headers: initHeaders,
    ...requestInit
  } = options

  const headers = new Headers(initHeaders)
  const isFormData = requestInit.body instanceof FormData

  if (!isFormData && requestInit.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(buildApiUrl(endpoint, query), {
    credentials: 'include',
    ...requestInit,
    headers,
  })

  const payload = await parseResponsePayload(response, parseAs)

  if (!response.ok) {
    throw new ApiError(response.status, payload, getApiErrorMessage(payload, response))
  }

  return payload as T
}
