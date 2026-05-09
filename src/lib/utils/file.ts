export function sanitizeFilename(str: string): string {
  return str.replace(/[\/\\:*?"<>|]/g, '_').replace(/_+/g, '_')
}

export function extractExtension(filename: string): string {
  const lastDotIdx = filename.lastIndexOf('.')
  return lastDotIdx > 0 && lastDotIdx < filename.length - 1
    ? filename.slice(lastDotIdx + 1).toLowerCase()
    : ''
}

export function extractFilenameFromPath(url: string): string {
  const pathParts = url.split('/')
  const filenameWithExt = pathParts[pathParts.length - 1] || 'download'

  const dashMatch = filenameWithExt.match(/^\d{13}-[a-zA-Z0-9]+-(.+)$/)
  if (dashMatch) {
    return dashMatch[1]
  }

  return filenameWithExt
}

export function isPendingFile(lampiranUrl: string): boolean {
  const pathParts = lampiranUrl.split('/')
  const filenameWithExt = pathParts[pathParts.length - 1] || 'download'
  return /^\d{13}-[a-zA-Z0-9]+-.+$/.test(filenameWithExt)
}
