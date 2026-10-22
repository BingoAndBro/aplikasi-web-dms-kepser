// Server-only module. Do not import from client components.
//
// Orkestrasi "Hubungkan" (SPEC 7.1 langkah 4-6) yang dipanggil rute
// POST /api/admin/google-drive/hubungkan. Panggilan jaringan (tukar code,
// folder akar) berjalan di luar transaksi DB; baru setelah itu akun disimpan
// dalam satu transaksi (akun-repository.ts). Refresh token hanya keluar dari
// modul ini dalam bentuk terenkripsi.
import {
  cariAkunBelumDiputus,
  muatAkunUntukJob,
  simpanAkunTerhubung,
  AkunDriveError,
  type AkunTerhubung,
} from '#/lib/google-drive/akun-repository'
import { DRIVE_ROOT_FOLDER_NAME, type DriveConfig } from '#/lib/google-drive/config'
import { createGoogleDriveClient, type DriveClient } from '#/lib/google-drive/drive-client'
import {
  OAuthFlowError,
  ambilState,
  parsePastedAddress,
  tukarCode,
  type OAuthDeps,
} from '#/lib/google-drive/oauth'
import { encryptRefreshToken } from '#/lib/google-drive/token-crypto'

export type AkunConnectRepo = {
  cariAkunBelumDiputus: typeof cariAkunBelumDiputus
  muatAkunUntukJob: typeof muatAkunUntukJob
  simpanAkunTerhubung: typeof simpanAkunTerhubung
}

export type AkunConnectDeps = {
  config: DriveConfig
  createOAuthClient?: OAuthDeps['createOAuthClient']
  driveClientForToken?: (refreshToken: string) => DriveClient
  repo?: AkunConnectRepo
}

const defaultRepo: AkunConnectRepo = { cariAkunBelumDiputus, muatAkunUntukJob, simpanAkunTerhubung }

/** Folder akar lama dipakai bila masih ada; selain itu dibuat baru (SPEC 7.1 langkah 5, P5). */
async function pastikanFolderAkar(drive: DriveClient, rootLama: string | null): Promise<string> {
  if (rootLama && await drive.fileExists(rootLama)) return rootLama
  const { id } = await drive.createFolder({ name: DRIVE_ROOT_FOLDER_NAME, appProperties: { dmsJenis: 'AKAR' } })
  return id
}

export async function hubungkanDariAlamat({
  alamat,
  session,
  now,
  deps,
}: {
  alamat: string
  session: { sessionId: string; userId: string }
  now: Date
  deps: AkunConnectDeps
}): Promise<AkunTerhubung> {
  const repo = deps.repo ?? defaultRepo
  const parsed = parsePastedAddress(alamat)
  const state = ambilState({ state: parsed.state, sessionId: session.sessionId, now })
  if (parsed.kind === 'error') throw new OAuthFlowError('IZIN_DITOLAK')

  const oauthDeps: OAuthDeps = { config: deps.config, createOAuthClient: deps.createOAuthClient }
  const { refreshToken, email } = await tukarCode({ code: parsed.code, codeVerifier: state.codeVerifier, deps: oauthDeps })

  // Hubungkan ulang: tolak email berbeda sebelum membuat apa pun di Drive akun itu.
  if (state.mode === 'HUBUNGKAN_ULANG') {
    const target = state.akunId ? await repo.muatAkunUntukJob(state.akunId) : null
    if (!target || target.status === 'DIPUTUS') throw new AkunDriveError('AKUN_BERUBAH')
    if (target.email !== email) throw new AkunDriveError('EMAIL_BERBEDA')
  }

  const dipakaiUlang = await repo.cariAkunBelumDiputus(email)
  const drive = (deps.driveClientForToken
    ?? ((token: string) => createGoogleDriveClient({ refreshToken: token, config: deps.config })))(refreshToken)
  const rootFolderId = await pastikanFolderAkar(drive, dipakaiUlang?.rootFolderId ?? null)

  return repo.simpanAkunTerhubung({
    email,
    refreshTokenEnc: encryptRefreshToken(refreshToken, deps.config.tokenKey),
    rootFolderId,
    mode: state.mode,
    akunIdTarget: state.mode === 'HUBUNGKAN_ULANG' ? state.akunId : null,
    actorUserId: session.userId,
    now,
  })
}
