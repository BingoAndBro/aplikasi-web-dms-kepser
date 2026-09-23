import type { RoleName } from '#/lib/types/auth'
import { ROLE_DISPLAY } from '#/lib/types/auth'

interface UserMenuProps {
  userName?: string
  username?: string
  activeRole: RoleName
}

function getInitials(name?: string, username?: string): string {
  if (name) {
    const parts = name.split(' ')
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }
  if (username) {
    return username.substring(0, 2).toUpperCase()
  }
  return '??'
}

export function UserMenu({ userName, username, activeRole }: UserMenuProps) {
  const initials = getInitials(userName, username)

  return (
    <div className="flex items-center gap-3">
      <div className="hidden sm:flex flex-col items-end">
        <span className="text-sm font-medium text-white/90 leading-tight">
          {userName || username || 'User'}
        </span>
        <span className="text-xs text-white/60 leading-tight">
          {ROLE_DISPLAY[activeRole]}
        </span>
      </div>
      <div className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center font-bold text-sm text-white border border-white/20">
        {initials}
      </div>
    </div>
  )
}
