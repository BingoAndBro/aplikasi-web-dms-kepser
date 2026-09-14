import * as React from 'react'
import { Link } from '@tanstack/react-router'
import { LogOut, UserRound } from 'lucide-react'

import { UserAvatar } from '#/components/ui/UserAvatar'

export function UserDropdown({
  avatarUrl,
  displayName,
  email,
  handleLogout,
  initials,
  setUserDropdownOpen,
  userDropdownOpen,
}: {
  avatarUrl?: string | null
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
        <UserAvatar
          src={avatarUrl}
          alt={`Foto profil ${displayName}`}
          initials={initials}
          className="size-full border-2 border-white text-xs"
        />
      </button>
      {userDropdownOpen && (
        <>
          <button
            type="button"
            aria-label="Tutup menu pengguna"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setUserDropdownOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-3 w-[252px] overflow-hidden rounded-[24px] border border-brand-border bg-white shadow-xl shadow-orange-950/10" role="menu">
            <div className="px-5 pb-5 pt-5">
              <div className="flex items-center gap-3">
                <UserAvatar
                  src={avatarUrl}
                  alt=""
                  initials={initials}
                  className="size-10 text-[11px] shadow-md shadow-orange-950/10 ring-2 ring-white"
                />
                <div className="min-w-0">
                  <p className="truncate text-[17px] font-bold leading-5 text-text-strong">{displayName}</p>
                  <p className="mt-1 truncate text-[14px] font-normal leading-4 text-brand-text-muted">{email}</p>
                </div>
              </div>
            </div>
            <div className="border-t border-brand-border">
              <Link
                to="/profile"
                onClick={() => setUserDropdownOpen(false)}
                role="menuitem"
                className="flex h-14 items-center gap-4 px-7 text-[16px] font-medium text-text-strong transition-colors hover:bg-orange-50 focus:bg-orange-50 focus:outline-none"
              >
                <UserRound size={20} strokeWidth={2} />
                Profil Saya
              </Link>
            </div>
            <div className="border-t border-brand-border">
              <button
                type="button"
                role="menuitem"
                onClick={() => { setUserDropdownOpen(false); handleLogout() }}
                className="flex h-14 w-full items-center gap-4 px-7 text-left text-[16px] font-medium text-danger-text transition-colors hover:bg-red-50 focus:bg-red-50 focus:outline-none"
              >
                <LogOut size={20} strokeWidth={2} />
                Sign Out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
