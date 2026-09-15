import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { appSettings } from '#/db/schema/app'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { updateGeneralSettingsSchema } from '#/lib/schemas/settings'

const APP_TITLE_KEY = 'app_title'
const APP_SUBTITLE_KEY = 'app_subtitle'
const DEFAULT_APP_TITLE = 'DMS Kepser'
const DEFAULT_APP_SUBTITLE = ''

export const Route = createFileRoute('/api/settings/general')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        try {
          const rows = await db
            .select({ key: appSettings.key, value: appSettings.value })
            .from(appSettings)
            .where(eq(appSettings.key, APP_TITLE_KEY))

          const subtitleRows = await db
            .select({ key: appSettings.key, value: appSettings.value })
            .from(appSettings)
            .where(eq(appSettings.key, APP_SUBTITLE_KEY))

          const appTitle = (rows[0]?.value as string | undefined) ?? DEFAULT_APP_TITLE
          const appSubtitle = (subtitleRows[0]?.value as string | undefined) ?? DEFAULT_APP_SUBTITLE

          return Response.json({ appTitle, appSubtitle })
        } catch (err) {
          console.error('[API DEBUG] Error in settings-general GET:', err)
          return Response.json({ error: 'Gagal mengambil setelan aplikasi' }, { status: 500 })
        }
      },

      PUT: async ({ request }: { request: Request }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError

        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        if (!hasLocalRole(session, 'ADMIN')) {
          return Response.json({ error: 'Hanya ADMIN yang bisa mengubah pengaturan aplikasi' }, { status: 403 })
        }

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const result = updateGeneralSettingsSchema.safeParse(body)
        if (!result.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: result.error.flatten(),
          }, { status: 400 })
        }

        const appTitle = result.data.appTitle
        const appSubtitle = result.data.appSubtitle ?? ''

        try {
          await db
            .insert(appSettings)
            .values({ key: APP_TITLE_KEY, value: appTitle, updatedBy: session.userId })
            .onConflictDoUpdate({
              target: appSettings.key,
              set: { value: appTitle, updatedAt: new Date(), updatedBy: session.userId },
            })

          await db
            .insert(appSettings)
            .values({ key: APP_SUBTITLE_KEY, value: appSubtitle, updatedBy: session.userId })
            .onConflictDoUpdate({
              target: appSettings.key,
              set: { value: appSubtitle, updatedAt: new Date(), updatedBy: session.userId },
            })

          console.log(`[settings-general] ${session.email} mengubah judul aplikasi menjadi "${appTitle}" / sub-judul "${appSubtitle}"`)

          return Response.json({ appTitle, appSubtitle })
        } catch (err) {
          console.error('[API DEBUG] Error in settings-general PUT:', err)
          return Response.json({ error: 'Gagal menyimpan pengaturan aplikasi' }, { status: 500 })
        }
      },
    },
  },
})
