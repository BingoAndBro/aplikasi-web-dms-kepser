import { ChevronDown } from 'lucide-react'

import { ROLE_DISPLAY } from '#/lib/constants/roles'
import type { RoleName } from '#/lib/types/auth'

export function RoleDropdown({
  currentRole,
  handleRoleSwitch,
  roleSwitcherOpen,
  setRoleSwitcherOpen,
  userRoles,
}: {
  currentRole: RoleName
  handleRoleSwitch: (role: RoleName) => void
  roleSwitcherOpen: boolean
  setRoleSwitcherOpen: React.Dispatch<React.SetStateAction<boolean>>
  userRoles: RoleName[]
}) {
  return (
    <div className="flex flex-col items-end mr-2 relative">
      <span className="text-[8px] font-black text-outline uppercase tracking-[0.2em] mb-1">Switch Role</span>
      <button
        type="button"
        aria-label={`Ganti role aktif, saat ini ${ROLE_DISPLAY[currentRole]}`}
        aria-expanded={roleSwitcherOpen}
        aria-haspopup="menu"
        onClick={() => setRoleSwitcherOpen(!roleSwitcherOpen)}
        className="bg-surface-container/50 border border-outline-variant/20 rounded-lg text-[10px] font-black uppercase tracking-widest px-2 py-1 outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer hover:bg-surface-container transition-all flex items-center gap-1"
      >
        {ROLE_DISPLAY[currentRole]}
        <ChevronDown size={10} className={`transition-transform ${roleSwitcherOpen ? 'rotate-180' : ''}`} />
      </button>
      {roleSwitcherOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setRoleSwitcherOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-surface-container-lowest border border-outline-variant/20 rounded-lg shadow-xl py-1 min-w-[160px]" role="menu">
            {userRoles.map((role) => (
              <button
                key={role}
                type="button"
                role="menuitem"
                onClick={() => handleRoleSwitch(role)}
                className={`w-full text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                  role === currentRole
                    ? 'bg-primary text-white'
                    : 'text-on-surface-variant hover:bg-primary/5 hover:text-primary'
                }`}
              >
                {ROLE_DISPLAY[role]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
