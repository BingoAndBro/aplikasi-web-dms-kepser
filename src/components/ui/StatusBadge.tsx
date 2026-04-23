import { Badge } from "#/components/ui/badge"

export type StatusDokumen = 'DRAFT' | 'IN_REVIEW' | 'NEED_REVISION' | 'COMPLETED' | 'ARCHIVED'

export function StatusBadge({ status }: { status: StatusDokumen }) {
  const statusConfig = {
    DRAFT: { label: 'Draft', className: 'bg-muted text-muted-foreground border-transparent hover:bg-muted' },
    IN_REVIEW: { label: 'In Review', className: 'bg-blue-100 text-blue-800 border-transparent hover:bg-blue-200' },
    NEED_REVISION: { label: 'Need Revision', className: 'bg-amber-100 text-amber-800 border-transparent hover:bg-amber-200' },
    COMPLETED: { label: 'Completed', className: 'bg-green-100 text-green-800 border-transparent hover:bg-green-200' },
    ARCHIVED: { label: 'Archived', className: 'bg-slate-200 text-slate-700 border-transparent hover:bg-slate-300' },
  }

  const config = statusConfig[status] || statusConfig.DRAFT

  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  )
}
