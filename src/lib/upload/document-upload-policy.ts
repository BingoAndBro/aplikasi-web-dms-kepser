export const DOCUMENT_UPLOAD_MAX_BYTES = 5 * 1024 * 1024

export const DOCUMENT_UPLOAD_ALLOWED_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'jpg',
  'jpeg',
  'png',
] as const

export const DOCUMENT_UPLOAD_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
] as const

export type DocumentUploadAllowedExtension = typeof DOCUMENT_UPLOAD_ALLOWED_EXTENSIONS[number]
export type DocumentUploadAllowedMimeType = typeof DOCUMENT_UPLOAD_ALLOWED_MIME_TYPES[number]

export const DOCUMENT_UPLOAD_EXTENSIONS_BY_MIME_TYPE: Record<
  DocumentUploadAllowedMimeType,
  readonly DocumentUploadAllowedExtension[]
> = {
  'application/pdf': ['pdf'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
}

export const DOCUMENT_UPLOAD_ACCEPT = DOCUMENT_UPLOAD_ALLOWED_EXTENSIONS
  .map((extension) => `.${extension}`)
  .join(',')

export const DOCUMENT_UPLOAD_HELPER_TEXT =
  'PDF, DOC, DOCX, XLS, XLSX, JPG, atau PNG • Maks. 5 MB'

export const DOCUMENT_UPLOAD_INVALID_FORMAT_MESSAGE =
  'Format file tidak didukung. Gunakan PDF, DOC, DOCX, XLS, XLSX, JPG, atau PNG.'
export const DOCUMENT_UPLOAD_TOO_LARGE_MESSAGE =
  'Ukuran file terlalu besar. Maksimal 5 MB per file.'
export const DOCUMENT_UPLOAD_INVALID_FILE_MESSAGE = 'File tidak valid. Pilih file lain.'
export const DOCUMENT_UPLOAD_GENERIC_FAILURE_MESSAGE = 'Gagal mengunggah file. Coba lagi.'
export const DOCUMENT_UPLOAD_MULTIPLE_FAILURE_MESSAGE =
  'Beberapa file tidak dapat diunggah. Periksa format dan ukuran file.'
export const DOCUMENT_PREVIEW_PDF_ONLY_TITLE = 'Preview hanya tersedia untuk file PDF.'
export const DOCUMENT_PREVIEW_PDF_ONLY_BODY = 'Silakan unduh file ini untuk membukanya.'

export type DocumentUploadValidationUiMessage = {
  title: string
  description: string
  actionLabel: string
}

export const DOCUMENT_UPLOAD_INVALID_FORMAT_UI_MESSAGE: DocumentUploadValidationUiMessage = {
  title: 'Format tidak didukung',
  description: 'Gunakan PDF, DOC, DOCX, XLS, XLSX, JPG, atau PNG. Maksimal 5 MB.',
  actionLabel: 'Pilih File Lain',
}

export const DOCUMENT_UPLOAD_TOO_LARGE_UI_MESSAGE: DocumentUploadValidationUiMessage = {
  title: 'Ukuran file terlalu besar',
  description: 'Maksimal 5 MB per file.',
  actionLabel: 'Pilih File Lain',
}

export const DOCUMENT_UPLOAD_INVALID_FILE_UI_MESSAGE: DocumentUploadValidationUiMessage = {
  title: 'File tidak valid',
  description: 'Pilih file lain dengan format yang didukung.',
  actionLabel: 'Pilih File Lain',
}

export const DOCUMENT_UPLOAD_GENERIC_FAILURE_UI_MESSAGE: DocumentUploadValidationUiMessage = {
  title: 'Gagal mengunggah file',
  description: 'Coba lagi atau pilih file lain.',
  actionLabel: 'Coba Lagi',
}

export type DocumentUploadFileMetadata = {
  name: string
  type: string
  size: number
}

export function isAllowedDocumentUploadMimeType(value: string): value is DocumentUploadAllowedMimeType {
  return DOCUMENT_UPLOAD_ALLOWED_MIME_TYPES.includes(value as DocumentUploadAllowedMimeType)
}

export function isAllowedDocumentUploadExtension(value: string): value is DocumentUploadAllowedExtension {
  return DOCUMENT_UPLOAD_ALLOWED_EXTENSIONS.includes(value as DocumentUploadAllowedExtension)
}

export function getAllowedDocumentUploadExtensionsForMimeType(
  mimeType: DocumentUploadAllowedMimeType,
): readonly DocumentUploadAllowedExtension[] {
  return DOCUMENT_UPLOAD_EXTENSIONS_BY_MIME_TYPE[mimeType]
}

export function getDocumentUploadExtension(filename: string): string {
  const leaf = filename.split(/[\\/]/).pop() ?? ''
  const dotIndex = leaf.lastIndexOf('.')
  if (dotIndex < 0 || dotIndex === leaf.length - 1) return ''
  return leaf.slice(dotIndex + 1).toLowerCase()
}

export function isPdfLikeFilename(filename: string): boolean {
  return getDocumentUploadExtension(filename.split('?')[0] ?? '') === 'pdf'
}

export function validateDocumentUploadClientFileMetadata(
  file: DocumentUploadFileMetadata,
): string | null {
  const extension = getDocumentUploadExtension(file.name)
  const mimeType = file.type.trim().toLowerCase()

  if (!isAllowedDocumentUploadExtension(extension)) {
    return DOCUMENT_UPLOAD_INVALID_FORMAT_MESSAGE
  }

  if (!isAllowedDocumentUploadMimeType(mimeType)) {
    return DOCUMENT_UPLOAD_INVALID_FORMAT_MESSAGE
  }

  if (!DOCUMENT_UPLOAD_EXTENSIONS_BY_MIME_TYPE[mimeType].includes(extension)) {
    return DOCUMENT_UPLOAD_INVALID_FORMAT_MESSAGE
  }

  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    return DOCUMENT_UPLOAD_INVALID_FILE_MESSAGE
  }

  if (file.size > DOCUMENT_UPLOAD_MAX_BYTES) {
    return DOCUMENT_UPLOAD_TOO_LARGE_MESSAGE
  }

  return null
}

