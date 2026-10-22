import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'

import { DriveApiError } from '#/lib/google-drive/drive-errors'
import { FakeDrive } from './helpers/fake-drive'

async function rejection(promise: Promise<unknown>): Promise<DriveApiError> {
  const error = await promise.then(() => null, (e: unknown) => e)
  expect(error).toBeInstanceOf(DriveApiError)
  return error as DriveApiError
}

describe('FakeDrive', () => {
  it('membuat folder dan file dengan id berurutan, mencatat panggilan, dan membaca isi stream', async () => {
    const drive = new FakeDrive()
    const root = await drive.createFolder({ name: 'DMS Kepser', appProperties: { dmsRoot: '1' } })
    const folder = await drive.createFolder({ name: 'Tautan', parentId: root.id, appProperties: { dmsTautanId: 't1' } })
    const file = await drive.uploadFile({
      parentId: folder.id,
      name: 'DAFTAR_ISI.txt',
      mimeType: 'text/plain',
      body: Readable.from([Buffer.from('baris 1\n'), 'baris 2']),
      appProperties: { dmsKunci: 'DAFTAR_ISI' },
    })

    expect([root.id, folder.id, file.id]).toEqual(['fake-1', 'fake-2', 'fake-3'])
    expect(drive.objects.get(file.id)).toMatchObject({
      name: 'DAFTAR_ISI.txt',
      parents: [folder.id],
      mimeType: 'text/plain',
      content: 'baris 1\nbaris 2',
      shared: false,
    })
    expect(drive.calls.map((c) => c.method)).toEqual(['createFolder', 'createFolder', 'uploadFile'])
    expect(drive.listChildren(folder.id).map((o) => o.id)).toEqual([file.id])

    await drive.updateFileContent({ fileId: file.id, mimeType: 'text/plain', body: 'baru' })
    expect(drive.objects.get(file.id)?.content).toBe('baru')
  })

  it('mencari anak berdasarkan appProperty, membagikan, dan memberi webViewLink', async () => {
    const drive = new FakeDrive()
    const folder = await drive.createFolder({ name: 'Tautan', appProperties: {} })
    const file = await drive.uploadFile({
      parentId: folder.id, name: 'a.pdf', mimeType: 'application/pdf', body: 'x', appProperties: { dmsKunci: 'K1' },
    })

    await expect(drive.findChildByAppProperty({ parentId: folder.id, key: 'dmsKunci', value: 'K1' })).resolves.toBe(file.id)
    await expect(drive.findChildByAppProperty({ parentId: folder.id, key: 'dmsKunci', value: 'K2' })).resolves.toBeNull()

    await drive.shareAnyoneReader(folder.id)
    expect(drive.objects.get(folder.id)?.shared).toBe(true)
    await expect(drive.getWebViewLink(folder.id)).resolves.toBe(`https://drive.google.com/drive/folders/${folder.id}`)
    await expect(drive.fileExists(file.id)).resolves.toBe(true)
  })

  it('parentId yang tidak ada -> TIDAK_DITEMUKAN', async () => {
    const drive = new FakeDrive()
    expect((await rejection(drive.createFolder({ name: 'x', parentId: 'hilang', appProperties: {} }))).kategori)
      .toBe('TIDAK_DITEMUKAN')
    expect((await rejection(drive.uploadFile({
      parentId: 'hilang', name: 'a', mimeType: 'text/plain', body: 'x', appProperties: {},
    }))).kategori).toBe('TIDAK_DITEMUKAN')
  })

  it('deleteObject/deleteFile menghapus folder beserta turunannya; hapus kedua -> TIDAK_DITEMUKAN', async () => {
    const drive = new FakeDrive()
    const folder = await drive.createFolder({ name: 'Tautan', appProperties: {} })
    const sub = await drive.createFolder({ name: 'Sub', parentId: folder.id, appProperties: {} })
    const file = await drive.uploadFile({ parentId: sub.id, name: 'a', mimeType: 'text/plain', body: 'x', appProperties: {} })

    drive.deleteObject(folder.id)
    expect(drive.objects.size).toBe(0)
    await expect(drive.fileExists(file.id)).resolves.toBe(false)

    const other = await drive.createFolder({ name: 'Lain', appProperties: {} })
    await drive.deleteFile(other.id)
    expect((await rejection(drive.deleteFile(other.id))).kategori).toBe('TIDAK_DITEMUKAN')
  })

  it('failNext melempar sekali tanpa menyimpan objek', async () => {
    const drive = new FakeDrive()
    const folder = await drive.createFolder({ name: 'Tautan', appProperties: {} })
    drive.failNext('uploadFile', 'KUOTA_PENUH')
    const upload = () => drive.uploadFile({ parentId: folder.id, name: 'a', mimeType: 'text/plain', body: 'x', appProperties: {} })

    expect((await rejection(upload())).kategori).toBe('KUOTA_PENUH')
    expect(drive.listChildren(folder.id)).toHaveLength(0)
    await expect(upload()).resolves.toEqual({ id: 'fake-2' })
  })

  it('failNext dengan simpanObjek menyimpan objek lalu melempar (respons hilang)', async () => {
    const drive = new FakeDrive()
    const folder = await drive.createFolder({ name: 'Tautan', appProperties: {} })
    drive.failNext('uploadFile', 'SEMENTARA', { simpanObjek: true })

    const error = await rejection(drive.uploadFile({
      parentId: folder.id, name: 'a', mimeType: 'text/plain', body: 'x', appProperties: { dmsKunci: 'K1' },
    }))
    expect(error.kategori).toBe('SEMENTARA')
    expect(drive.listChildren(folder.id)).toHaveLength(1)
    await expect(drive.findChildByAppProperty({ parentId: folder.id, key: 'dmsKunci', value: 'K1' })).resolves.toBe('fake-2')
  })

  it('failWhen memakai predikat per panggilan sampai dihapus', async () => {
    const drive = new FakeDrive()
    const folder = await drive.createFolder({ name: 'Tautan', appProperties: {} })
    drive.failWhen((call) => (call.method === 'uploadFile' && (call.args[0] as { name: string }).name === 'b.pdf' ? 'PERMANEN' : null))

    await drive.uploadFile({ parentId: folder.id, name: 'a.pdf', mimeType: 'application/pdf', body: 'x', appProperties: {} })
    expect((await rejection(drive.uploadFile({
      parentId: folder.id, name: 'b.pdf', mimeType: 'application/pdf', body: 'x', appProperties: {},
    }))).kategori).toBe('PERMANEN')

    drive.failWhen(null)
    await drive.uploadFile({ parentId: folder.id, name: 'b.pdf', mimeType: 'application/pdf', body: 'x', appProperties: {} })
    expect(drive.listChildren(folder.id).map((o) => o.name)).toEqual(['a.pdf', 'b.pdf'])
  })

  it('revokeToken menandai revoked', async () => {
    const drive = new FakeDrive()
    expect(drive.revoked).toBe(false)
    await drive.revokeToken()
    expect(drive.revoked).toBe(true)
  })
})
