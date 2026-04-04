import * as React from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { 
  Inbox, 
  Settings, 
  LogOut, 
  Archive,
} from 'lucide-react'

import { Button } from '#/components/ui/button'

const NAV_ITEMS = [
  { label: 'Inbox', icon: Inbox, to: '/' },
  { label: 'Arsiparis', icon: Archive, to: '/arsiparis' },
  { label: 'Workflow Config', icon: Settings, to: '/admin/workflow' },
]

export function AppLayout({ children }: { children: React.ReactNode }) {
  const routerState = useRouterState()
  
  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      {/* Top Header matching BPS Branding */}
      <header className="sticky top-0 z-30 w-full border-b-[5px] border-[#0096D9] bg-[#003B73] shadow-md">
        <div className="flex h-16 items-center justify-between px-6">
          {/* Logo and Brand Text */}
          <div className="flex items-center gap-3">
            <img 
              src="/bps-logo.png" 
              alt="BPS Logo" 
              className="h-10 w-auto object-contain drop-shadow"
            />
            <div className="flex flex-col justify-center text-white italic">
              <span className="text-sm md:text-lg font-bold leading-tight tracking-wide">
                BADAN PUSAT STATISTIK
              </span>
              <span className="text-sm md:text-lg font-bold leading-tight tracking-wide">
                KABUPATEN KEPULAUAN SERIBU
              </span>
            </div>
          </div>

          {/* User Profile / Right side */}
          <div className="flex items-center gap-4">
             <div className="hidden sm:flex items-center gap-3">
                <span className="text-sm font-medium text-white/90">Kak Tami</span>
             </div>
             <div className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center font-bold text-sm text-white border border-white/20">
                KT
             </div>
          </div>
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="sticky top-[68px] z-20 flex w-64 h-[calc(100vh-68px)] flex-col border-r bg-background">
          <nav className="flex-1 space-y-1 p-4">
            <div className="mb-4 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Menu Utama
            </div>
            {NAV_ITEMS.map((item) => {
              const isActive = routerState.location.pathname === item.to
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive 
                      ? 'bg-primary text-primary-foreground' 
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
          
          <div className="border-t p-4">
            <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Keluar
            </Button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1">
          <div className="p-6 md:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
