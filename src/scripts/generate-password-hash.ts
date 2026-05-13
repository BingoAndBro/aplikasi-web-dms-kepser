import { hashPassword } from '../lib/auth/password'

const PASSWORD_ENV_NAME = 'DMS_DEV_SEED_PASSWORD'

async function main() {
  const envPassword = process.env[PASSWORD_ENV_NAME]
  const cliPassword = process.argv[2]
  const password = envPassword ?? cliPassword

  if (!password) {
    printUsage()
    process.exitCode = 1
    return
  }

  if (!envPassword && cliPassword) {
    console.error('Warning: CLI arguments may be stored in shell history. Prefer DMS_DEV_SEED_PASSWORD.')
  }

  if (password.trim().length === 0) {
    console.error('Password must not be empty or whitespace-only.')
    process.exitCode = 1
    return
  }

  const hash = await hashPassword(password)
  process.stdout.write(`${hash}\n`)
}

function printUsage() {
  console.error(`Usage: set ${PASSWORD_ENV_NAME}, then run pnpm auth:hash-password`)
  console.error('Fallback: pnpm auth:hash-password <password>')
  console.error('Warning: CLI arguments may be stored in shell history.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Failed to generate password hash.')
  process.exitCode = 1
})
