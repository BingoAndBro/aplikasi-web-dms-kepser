// Google Drive in-memory untuk tes (pengganti DriveClient asli). Menyimpan
// folder/file, mencatat setiap panggilan, dan bisa dijadwalkan gagal per
// metode -- termasuk mode "respons hilang" (objek tersimpan, lalu metode
// melempar SEMENTARA) untuk menguji idempotensi unggah ulang.
import type { DriveGalatKategori } from '#/db/schema/app/drive-job'
import { DRIVE_FOLDER_MIME_TYPE } from '#/lib/google-drive/config'
import type { DriveAppProperties, DriveClient, DriveUploadBody } from '#/lib/google-drive/drive-client'
import { DriveApiError } from '#/lib/google-drive/drive-errors'

export type FakeDriveMethod = keyof DriveClient

export type FakeDriveObject = {
  id: string
  name: string
  parents: string[]
  appProperties: DriveAppProperties
  mimeType: string
  /** Isi file sebagai string; null untuk folder. */
  content: string | null
  shared: boolean
}

export type FakeDriveCall = { method: FakeDriveMethod; args: unknown[] }

type ScheduledFailure = { kategori: DriveGalatKategori; simpanObjek: boolean }
type FailurePredicate = (call: FakeDriveCall) => DriveGalatKategori | null | undefined

async function readBody(body: DriveUploadBody): Promise<string> {
  if (typeof body === 'string') return body
  const chunks: Buffer[] = []
  for await (const chunk of body as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export class FakeDrive implements DriveClient {
  readonly objects = new Map<string, FakeDriveObject>()
  readonly calls: FakeDriveCall[] = []
  revoked = false

  private nextId = 1
  private readonly scheduled = new Map<FakeDriveMethod, ScheduledFailure[]>()
  private predicate: FailurePredicate | null = null

  /** Panggilan berikutnya ke `method` gagal dengan `kategori` (sekali). */
  failNext(method: FakeDriveMethod, kategori: DriveGalatKategori, opts: { simpanObjek?: boolean } = {}): void {
    const queue = this.scheduled.get(method) ?? []
    queue.push({ kategori, simpanObjek: opts.simpanObjek ?? false })
    this.scheduled.set(method, queue)
  }

  /** Setiap panggilan yang membuat predikat mengembalikan kategori akan gagal; `null` menghapus predikat. */
  failWhen(predicate: FailurePredicate | null): void {
    this.predicate = predicate
  }

  /** Simulasi pengguna menghapus objek langsung di Drive (beserta turunannya). */
  deleteObject(id: string): void {
    for (const child of this.listChildren(id)) this.deleteObject(child.id)
    this.objects.delete(id)
  }

  listChildren(parentId: string): FakeDriveObject[] {
    return [...this.objects.values()].filter((o) => o.parents.includes(parentId))
  }

  async createFolder(input: { name: string; parentId?: string; appProperties: DriveAppProperties }) {
    return this.run('createFolder', [input], () => {
      if (input.parentId) this.requireObject(input.parentId)
      return { id: this.store({ ...input, mimeType: DRIVE_FOLDER_MIME_TYPE, content: null }) }
    })
  }

  async fileExists(fileId: string) {
    return this.run('fileExists', [fileId], () => this.objects.has(fileId))
  }

  async findChildByAppProperty(input: { parentId: string; key: string; value: string }) {
    return this.run('findChildByAppProperty', [input], () => {
      const found = this.listChildren(input.parentId).find((o) => o.appProperties[input.key] === input.value)
      return found?.id ?? null
    })
  }

  async uploadFile(input: {
    parentId: string
    name: string
    mimeType: string
    body: DriveUploadBody
    appProperties: DriveAppProperties
  }) {
    const content = await readBody(input.body)
    return this.run('uploadFile', [input], () => {
      this.requireObject(input.parentId)
      return { id: this.store({ ...input, content }) }
    })
  }

  async updateFileContent(input: { fileId: string; mimeType: string; body: DriveUploadBody }) {
    const content = await readBody(input.body)
    return this.run('updateFileContent', [input], () => {
      const object = this.requireObject(input.fileId)
      object.content = content
      object.mimeType = input.mimeType
    })
  }

  async shareAnyoneReader(fileId: string) {
    return this.run('shareAnyoneReader', [fileId], () => {
      this.requireObject(fileId).shared = true
    })
  }

  async getWebViewLink(fileId: string) {
    return this.run('getWebViewLink', [fileId], () => {
      const object = this.requireObject(fileId)
      return object.mimeType === DRIVE_FOLDER_MIME_TYPE
        ? `https://drive.google.com/drive/folders/${object.id}`
        : `https://drive.google.com/file/d/${object.id}/view`
    })
  }

  async deleteFile(fileId: string) {
    return this.run('deleteFile', [fileId], () => {
      this.requireObject(fileId)
      this.deleteObject(fileId)
    })
  }

  async revokeToken() {
    return this.run('revokeToken', [], () => {
      this.revoked = true
    })
  }

  private run<T>(method: FakeDriveMethod, args: unknown[], effect: () => T): T {
    const call = { method, args }
    this.calls.push(call)

    const scheduled = this.scheduled.get(method)?.shift()
    const kategori = scheduled?.kategori ?? this.predicate?.(call) ?? null
    if (!kategori) return effect()

    if (scheduled?.simpanObjek) effect()
    throw new DriveApiError(kategori)
  }

  private store(input: {
    name: string
    parentId?: string
    appProperties: DriveAppProperties
    mimeType: string
    content: string | null
  }): string {
    const id = `fake-${this.nextId++}`
    this.objects.set(id, {
      id,
      name: input.name,
      parents: input.parentId ? [input.parentId] : [],
      appProperties: { ...input.appProperties },
      mimeType: input.mimeType,
      content: input.content,
      shared: false,
    })
    return id
  }

  private requireObject(id: string): FakeDriveObject {
    const object = this.objects.get(id)
    if (!object) throw new DriveApiError('TIDAK_DITEMUKAN')
    return object
  }
}
