import { Link } from '@tanstack/react-router'
import { LogOut, UserCircle } from 'lucide-react'

import { RoleBadge } from '#/components/ui/RoleBadge'
import type { RoleName } from '#/lib/types/auth'

export function UserDropdown({
  activeRole,
  displayName,
  email,
  handleLogout,
  initials,
  setUserDropdownOpen,
  userDropdownOpen,
}: {
  activeRole: RoleName
  displayName: string
  email?: string
  handleLogout: () => void | Promise<void>
  initials: string
  setUserDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>
  userDropdownOpen: boolean
}) {
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Buka menu pengguna ${displayName}`}
        aria-expanded={userDropdownOpen}
        aria-haspopup="menu"
        onClick={() => setUserDropdownOpen(!userDropdownOpen)}
        className="size-11 rounded-full bg-primary/10 p-0.5 shadow-md shadow-orange-950/10 transition-all hover:bg-primary/20 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <div className="flex size-full items-center justify-center rounded-full border-2 border-white bg-primary">
          <span className="text-xs font-extrabold tracking-wide text-white">{initials}</span>
        </div>
      </button>
      {userDropdownOpen && (
        <>
          <button
            type="button"
            aria-label="Tutup menu pengguna"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setUserDropdownOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-3 min-w-72 overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-xl shadow-orange-950/10" role="menu">
            <div className="bg-[#FFF8F1] px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-extrabold tracking-wide text-white shadow-md shadow-orange-950/10 ring-2 ring-white">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-on-surface">{displayName}</p>
                  <p className="truncate text-xs text-outline">{email}</p>
                  <RoleBadge role={activeRole} className="mt-2 rounded-full text-[10px]" />
                </div>
              </div>
            </div>
            <div className="py-1.5">
              <p className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-outline">
                Akun
              </p>
              <Link
                to="/profile"
                onClick={() => setUserDropdownOpen(false)}
                role="menuitem"
                className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-orange-50 hover:text-primary"
              >
                <UserCircle size={16} />
                Profile dan keamanan
              </Link>
            </div>
            <div className="border-t border-orange-100 pt-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => { setUserDropdownOpen(false); handleLogout() }}
                className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-error transition-colors hover:bg-red-50"
              >
                <LogOut size={16} />
                Keluar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