export function getDocumentUploadValidationUiMessage(
  message: string,
): DocumentUploadValidationUiMessage {
  if (message === DOCUMENT_UPLOAD_INVALID_FORMAT_MESSAGE) {
    return DOCUMENT_UPLOAD_INVALID_FORMAT_UI_MESSAGE
  }

  if (message === DOCUMENT_UPLOAD_TOO_LARGE_MESSAGE) {
    return DOCUMENT_UPLOAD_TOO_LARGE_UI_MESSAGE
  }

  if (message === DOCUMENT_UPLOAD_INVALID_FILE_MESSAGE) {
    return DOCUMENT_UPLOAD_INVALID_FILE_UI_MESSAGE
  }

  return DOCUMENT_UPLOAD_GENERIC_FAILURE_UI_MESSAGE
}

export function matchesDocumentUploadSignature(
  content: ArrayBuffer | Uint8Array,
  mimeType: DocumentUploadAllowedMimeType,
): boolean {
  const bytes = content instanceof ArrayBuffer
    ? new Uint8Array(content)
    : new Uint8Array(content.buffer, content.byteOffset, content.byteLength)

  if (mimeType === 'application/pdf') {
    return startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])
  }

  if (mimeType === 'image/jpeg') {
    return startsWithBytes(bytes, [0xff, 0xd8, 0xff])
  }

  if (mimeType === 'image/png') {
    return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  }

  if (mimeType === 'application/msword' || mimeType === 'application/vnd.ms-excel') {
    return startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  }

  return startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04])
    || startsWithBytes(bytes, [0x50, 0x4b, 0x05, 0x06])
    || startsWithBytes(bytes, [0x50, 0x4b, 0x07, 0x08])
}

function startsWithBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false

  return signature.every((value, index) => bytes[index] === value)
}
