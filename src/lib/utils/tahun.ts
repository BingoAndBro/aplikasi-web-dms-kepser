/**
 * Generate tahun dropdown options.
 * Range: 5 years back + 2 years forward, newest first.
 */
export function getTahunOptions(): number[] {
  const currentYear = new Date().getFullYear()
  const years: number[] = []
  for (let y = currentYear + 2; y >= currentYear - 5; y--) {
    years.push(y)
  }
  return years
}
