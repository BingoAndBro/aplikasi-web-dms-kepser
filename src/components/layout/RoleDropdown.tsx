import { Check, ChevronDown } from 'lucide-react'

import { RoleBadge } from '#/components/ui/RoleBadge'
import { ROLE_DISPLAY } from '#/lib/constants/roles'
import type { RoleName } from '#/lib/types/auth'
import { cn } from '#/lib/utils'

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
    <div className="relative flex flex-col items-end">
      <span className="mb-1 hidden text-[8px] font-black uppercase tracking-[0.22em] text-outline md:block">
        Role aktif
      </span>
      <button
        type="button"
        aria-label={`Ganti role aktif, saat ini ${ROLE_DISPLAY[currentRole]}`}
        aria-expanded={roleSwitcherOpen}
        aria-haspopup="menu"
        onClick={() => setRoleSwitcherOpen(!roleSwitcherOpen)}
        className="flex max-w-28 items-center gap-1.5 rounded-full border border-orange-100 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-on-surface shadow-sm outline-none transition-all hover:border-orange-200 hover:bg-orange-50 focus:ring-2 focus:ring-primary/30 md:max-w-none"
      >
        {ROLE_DISPLAY[currentRole]}
        <ChevronDown size={12} className={cn('text-outline transition-transform', roleSwitcherOpen && 'rotate-180 text-primary')} />
      </button>
      {roleSwitcherOpen && (
        <>
          <button
            type="button"
            aria-label="Tutup pilihan role"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setRoleSwitcherOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-2 min-w-64 rounded-2xl border border-orange-100 bg-white p-2 shadow-xl shadow-orange-950/10" role="menu">
            <p className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-outline">
              Pilih role kerja
            </p>
            <div className="space-y-1">
              {userRoles.map((role) => {
                const isCurrent = role === currentRole

                return (
                  <button
                    key={role}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setRoleSwitcherOpen(false)
                      handleRoleSwitch(role)
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                      isCurrent ? 'bg-orange-50 text-primary' : 'text-on-surface-variant hover:bg-orange-50 hover:text-orange-950',
                    )}
                  >
                    <RoleBadge role={role} className="max-w-48 truncate rounded-full text-[10px]" />
                    {isCurrent && <Check size={15} className="shrink-0 text-primary" />}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
