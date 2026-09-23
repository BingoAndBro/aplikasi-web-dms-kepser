import { describe, expect, it } from 'vitest'
import { isValidUsername } from '#/lib/types/user'

describe('isValidUsername', () => {
  it.each([
    ['ab', false, 'shorter than 3 characters'],
    ['12345678', false, 'all-digit — must stay disjoint from the nip_nrp namespace'],
    ['Budi', false, 'uppercase letters are not allowed'],
    ['a'.repeat(31), false, 'longer than 30 characters'],
    ['bu di', false, 'contains a space'],
    ['budi.santoso', true, 'lowercase letters and a dot'],
    ['a-b_c.d', true, 'lowercase letters, hyphen, underscore, dot'],
    ['bsantoso2', true, 'letters followed by a digit'],
    ['a12', true, 'exactly 3 characters, contains a letter'],
  ])('%s -> %s (%s)', (value, expected) => {
    expect(isValidUsername(value)).toBe(expected)
  })
})
