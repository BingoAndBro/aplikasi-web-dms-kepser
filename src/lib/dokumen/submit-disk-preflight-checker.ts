// Server-only module. Do not import from client components.
// Submit-specific disk preflight checker only: no route wiring and no file mutation.
import { stat } from 'node:fs/promises'

import type { SubmitFilePreflightExistenceChecker } from './submit-file-preflight'
import {
  assertSafeLogicalStoragePath,
  getLocalStorageRoot,
  resolvePhysicalStoragePath,
} from '#/lib/storage/local-storage-paths'

export type SubmitDiskPreflightReadOnlyFileStat = {
  isFile(): boolean
}

export type SubmitDiskPreflightReadOnlyFs = {
  stat(physicalPath: string): Promise<SubmitDiskPreflightReadOnlyFileStat> | SubmitDiskPreflightReadOnlyFileStat
}

export type SubmitDiskPreflightCheckerOptions = {
  root?: string
  fs?: SubmitDiskPreflightReadOnlyFs
}

export type SubmitDiskPreflightChecker = Required<SubmitFilePreflightExistenceChecker>

export type SubmitSourceDiskPreflightCode =
  | 'exists'
  | 'missing'
  | 'unsafe-logical-path'
  | 'check-failed'

export type SubmitTargetDiskPreflightCode =
  | 'target-available'
  | 'target-already-exists'
  | 'unsafe-logical-path'
  | 'check-failed'

export type SubmitDiskPreflightSourceResult = {
  code: SubmitSourceDiskPreflightCode
  exists: boolean
}

export type SubmitDiskPreflightTargetResult = {
  code: SubmitTargetDiskPreflightCode
  available: boolean
}

const defaultReadOnlyFs: SubmitDiskPreflightReadOnlyFs = {
  stat,
}

export function createSubmitDiskPreflightChecker(
  options: SubmitDiskPreflightCheckerOptions = {},
): SubmitDiskPreflightChecker {
  return {
    checkSourceExists: logicalPath => checkSubmitSourceExists(logicalPath, options),
    checkTargetAvailable: logicalPath => checkSubmitTargetAvailable(logicalPath, options),
  }
}

export async function checkSubmitSourceExists(
  logicalPath: string,
  options: SubmitDiskPreflightCheckerOptions = {},
): Promise<boolean> {
  const result = await inspectSubmitSource(logicalPath, options)

  return result.exists
}

export async function checkSubmitTargetAvailable(
  logicalPath: string,
  options: SubmitDiskPreflightCheckerOptions = {},
): Promise<boolean> {
  const result = await inspectSubmitTarget(logicalPath, options)

  return result.available
}

export async function inspectSubmitSource(
  logicalPath: string,
  options: SubmitDiskPreflightCheckerOptions = {},
): Promise<SubmitDiskPreflightSourceResult> {
  const resolved = resolveSubmitDiskPreflightPhysicalPath(logicalPath, options.root)
  if (!resolved.ok) {
    return {
      code: resolved.code,
      exists: false,
    }
  }

  try {
    const fileStat = await (options.fs ?? defaultReadOnlyFs).stat(resolved.physicalPath)

    return fileStat.isFile()
      ? { code: 'exists', exists: true }
      : { code: 'check-failed', exists: false }
  } catch (error) {
    if (isNodeErrorCode(error, 'ENOENT')) {
      return {
        code: 'missing',
        exists: false,
      }
    }

    return {
      code: 'check-failed',
      exists: false,
    }
  }
}

export async function inspectSubmitTarget(
  logicalPath: string,
  options: SubmitDiskPreflightCheckerOptions = {},
): Promise<SubmitDiskPreflightTargetResult> {
  const resolved = resolveSubmitDiskPreflightPhysicalPath(logicalPath, options.root)
  if (!resolved.ok) {
    return {
      code: resolved.code,
      available: false,
    }
  }

  try {
    await (options.fs ?? defaultReadOnlyFs).stat(resolved.physicalPath)

    return {
      code: 'target-already-exists',
      available: false,
    }
  } catch (error) {
    if (isNodeErrorCode(error, 'ENOENT')) {
      return {
        code: 'target-available',
        available: true,
      }
    }

    return {
      code: 'check-failed',
      available: false,
    }
  }
}

function resolveSubmitDiskPreflightPhysicalPath(
  logicalPath: string,
  root?: string,
):
  | {
    ok: true
    physicalPath: string
  }
  | {
    ok: false
    code: 'unsafe-logical-path' | 'check-failed'
  } {
  let safeLogicalPath: string

  try {
    safeLogicalPath = assertSafeLogicalStoragePath(logicalPath)
  } catch {
    return {
      ok: false,
      code: 'unsafe-logical-path',
    }
  }

  try {
    const storageRoot = root ?? getLocalStorageRoot()
    return {
      ok: true,
      physicalPath: resolvePhysicalStoragePath(storageRoot, safeLogicalPath),
    }
  } catch {
    return {
      ok: false,
      code: 'check-failed',
    }
  }
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === code
}
