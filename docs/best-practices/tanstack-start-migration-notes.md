# TanStack Start Migration Notes

## Environment Variables

TanStack Start separates server and client environments. Server functions and server routes can access server-only variables such as `DATABASE_URL`. Client code should only receive explicitly client-safe variables, typically `VITE_` prefixed values.

Migration guidance:

- Keep database URLs, session secrets, argon2 parameters, and storage root paths server-only.
- Do not read server secrets in route loaders or components that can run on the client.
- Add runtime validation for required env vars before production/LAN deployment.
- Keep `.env` files out of git.

## Server/API Boundaries

TanStack Start server routes are appropriate for compatibility endpoints because the current app already uses `/api/*` routes. Preserve existing endpoint paths and handlers while replacing internals behind them.

Server functions are useful for new internal server-only logic, but do not convert existing API route contracts unless there is a specific compatibility reason.

## Current `ssr: false` Reality

The repo currently uses `ssr: false` at the root route, so route components and loaders behave closer to a SPA. TanStack documents that `ssr: false` disables server-side execution of route `beforeLoad`, `loader`, and route component rendering for that route.

Migration implication:

- Do not assume SSR-based auth guards protect pages.
- API/server routes must remain the real authorization boundary.
- Client role checks are only UX hints.
- Any future SSR hardening should be a separate phase after auth compatibility works.

## Build And Deployment Considerations

TanStack Start can deploy to different targets. For local/LAN operation, a Node server output is the likely simplest future target, but deployment packaging should wait until DB/auth/storage are stable.

Planning notes:

- Verify the actual build/start scripts before deployment work.
- Bind the app to a LAN-reachable host only intentionally.
- Keep app base URL and cookie options environment-driven.
- Consider reverse proxy and HTTPS later if LAN security requirements demand it.

## LAN Implications

For development, Vite can listen on all addresses with `--host 0.0.0.0` or equivalent. For production, the app server must intentionally bind to the LAN interface and the firewall must allow the app port.

Do not expose PostgreSQL to all LAN devices by default. The app should talk to PostgreSQL locally or through Docker networking.

## References

- TanStack Start environment variables: https://tanstack.com/start/latest/docs/framework/react/guide/environment-variables
- TanStack Start server routes: https://tanstack.com/start/v0/docs/framework/react/guide/server-routes
- TanStack Start server functions: https://tanstack.com/start/latest/docs/framework/react/guide/server-functions
- TanStack Start hosting: https://tanstack.dev/start/latest/docs/framework/react/guide/hosting
- TanStack Start selective SSR: https://tanstack.dev/start/latest/docs/framework/react/guide/selective-ssr
- Vite server host option: https://vite.dev/config/server-options

