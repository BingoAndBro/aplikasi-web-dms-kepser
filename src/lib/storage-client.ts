export { formatDateTime } from './utils/format'

export const DESTROYED_FILE_MESSAGE = 'Data file sudah dimusnahkan'

type SignedUrlResult = {
  signedUrl?: string
  error?: string
}

export async function resolveSafeFileAccessErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  if (response.status !== 410) return fallback

  try {
    const payload = await response.json()
    if (
      payload
      && typeof payload === 'object'
      && 'error' in payload
      && payload.error === DESTROYED_FILE_MESSAGE
    ) {
      return DESTROYED_FILE_MESSAGE
    }
  } catch {
    return fallback
  }

  return fallback
}

export async function getSignedUrlFromApi(
  apiPath: string,
  fallback = 'Gagal memuat pratinjau',
): Promise<SignedUrlResult> {
  try {
    const res = await fetch(apiPath, { credentials: 'include' })
    if (!res.ok) {
      return { error: await resolveSafeFileAccessErrorMessage(res, fallback) }
    }

    const json = await res.json()
    const signedUrl = typeof json.signedUrl === 'string' ? json.signedUrl : ''

    return signedUrl ? { signedUrl } : { error: fallback }
  } catch {
    return { error: fallback }
  }
}

export async function getSignedUrlDirectResult(url: string): Promise<SignedUrlResult> {
  return getSignedUrlFromApi(
    `/api/dokumen/preview-url?url=${encodeURIComponent(url)}`,
    'Gagal memuat pratinjau',
  )
}

export async function getSignedUrl(url: string): Promise<string | null> {
  try {
    const result = await getSignedUrlDirectResult(url)
    return result.signedUrl ?? null
  } catch {
    return null
  }
}

export async function fetchFileBlobWithSignedUrl(
  signedUrl: string,
  fallback = 'Gagal memuat pratinjau',
): Promise<{ blob?: Blob; error?: string }> {
  try {
    const response = await fetch(signedUrl, { credentials: 'include' })
    if (!response.ok) {
      return { error: await resolveSafeFileAccessErrorMessage(response, fallback) }
    }

    return { blob: await response.blob() }
  } catch {
    return { error: fallback }
  }
}

export async function downloadFromApi(
  apiPath: string,
  filename: string
): Promise<{ error?: string }> {
  try {
    const res = await fetch(apiPath, { credentials: 'include' })
    if (!res.ok) {
      return { error: await resolveSafeFileAccessErrorMessage(res, 'Gagal mengunduh file') }
    }

    const json = await res.json()
    const signedUrl = typeof json.signedUrl === 'string' ? json.signedUrl : ''

    if (!signedUrl) {
      return { error: 'Gagal mengunduh file' }
    }

    const result = await downloadWithSignedUrl(signedUrl, filename)
    return result
  } catch {
    return { error: 'Gagal mengunduh file' }
  }
}

export async function downloadWithSignedUrl(
  signedUrl: string,
  filename: string
): Promise<{ error?: string }> {
  try {
    const response = await fetch(signedUrl, { credentials: 'include' })
    if (!response.ok) {
      return {
        error: await resolveSafeFileAccessErrorMessage(response, 'Gagal mengunduh file'),
      }
    }

    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    return {}
  } catch (err) {
    console.error('[storage-client] downloadWithSignedUrl error:', err)
    return { error: 'Gagal mengunduh file' }
  }
}
