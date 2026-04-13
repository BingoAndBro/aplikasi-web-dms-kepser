import { useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import type { RoleName } from '#/lib/types/auth'
import { ROLE_DISPLAY } from '#/lib/types/auth'

interface RoleSwitcherProps {
  userRoles: RoleName[]
  activeRole: RoleName
  onSwitch: (role: RoleName) => Promise<void> | void
}

export function RoleSwitcher({ userRoles, activeRole, onSwitch }: RoleSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Jangan render jika hanya 1 role atau ADMIN
  if (userRoles.length <= 1 || activeRole === 'ADMIN') {
    return null
  }

  const handleSwitch = async (newRole: RoleName) => {
    setIsLoading(true)
    try {
      await onSwitch(newRole)
    } finally {
      setIsLoading(false)
      setIsOpen(false)
    }
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center gap-2 text-white border-white/30 hover:bg-white/10"
      >
        <span className="font-medium">{ROLE_DISPLAY[activeRole]}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <Card className="absolute right-0 top-full mt-1 z-50 w-64 shadow-lg">
          <CardContent className="p-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1">
              Ganti Role
            </div>
            <div className="mt-1 space-y-0.5">
              {userRoles.map((role) => (
                <button
                  key={role}
                  onClick={() => handleSwitch(role)}
                  disabled={isLoading}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
                    role === activeRole
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'hover:bg-muted'
                  }`}
                >
                  <span>{ROLE_DISPLAY[role]}</span>
                  {role === activeRole && <Check className="h-4 w-4" />}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}
