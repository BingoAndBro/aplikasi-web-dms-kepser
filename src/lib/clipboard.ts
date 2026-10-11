/**
 * Salin teks ke clipboard. `navigator.clipboard` hanya tersedia di secure
 * context (HTTPS atau localhost); aplikasi ini juga dibuka lewat HTTP biasa di
 * jaringan internal (mis. http://10.72.214.55:3000), di mana API itu tidak ada.
 * Untuk itu ada cadangan `document.execCommand('copy')` lewat textarea
 * tersembunyi. Mengembalikan false bila kedua cara gagal -- pemanggil sebaiknya
 * memilih teks di input supaya pengguna bisa menekan Ctrl+C sendiri.
 *
 * `container`: tempat textarea cadangan ditempel. Di dalam dialog (Radix),
 * oper elemen dialognya -- focus trap dialog merebut fokus dari elemen di luar
 * dialog sehingga `select()` pada textarea di <body> tidak berlaku.
 */
export async function copyTextToClipboard(
  text: string,
  { container }: { container?: HTMLElement | null } = {},
): Promise<boolean> {
  if (typeof window === 'undefined') return false

  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Izin ditolak / dokumen tidak fokus: coba cara cadangan.
    }
  }

  return copyWithExecCommand(text, container ?? null)
}

function copyWithExecCommand(text: string, container: HTMLElement | null): boolean {
  if (typeof document === 'undefined') return false
  const host = container ?? document.body
  if (!host) return false

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '0'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  host.appendChild(textarea)

  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null

  try {
    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    host.removeChild(textarea)
    previousFocus?.focus()
  }
}
