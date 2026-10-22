# TanStack Start Best Practices

This document outlines the recommended architecture, patterns, and best practices for developing with TanStack Start, derived from the official documentation.

## 1. File-Based Routing & Structure

TanStack Start utilizes `@tanstack/react-router` for powerful file-based routing. Routes are defined using `createFileRoute`.

### Root Route Configuration
The root route (`src/routes/__root.tsx`) acts as the main entry point and layout definition. Use `createRootRoute` to define global `beforeLoad` logic (like authentication), SEO/meta tags, global stylesheets, and wrap the application with necessary providers and devtools.

```tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

// Example Auth Function
const fetchUser = createServerFn({ method: 'GET' }).handler(async () => {
  // Use secure server-side session fetching here
  return { user: "User Info" }
})

export const Route = createRootRoute({
  beforeLoad: async () => {
    const user = await fetchUser()
    return { user }
  },
  head: () => ({ /* Meta tags, Scripts, Styles */ }),
  component: () => (
    <html>
      <head>/* ... */</head>
      <body>
         <Outlet />
      </body>
    </html>
  )
})
```

## 2. Server Functions (`createServerFn`)

Instead of building standalone API routes, TanStack Start enables the creation of server functions that run exclusively on the server but can be imported and executed like standard functions on the client.

### Core Principles
- **Method Definition:** Define whether the function is a `GET` (for fetching) or `POST` (for mutations).
- **Input Validation:** Chain `.inputValidator((data) => validatedData)` (often with Zod) to ensure type safety between client and server.
- **Handler:** Execute the server-only logic inside `.handler(async ({ data }) => { ... })`.

```typescript
import { createServerFn } from '@tanstack/react-start'

export const updateData = createServerFn({ method: 'POST' })
  .inputValidator((d: number) => d)
  .handler(async ({ data }) => {
    // Perform server-side mutation here (e.g. DB update, File Write)
  })
```

## 3. Data Fetching via Route Loaders

Combine `createServerFn` with Route `loader`s to fetch data type-safely before a component renders.

```typescript
// src/routes/fetch-data.tsx
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

const fetchData = createServerFn({ method: 'GET' }).handler(async () => {
  // Fetch from DB or External API securely Server-Side
  const res = await fetch('https://api.example.com/data', {
    headers: { Authorization: `Bearer ${process.env.SECRET_TOKEN}` }
  })
  return res.json()
})

export const Route = createFileRoute('/fetch-data')({
  loader: async () => await fetchData(),
  component: DataPage,
})

function DataPage() {
  // Automatically fully typed!
  const data = Route.useLoaderData()
  return <div>{JSON.stringify(data)}</div>
}
```

## 4. Integrating TanStack Query

For advanced caching, deduplication, and state management, it is highly recommended to integrate TanStack Query. You can populate the query cache directly in the router's `loader` using `queryClient.ensureQueryData`.

```tsx
import { queryOptions, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

const postQueryOptions = (postId: string) =>
  queryOptions({
    queryKey: ['post', postId],
    queryFn: () => fetchPost(postId), // The ServerFn to fetch data
  })

export const Route = createFileRoute('/posts/$postId')({
  // Prefetch and cache data on the server!
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(postQueryOptions(params.postId)),
  component: Post,
})

function Post() {
  const { postId } = Route.useParams()
  
  // Consumes caching instantly, zero client-side load states when navigating!
  const { data } = useQuery(postQueryOptions(postId))
  
  return <div>{data.title}</div>
}
```

## 5. State Management & Invalidation

When you mutate data using a POST `createServerFn`, notify the router to refresh its data (re-run the loaders) via `router.invalidate()`.

```tsx
import { useRouter } from '@tanstack/react-router'

function Component() {
  const router = useRouter()
  
  const handleMutation = async () => {
    await updateData({ data: 1 })
    // Refresh the current route loader data seamlessly
    router.invalidate()
  }
}
```
