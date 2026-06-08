import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const profileSource = readFileSync('src/routes/profile.tsx', 'utf8')
const profileApiSource = readFileSync('src/routes/api/users/me.ts', 'utf8')
const avatarHelperSource = readFileSync('src/lib/storage/profile-avatar.ts', 'utf8')

describe('profile avatar source guard', () => {
  it('keeps Profile visual parity labels and self-service actions', () => {
    expect(profileSource).toContain('Kelola informasi akun, foto profil, dan keamanan password Anda.')
    expect(profileSource).toContain('Unggah Foto')
    expect(profileSource).toContain('Ganti Password')
    expect(profileSource).toContain('Akun Aktif')
    expect(profileSource).toContain('Informasi Akun')
    expect(profileSource).toContain('Hak Akses')
    expect(profileSource).toContain('Penugasan Ketua Tim')
    expect(profileSource).toContain('Keluar')
  })

  it('uses the profile avatar API and keeps document preview/download out of Profile avatar handling', () => {
    expect(profileSource).toContain("apiMutation<AvatarMutationResponse>('/api/users/me?avatar=1'")
    expect(profileSource).toContain("method: 'DELETE'")
    expect(profileSource).toContain('accept="image/jpeg,image/png,image/webp"')
    expect(profileSource).not.toContain('AttachmentViewer')
    expect(profileSource).not.toContain('/api/files/access')
    expect(profileSource).not.toContain('download')
  })

  it('protects avatar writes with same-origin and local dms session auth', () => {
    expect(profileApiSource).toContain('requireSameOrigin(request)')
    expect(profileApiSource).toContain('getLocalServerSession(request)')
    expect(profileApiSource).toContain("new URL(request.url).searchParams.get('avatar') !== '1'")
    expect(profileApiSource).toContain('writeProfileAvatarContent')
    expect(profileApiSource).toContain('removeProfileAvatarContent')
    expect(profileApiSource).toContain('avatar_url: createProfileAvatarUrl')
  })

  it('keeps avatar storage separate from document/archive attachments and rejects svg by omission', () => {
    expect(avatarHelperSource).toContain("const AVATAR_ROOT_SEGMENT = 'profile-avatars'")
    expect(avatarHelperSource).toContain("'image/jpeg'")
    expect(avatarHelperSource).toContain("'image/png'")
    expect(avatarHelperSource).toContain("'image/webp'")
    expect(avatarHelperSource).not.toContain('image/svg')
    expect(avatarHelperSource).not.toContain('AttachmentViewer')
    expect(avatarHelperSource).not.toContain('dokumen_transaksi')
    expect(avatarHelperSource).not.toContain('manual_arsip')
  })
})
