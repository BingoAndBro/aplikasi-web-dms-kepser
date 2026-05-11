import { ApiError, apiFetch, type ApiFetchOptions } from './api-client'

export type ApiMutationMethod = 'POST' | 'PATCH' | 'DELETE'

type ApiMutationBody = BodyInit | Record<string, unknown> | unknown[] | null

export interface ApiMutationOptions
  extends Omit<ApiFetchOptions, 'body' | 'method'> {
  method?: ApiMutationMethod
  body?: ApiMutationBody
}

function isJsonBody(
  body: ApiMutationBody | undefined,
): body is Record<string, unknown> | unknown[] {
  if (!body || typeof body !== 'object') {
    return false
  }

  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return false
  }

  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return false
  }

  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return false
  }

  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return false
  }

  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    return false
  }

  return true
}

function normalizeApiErrorMessage(error: ApiError): string {
  const { payload } = error

  if (payload && typeof payload === 'object' && 'error' in payload) {
    const payloadError = (payload as { error?: unknown }).error
    if (typeof payloadError === 'string') {
      return payloadError
    }
  }

  return error.message
}

export async function apiMutation<T = unknown>(
  endpoint: string,
  options: ApiMutationOptions = {},
): Promise<T> {
  const {
    method = 'POST',
    body,
    ...requestOptions
  } = options

  const requestBody = isJsonBody(body) ? JSON.stringify(body) : body ?? undefined

  try {
    return await apiFetch<T>(endpoint, {
      ...requestOptions,
      method,
      ...(requestBody !== undefined ? { body: requestBody } : {}),
    })
  } catch (error) {
    if (error instanceof ApiError) {
      throw new ApiError(error.status, error.payload, normalizeApiErrorMessage(error))
    }

    throw error
  }
}

export { ApiError }
