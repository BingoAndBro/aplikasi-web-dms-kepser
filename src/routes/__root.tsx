import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import { AppLayout } from '../components/layout/AppLayout'
import { ConfirmProvider } from '../components/ui/confirm/ConfirmProvider'
import { PUBLIC_PATHS } from '../lib/constants/routes'
import appCss from '../styles.css?url'

const THEME_INIT_SCRIPT = `(function(){try{var root=document.documentElement;root.classList.remove('light','dark');root.classList.add('light');root.style.colorScheme='light';}catch(e){}})();`

export const Route = createRootRoute({
  ssr: false,
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Sistem DMS | BPS Kabupaten Kepulauan Seribu' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  shellComponent: RootDocument,
  beforeLoad: async ({ location, cause }) => {
    // Skip auth check for public paths
    if (PUBLIC_PATHS.some(p => location.pathname.startsWith(p))) {
      return
    }
    // Skip for SSR preloading
    if (cause === 'preload') {
      return
    }
    // Auth is handled by AppLayout client-side via Supabase session
    // No server-side redirect needed — SPA handles auth internally
  }
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="font-sans antialiased text-foreground bg-background">
        <ConfirmProvider>
          <AppLayout>
            {children}
          </AppLayout>
        </ConfirmProvider>
        <TanStackDevtools
          config={{ position: 'bottom-right' }}
          plugins={[{ name: 'TanStack Router', render: <TanStackRouterDevtoolsPanel /> }]}
        />
        <Scripts />
      </body>
    </html>
  )
}
