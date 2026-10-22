import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Skrip penjadwal `pnpm drive:sync` (SPEC 13) + blok env contoh. Source guard: skrip
// menjalankan runner asli terhadap DB, jadi perilakunya diuji lewat runner.test.ts dan
// tes integrasi; di sini dijaga kontrak skripnya.
const script = readFileSync('src/scripts/drive-sync.ts', 'utf8')
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }
const envExample = readFileSync('.env.example', 'utf8')

describe('pnpm drive:sync', () => {
  it('package.json memuat skrip drive:sync dengan dotenv', () => {
    expect(pkg.scripts['drive:sync']).toBe('dotenv -e .env -- tsx src/scripts/drive-sync.ts')
  })

  it('menjalankan satu putaran runner dan mencetak ringkasan angka saja', () => {
    expect(script).toContain('runDriveRunnerOnce()')
    expect(script).toContain('Job diproses: ${ringkasan.diproses}. Selesai: ${ringkasan.selesai}. Gagal: ${ringkasan.gagal}. Dijeda: ${ringkasan.dijeda}.')
  })

  it('env tidak lengkap -> pesan belum dikonfigurasi dan keluar 0', () => {
    expect(script).toContain('isDriveConfigured()')
    expect(script).toContain('Google Drive belum dikonfigurasi')
    const blok = script.slice(script.indexOf('if (!isDriveConfigured())'), script.indexOf('return', script.indexOf('if (!isDriveConfigured())')))
    expect(blok).not.toContain('exitCode')
  })

  it('galat sistem -> exitCode 1, dan pool ditutup di finally', () => {
    expect(script).toContain('process.exitCode = 1')
    expect(script).toContain('galat.cause')
    expect(script).toMatch(/\.finally\(async \(\) => \{[\s\S]*pool\.end\(\)/)
  })

  it('tidak mencetak token, email, atau objek galat mentah', () => {
    expect(script).not.toMatch(/token|email|refresh|secret/i)
    expect(script).not.toMatch(/console\.(log|error)\([^)]*\berror\b\s*\)/)
  })
})

describe('.env.example — blok Google Drive', () => {
  it('memuat tiga variabel tanpa nilai rahasia', () => {
    for (const nama of ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'DMS_DRIVE_TOKEN_KEY']) {
      expect(envExample).toMatch(new RegExp(`^# ${nama}=$`, 'm'))
    }
  })

  it('blok berada setelah DMS_PUBLIC_BASE_URL dan menjelaskan cara membuat kunci', () => {
    expect(envExample.indexOf('GOOGLE_OAUTH_CLIENT_ID')).toBeGreaterThan(envExample.indexOf('DMS_PUBLIC_BASE_URL'))
    expect(envExample).toContain("require('crypto').randomBytes(32).toString('base64')")
    expect(envExample).toContain('Desktop app')
  })
})
