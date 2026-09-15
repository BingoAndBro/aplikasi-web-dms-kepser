import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { appSettings } from '#/db/schema/app'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { updateThemeSchema, type ThemeValue } from '#/lib/schemas/settings'

const THEME_KEY = 'theme'
const DEFAULT_THEME: ThemeValue = 'se'

export const Route = createFileRoute('/api/settings/theme')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        try {
          const [row] = await db
            .select({ value: appSettings.value })
            .from(appSettings)
            .where(eq(appSettings.key, THEME_KEY))
            .limit(1)

          const theme = (row?.value as ThemeValue | undefined) ?? DEFAULT_THEME
          return Response.json({ theme })
        } catch (err) {
          console.error('[API DEBUG] Error in settings-theme GET:', err)
          return Response.json({ error: 'Gagal mengambil setelan tema' }, { status: 500 })
        }
      },

      PUT: async ({ request }: { request: Request }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError

        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        if (!hasLocalRole(session, 'ADMIN')) {
          return Response.json({ error: 'Hanya ADMIN yang bisa mengubah tema aplikasi' }, { status: 403 })
        }

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const result = updateThemeSchema.safeParse(body)
        if (!result.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: result.error.flatten(),
          }, { status: 400 })
        }

        try {
          await db
            .insert(appSettings)
            .values({
              key: THEME_KEY,
              value: result.data.theme,
              updatedBy: session.userId,
            })
            .onConflictDoUpdate({
              target: appSettings.key,
              set: {
                value: result.data.theme,
                updatedAt: new Date(),
                updatedBy: session.userId,
              },
            })

          console.log(`[settings-theme] ${session.email} mengubah tema aplikasi menjadi ${result.data.theme}`)

          return Response.json({ theme: result.data.theme })
        } catch (err) {
          console.error('[API DEBUG] Error in settings-theme PUT:', err)
          return Response.json({ error: 'Gagal menyimpan setelan tema' }, { status: 500 })
        }
      },
    },
  },
})
