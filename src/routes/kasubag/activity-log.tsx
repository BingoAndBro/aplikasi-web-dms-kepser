import { createFileRoute } from '@tanstack/react-router'
import { ActivityLogView } from '#/components/activity-log/ActivityLogView'

export const Route = createFileRoute('/kasubag/activity-log')({
  component: () => <ActivityLogView scope="self" />,
})
