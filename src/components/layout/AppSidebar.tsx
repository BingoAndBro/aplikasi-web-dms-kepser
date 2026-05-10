import * as React from 'react'
import { Link } from '@tanstack/react-router'
import {
  HelpCircle,
  LogOut,
} from 'lucide-react'

import { NAV_CONFIG } from '#/config/navigation'
import { ROLES } from '#/lib/constants/roles'

import type { RoleName } from '#/lib/types/auth'

function isNavItemActive(itemTo: string | undefined, pathname: string, searchStr: string | undefined) {
  const itemPath = itemTo?.split('?')[0] ?? ''
  const itemQuery = itemTo?.split('?')[1] ?? ''
  const currentQuery = searchStr?.replace(/^\?/, '') ?? ''

  if (!itemTo) return false
  if (itemTo === '/') return pathname === '/'
  if (itemQuery) return pathname === itemPath && currentQuery.includes(itemQuery)
  return pathname === itemPath && currentQuery === ''
}

export function AppSidebar({
  activeRole,
  pathname,
  searchStr,
  onLogout,
}: {
  activeRole: RoleName
  pathname: string
  searchStr?: string
  onLogout: () => void | Promise<void>
}) {
  const navGroups = React.useMemo(() => NAV_CONFIG[activeRole] ?? [], [activeRole])
  const isAdmin = activeRole === ROLES.ADMIN

  return (
    <aside className="w-72 h-full bg-surface-container-lowest/40 backdrop-blur-2xl flex flex-col py-8 px-6 gap-8 border-r border-white/5 shrink-0 z-50">
      <div className="px-2">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-white shadow-lg shadow-primary/10">
            <img src="/bps-logo.png" alt="BPS" className="w-7 h-7 object-contain" />
          </div>
          <h2 className="font-headline font-extrabold text-xl tracking-tight text-on-surface">
            {isAdmin ? 'Curator Admin' : 'DMS Architect'}
          </h2>
        </div>
        <p className="text-[10px] uppercase tracking-[0.2em] font-black text-primary ml-11">
          {isAdmin ? 'System Management' : `${activeRole} Workspace`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 -mr-2 space-y-8">
        {navGroups.map((group) => (
          <div key={group.title} className="space-y-3">
            <h3 className="text-[10px] font-black text-outline uppercase tracking-[0.25em] px-4">
              {group.title}
            </h3>
            <nav className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon
                const isActive = isNavItemActive(item.to, pathname, searchStr)
                const isBuilt = !!item.to

                if (!isBuilt) {
                  return (
                    <div
                      key={item.id}
                      className="w-full flex items-center justify-between p-3.5 rounded-xl opacity-40 cursor-not-allowed select-none"
                      title="Fitur belum tersedia"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-outline">
                          <Icon size={18} />
                        </span>
                        <span className="text-sm font-medium text-on-surface-variant">{item.label}</span>
                      </div>
                      <span className="text-[8px] px-1.5 py-0.5 rounded bg-surface-container text-outline font-black uppercase tracking-widest">
                        Soon
                      </span>
                    </div>
                  )
                }

                return (
                  <Link
                    key={item.id}
                    to={item.to}
                    className={`w-full flex items-center justify-between p-3.5 rounded-xl transition-all duration-300 group ${
                      isActive
                        ? 'bg-primary text-white shadow-xl shadow-primary/30'
                        : 'text-on-surface-variant hover:bg-primary/5 hover:text-primary'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`${isActive ? 'text-white' : 'text-outline group-hover:text-primary'} transition-colors`}>
                        <Icon size={18} />
                      </span>
                      <span className={`text-sm tracking-tight ${isActive ? 'font-bold' : 'font-medium'}`}>
                        {item.label}
                      </span>
                    </div>
                    {item.badge && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-lg font-black ${isActive ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'}`}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </nav>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1 border-t border-outline-variant/10 pt-6">
        <button className="flex items-center gap-3 text-outline text-[11px] font-bold p-3 hover:text-primary transition-all group">
          <HelpCircle size={16} className="group-hover:rotate-12 transition-transform" />
          Support Center
        </button>
        <button
          onClick={onLogout}
          className="flex items-center gap-3 text-outline text-[11px] font-bold p-3 hover:text-error transition-all group"
        >
          <LogOut size={16} className="group-hover:-translate-x-1 transition-transform" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
