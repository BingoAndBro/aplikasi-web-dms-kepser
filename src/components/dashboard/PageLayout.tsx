/**
 * Thin content wrapper for non-dashboard child route pages.
 * Used inside role DashboardShell Outlet.
 * Provides consistent padding and max-width without the hero/mesh.
 */
interface PageLayoutProps {
  children: React.ReactNode
  className?: string
}

export function PageLayout({ children, className = '' }: PageLayoutProps) {
  return (
    <div className={`space-y-6 ${className}`}>
      {children}
    </div>
  )
}