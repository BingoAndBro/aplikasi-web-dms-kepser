/**
 * Single source of truth for the sub-judul fallback shown in both AppSidebar
 * (below the app title) and AppHeader (the eyebrow above the title) before
 * an admin sets a custom sub-judul (Settings > Identitas Aplikasi). Kept in
 * one place so the two surfaces never drift into showing different text for
 * the same "not set yet" state (they used to: "Manajemen Sistem" vs
 * "Admin Sistem Workspace").
 */
export function getWorkspaceLabelFallback(isAdmin: boolean, roleDisplay: string): string {
  return isAdmin ? 'Manajemen Sistem' : `${roleDisplay} Workspace`
}
