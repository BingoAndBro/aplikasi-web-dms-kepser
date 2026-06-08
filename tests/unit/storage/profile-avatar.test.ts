import { rm } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'

import {
  createProfileAvatarUrl,
  ProfileAvatarError,
  PROFILE_AVATAR_MAX_BYTES,
  readProfileAvatarContent,
  removeProfileAvatarContent,
  validateProfileAvatarFileMetadata,
  writeProfileAvatarContent,
} from '#/lib/storage/profile-avatar'

const TEST_ROOT = path.resolve('.tmp', 'profile-avatar-root')
const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00,
])
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])
const WEBP_BYTES = Buffer.from('RIFFxxxxWEBPVP8 ', 'ascii')

describe('profile avatar storage helper', () => {
  beforeEach(async () => {
    await rm(TEST_ROOT, { force: true, recursive: true })
  })

  afterEach(async () => {
    await rm(TEST_ROOT, { force: true, recursive: true })
  })

  it('accepts png, jpeg, and webp metadata within the size cap', () => {
    expect(validateProfileAvatarFileMetadata({
      name: 'profile.png',
      type: 'image/png',
      size: 10,
    })).toMatchObject({ mimeType: 'image/png', extension: 'png', size: 10 })

    expect(validateProfileAvatarFileMetadata({
      name: 'profile.jpeg',
      type: 'image/jpeg',
      size: PROFILE_AVATAR_MAX_BYTES,
    })).toMatchObject({ mimeType: 'image/jpeg', extension: 'jpeg' })

    expect(validateProfileAvatarFileMetadata({
      name: 'profile.webp',
      type: 'image/webp',
      size: 10,
    })).toMatchObject({ mimeType: 'image/webp', extension: 'webp' })
  })

  it('rejects invalid MIME types, svg, mismatched extensions, and oversize files', () => {
    expect(() => validateProfileAvatarFileMetadata({
      name: 'profile.svg',
      type: 'image/svg+xml',
      size: 10,
    })).toThrow(ProfileAvatarError)

    expect(() => validateProfileAvatarFileMetadata({
      name: 'profile.png',
      type: 'image/jpeg',
      size: 10,
    })).toThrow(ProfileAvatarError)

    expect(() => validateProfileAvatarFileMetadata({
      name: 'profile.png',
      type: 'image/png',
      size: PROFILE_AVATAR_MAX_BYTES + 1,
    })).toThrow(ProfileAvatarError)
  })

  it('writes and reads avatar content under a dedicated avatar folder without exposing physical paths', async () => {
    const stored = await writeProfileAvatarContent({
      root: TEST_ROOT,
      ownerUserId: OWNER_ID,
      file: {
        name: 'profile.png',
        type: 'image/png',
        size: PNG_BYTES.byteLength,
      },
      content: PNG_BYTES,
    })

    expect(stored.storageKey).toMatch(new RegExp(`^profile-avatars/${OWNER_ID}/[0-9a-f-]+\\.png$`))
    expectNoPhysicalPathExposure(stored)

    const content = await readProfileAvatarContent(stored.storageKey, { root: TEST_ROOT })
    expect(content?.equals(PNG_BYTES)).toBe(true)
  })

  it('rejects content signature mismatches before writing', async () => {
    await expect(writeProfileAvatarContent({
      root: TEST_ROOT,
      ownerUserId: OWNER_ID,
      file: {
        name: 'profile.png',
        type: 'image/png',
        size: JPEG_BYTES.byteLength,
      },
      content: JPEG_BYTES,
    })).rejects.toMatchObject({ code: 'invalid-file-signature' })
  })

  it('removes previous avatar content when requested by caller', async () => {
    const stored = await writeProfileAvatarContent({
      root: TEST_ROOT,
      ownerUserId: OWNER_ID,
      file: {
        name: 'profile.webp',
        type: 'image/webp',
        size: WEBP_BYTES.byteLength,
      },
      content: WEBP_BYTES,
    })

    await removeProfileAvatarContent(stored.storageKey, { root: TEST_ROOT })

    expect(await readProfileAvatarContent(stored.storageKey, { root: TEST_ROOT })).toBeNull()
  })

  it('returns only a safe display URL for profile consumption', () => {
    const url = createProfileAvatarUrl('2026-06-08T01:02:03.000Z')

    expect(url).toBe('/api/users/me?avatar=1&v=2026-06-08T01%3A02%3A03.000Z')
    expect(url).not.toContain(TEST_ROOT)
    expect(url).not.toContain('profile-avatars')
  })
})

function expectNoPhysicalPathExposure(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain(TEST_ROOT)
  expect(serialized).not.toContain(TEST_ROOT.replace(/\\/g, '/'))
}
