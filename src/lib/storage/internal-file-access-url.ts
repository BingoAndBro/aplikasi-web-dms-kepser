// Server-only module. Do not import from client components.
import {
  signFileAccessToken,
  type FileAccessTokenPayload,
} from '#/lib/storage/file-access-token'

export const INTERNAL_FILE_ACCESS_PATH = '/api/files/access'

export type CreateInternalFileAccessUrlParams = {
  payload: FileAccessTokenPayload
  secret: string
}

export function createInternalFileAccessUrl({
  payload,
  secret,
}: CreateInternalFileAccessUrlParams): string {
  const token = signFileAccessToken(payload, secret)
  const searchParams = new URLSearchParams({ token })

  return `${INTERNAL_FILE_ACCESS_PATH}?${searchParams.toString()}`
}
