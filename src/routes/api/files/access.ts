import { createFileRoute } from '@tanstack/react-router'
import { getLocalServerSession } from '#/lib/auth/local-server-auth'
import {
  getFileTokenSecret,
  handleInternalFileAccessRequest,
} from '#/lib/storage/internal-file-access'

export const Route = createFileRoute('/api/files/access')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        try {
          return await handleInternalFileAccessRequest({
            request,
            session: await getLocalServerSession(request),
            secret: getFileTokenSecret(),
          })
        } catch {
          return Response.json(
            { error: 'File access is not available' },
            {
              status: 500,
              headers: { 'Cache-Control': 'no-store' },
            },
          )
        }
      },
    },
  },
})
