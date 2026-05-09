export { formatDateTime } from './utils/format'

export async function getSignedUrlDirect(url: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/dokumen/preview-url?url=${encodeURIComponent(url)}`, {
      credentials: 'include',
    })
    const json = await res.json()
    return json.signedUrl || null
  } catch {
    return null
  }
}

export const getSignedUrl = getSignedUrlDirect

export async function downloadFromApi(
  apiPath: string,
  filename: string
): Promise<{ error?: string }> {
  try {
    const res = await fetch(apiPath, { credentials: 'include' })
    const json = await res.json()
    const signedUrl = json.signedUrl || null

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
    const response = await fetch(signedUrl)
    if (!response.ok) return { error: 'Gagal mengunduh file' }

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
