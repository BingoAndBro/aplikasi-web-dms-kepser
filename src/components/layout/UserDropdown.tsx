import { Link } from '@tanstack/react-router'
import { LogOut, UserCircle } from 'lucide-react'

export function UserDropdown({
  displayName,
  email,
  handleLogout,
  initials,
  setUserDropdownOpen,
  userDropdownOpen,
}: {
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
        className="w-11 h-11 rounded-2xl bg-primary/10 p-0.5 shadow-xl cursor-pointer hover:bg-primary/20 transition-all"
      >
        <div className="w-full h-full rounded-[14px] bg-primary flex items-center justify-center border-2 border-background">
          <span className="text-xs font-extrabold text-white">{initials}</span>
        </div>
      </button>
      {userDropdownOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setUserDropdownOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-xl py-2 min-w-[200px]" role="menu">
            <div className="px-4 py-2 border-b border-outline-variant/10">
              <p className="text-sm font-bold text-on-surface">{displayName}</p>
              <p className="text-xs text-outline">{email}</p>
            </div>
            <div className="py-1">
              <Link
                to="/profile"
                onClick={() => setUserDropdownOpen(false)}
                role="menuitem"
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-on-surface-variant hover:bg-primary/5 hover:text-primary transition-colors"
              >
                <UserCircle size={16} />
                Profil Saya
              </Link>
            </div>
            <div className="border-t border-outline-variant/10 pt-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => { setUserDropdownOpen(false); handleLogout() }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-error hover:bg-error/5 transition-colors"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
