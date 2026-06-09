import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const profileSource = readFileSync('src/routes/profile.tsx', 'utf8')
const profileApiSource = readFileSync('src/routes/api/users/me.ts', 'utf8')
const avatarHelperSource = readFileSync('src/lib/storage/profile-avatar.ts', 'utf8')
const appLayoutSource = readFileSync('src/components/layout/AppLayout.tsx', 'utf8')
const userDropdownSource = readFileSync('src/components/layout/UserDropdown.tsx', 'utf8')

describe('profile avatar source guard', () => {
  it('keeps Profile visual parity labels and self-service actions', () => {
    expect(profileSource).toContain('Kelola informasi akun, foto profil, dan keamanan password Anda.')
    expect(profileSource).toContain('Unggah Foto')
    expect(profileSource).toContain('Ganti Password')
    expect(profileSource).toContain('Akun Aktif')
    expect(profileSource).toContain('Informasi Akun')
    expect(profileSource).toContain('Hak Akses')
    expect(profileSource).toContain('Penugasan')
    expect(profileSource).toContain('Ketua Tim')
    expect(profileSource).toContain('Sign Out')
  })

  it('uses the profile avatar API and keeps document preview/download out of Profile avatar handling', () => {
    expect(profileSource).toContain("apiMutation<AvatarMutationResponse>('/api/users/me?avatar=1'")
    expect(profileSource).toContain("method: 'DELETE'")
    expect(profileSource).toContain('accept="image/jpeg,image/png,image/webp"')
    expect(profileSource).toContain('dms:profile-avatar-changed')
    expect(profileSource).not.toContain('AttachmentViewer')
    expect(profileSource).not.toContain('/api/files/access')
    expect(profileSource).not.toContain('download')
  })

  it('consumes safe avatar URLs in the authenticated shell with initials fallback', () => {
    expect(appLayoutSource).toContain("apiFetch<CurrentUserProfileResponse>('/users/me/')")
    expect(appLayoutSource).toContain('avatar_url')
    expect(appLayoutSource).toContain('dms:profile-avatar-changed')
    expect(userDropdownSource).toContain('UserAvatar')
    expect(userDropdownSource).toContain('avatarUrl')
    expect(userDropdownSource).toContain('initials')
  })

  it('keeps Profile avatar upload messages user-facing', () => {
    expect(profileSource).toContain('JPG, PNG, atau WebP • Maks. 2 MB')
    expect(profileSource).toContain('Foto akan digunakan di topbar dan menu akun.')
    expect(profileSource).toContain('Foto profil berhasil diperbarui.')
    expect(profileSource).toContain('Foto profil berhasil dihapus.')
    expect(profileSource).toContain('Format foto tidak didukung. Gunakan JPG, PNG, atau WebP.')
    expect(profileSource).toContain('Ukuran foto terlalu besar. Maksimal 2 MB.')
    expect(profileSource).toContain('File foto tidak valid. Pilih gambar lain.')
    expect(profileSource).toContain('Gagal mengunggah foto profil. Coba lagi.')
    expect(profileSource).toContain('Gagal menghapus foto profil. Coba lagi.')
    expect(profileSource).not.toContain('Fitur foto profil belum siap. Jalankan migrasi avatar profil terlebih dahulu.')
  })

  it('protects avatar writes with same-origin and local dms session auth', () => {
    expect(profileApiSource).toContain('requireSameOrigin(request)')
    expect(profileApiSource).toContain('getLocalServerSession(request)')
    expect(profileApiSource).toContain("new URL(request.url).searchParams.get('avatar') !== '1'")
    expect(profileApiSource).toContain('writeProfileAvatarContent')
    expect(profileApiSource).toContain('removeProfileAvatarContent')
    expect(profileApiSource).toContain('const avatarUrl = hasDisplayableAvatar')
    expect(profileApiSource).toContain('avatar_url: avatarUrl')
    expect(profileApiSource).toContain('hasProfileAvatarColumns')
    expect(profileApiSource).toContain('information_schema.columns')
    expect(profileApiSource).toContain('Fitur foto profil belum siap')
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
