import { useEffect, useMemo, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { PegawaiPanel } from '#/components/pegawai/PegawaiPagePrimitives'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { RoleBadge, getRoleBadgeLabel } from '#/components/ui/RoleBadge'
import { ApiError, apiFetch } from '#/lib/api-client'
import { ROLE_NAMES, type RoleName } from '#/lib/constants/roles'
import { formatAksiLabel } from '#/lib/dokumen/aksi-labels'
import { formatDateTime } from '#/lib/utils/format'
import { Clock3, History, Search } from 'lucide-react'

type ActivityLogRow = {
  id: string
  aksi: string
  catatan: string | null
  timestamp: string
  dokumenId: string
  dokumenJudul: string
  userId: string | null
  userNama: string
  role: RoleName | null
}

const ROLE_FILTER_ALL = '_all'

type ActivityLogResponse = {
  logs?: ActivityLogRow[]
  error?: string
}

type SortMode = 'newest' | 'oldest'

const TABLE_HEAD_CLASS = 'px-6 py-4 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500'

export function ActivityLogView({ scope }: { scope: 'self' | 'all' }) {
  const [logs, setLogs] = useState<ActivityLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortMode>('newest')
  const [roleFilter, setRoleFilter] = useState<string>(ROLE_FILTER_ALL)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    apiFetch<ActivityLogResponse>('/activity-log', { query: { scope } })
      .then((data) => {
        if (cancelled) return
        setLogs(data.logs ?? [])
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError) {
          const payload = err.payload
          setError(payload && typeof payload === 'object' && 'error' in payload
            ? (payload as { error?: string }).error ?? 'Gagal memuat log aktivitas'
            : 'Gagal memuat log aktivitas')
          return
        }
        setError('Terjadi kesalahan')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [scope])

  // Only offer roles that actually appear in the fetched entries — for
  // scope="self" that's whichever of the account's own roles logged
  // something, never the full ROLE_NAMES list.
  const availableRoles = useMemo(() => {
    const present = new Set(logs.map((log) => log.role).filter((role): role is RoleName => role !== null))
    return ROLE_NAMES.filter((role) => present.has(role))
  }, [logs])

  useEffect(() => {
    if (roleFilter !== ROLE_FILTER_ALL && !availableRoles.includes(roleFilter as RoleName)) {
      setRoleFilter(ROLE_FILTER_ALL)
    }
  }, [availableRoles, roleFilter])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return logs
      .filter((log) => {
        if (roleFilter !== ROLE_FILTER_ALL && log.role !== roleFilter) return false
        if (!query) return true
        return [
          formatAksiLabel(log.aksi),
          log.dokumenJudul,
          scope === 'all' ? log.userNama : null,
          log.catatan,
        ].some((value) => value?.toLowerCase().includes(query))
      })
      .sort((a, b) => sortBy === 'oldest'
        ? dateValue(a.timestamp) - dateValue(b.timestamp)
        : dateValue(b.timestamp) - dateValue(a.timestamp))
  }, [logs, search, scope, sortBy, roleFilter])

  return (
    <PageLayout>
      <div className="mx-auto w-full max-w-[1280px] space-y-7 px-7 pt-6 sm:px-8 lg:px-10">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-5">
            <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-brand-border bg-bg-surface text-brand-solid shadow-[0_2px_8px_rgba(251,146,60,0.14)]">
              <History size={22} />
            </div>
            <div className="min-w-0">
              <h1 className="font-headline text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-[30px]">
                Activity Log
              </h1>
              <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-zinc-700">
                {scope === 'all'
                  ? 'Riwayat aktivitas seluruh user pada dokumen.'
                  : 'Riwayat aktivitas Anda pada dokumen.'}
              </p>
            </div>
          </div>
        </section>

        <Toolbar
          search={search}
          onSearchChange={setSearch}
          sortBy={sortBy}
          onSortChange={setSortBy}
          roleFilter={roleFilter}
          onRoleFilterChange={setRoleFilter}
          availableRoles={availableRoles}
          resultLabel={`${filtered.length} Aktivitas Ditemukan`}
        />

        {loading && <LoadingState variant="list" rows={4} label="Memuat log aktivitas" />}

        {!loading && error && (
          <ErrorState title="Gagal memuat log aktivitas" description={error} variant="page" />
        )}

        {!loading && !error && logs.length === 0 && (
          <EmptyState
            title="Belum ada aktivitas"
            description={scope === 'all'
              ? 'Aktivitas dokumen dari seluruh user akan muncul di sini.'
              : 'Aktivitas Anda pada dokumen akan muncul di sini.'}
            icon={<History size={20} />}
          />
        )}

        {!loading && !error && logs.length > 0 && filtered.length === 0 && (
          <EmptyState
            title="Tidak ada aktivitas yang cocok"
            description="Ubah kata kunci pencarian untuk melihat aktivitas lain."
            icon={<Search size={20} />}
          />
        )}

        {!loading && !error && filtered.length > 0 && (
          <ActivityLogTable rows={filtered} showUser={scope === 'all'} />
        )}
      </div>
    </PageLayout>
  )
}

function Toolbar({
  search,
  onSearchChange,
  sortBy,
  onSortChange,
  roleFilter,
  onRoleFilterChange,
  availableRoles,
  resultLabel,
}: {
  search: string
  onSearchChange: (value: string) => void
  sortBy: SortMode
  onSortChange: (value: SortMode) => void
  roleFilter: string
  onRoleFilterChange: (value: string) => void
  availableRoles: RoleName[]
  resultLabel: string
}) {
  return (
    <div className="overflow-hidden rounded-[26px] border border-zinc-200/80 bg-bg-surface shadow-[0_3px_14px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative min-w-0 flex-1 lg:max-w-xl">
          <span className="sr-only">Cari log aktivitas</span>
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <input
            type="search"
            placeholder="Cari aksi, dokumen, atau user..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-11 w-full rounded-[20px] border border-zinc-200 bg-bg-surface pl-11 pr-4 text-sm font-medium text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-brand-border-strong focus:ring-4 focus:ring-brand-border/60"
          />
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={roleFilter} onValueChange={(value) => onRoleFilterChange(value ?? ROLE_FILTER_ALL)}>
            <SelectTrigger className="min-h-10 w-full rounded-xl border-brand-border bg-bg-surface px-4 text-sm font-semibold hover:border-brand-border-strong sm:w-fit">
              <SelectValue placeholder="Semua Role">
                {(selected) => selected === ROLE_FILTER_ALL ? 'Semua Role' : getRoleBadgeLabel(selected)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ROLE_FILTER_ALL}>Semua Role</SelectItem>
              {availableRoles.map((role) => (
                <SelectItem key={role} value={role}>{getRoleBadgeLabel(role)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(value) => onSortChange(value as SortMode)}>
            <SelectTrigger className="min-h-10 w-full rounded-xl border-brand-border bg-bg-surface px-4 text-sm font-semibold hover:border-brand-border-strong sm:w-fit">
              <SelectValue placeholder="Waktu terbaru">
                {(selected) => selected === 'oldest' ? 'Waktu terlama' : 'Waktu terbaru'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Waktu terbaru</SelectItem>
              <SelectItem value="oldest">Waktu terlama</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="px-5 py-4 text-sm font-bold text-zinc-950">
        {resultLabel}
      </div>
    </div>
  )
}

function ActivityLogTable({ rows, showUser }: { rows: ActivityLogRow[]; showUser: boolean }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-[26px] border border-zinc-200/80 bg-bg-surface shadow-[0_3px_14px_rgba(15,23,42,0.07)] md:block">
        <Table className="text-left">
          <TableHeader>
            <TableRow className="border-neutral-200 bg-neutral-100 hover:bg-neutral-100">
              {showUser && <TableHead className={TABLE_HEAD_CLASS}>User</TableHead>}
              <TableHead className={TABLE_HEAD_CLASS}>Role</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Aksi</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Dokumen</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Waktu</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-zinc-100 text-[13px]">
            {rows.map((log) => (
              <TableRow key={log.id} className="border-zinc-100 bg-bg-surface">
                {showUser && (
                  <TableCell className="px-6 py-5 text-sm font-bold text-zinc-950">{log.userNama}</TableCell>
                )}
                <TableCell className="px-6 py-5">
                  <RoleBadge role={log.role} />
                </TableCell>
                <TableCell className="px-6 py-5 text-sm font-semibold text-zinc-900">
                  {formatAksiLabel(log.aksi)}
                  {log.catatan && (
                    <p className="mt-1 line-clamp-1 text-xs font-medium text-zinc-500">{log.catatan}</p>
                  )}
                </TableCell>
                <TableCell className="max-w-[360px] px-6 py-5">
                  <p className="line-clamp-2 text-sm font-medium text-zinc-700">{log.dokumenJudul}</p>
                </TableCell>
                <TableCell className="px-6 py-5">
                  <DateTimeCell value={log.timestamp} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {rows.map((log) => (
          <PegawaiPanel key={log.id} className="space-y-2 border-zinc-200/80 p-4 shadow-[0_2px_10px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-bold text-zinc-950">{formatAksiLabel(log.aksi)}</p>
              <DateTimeCell value={log.timestamp} />
            </div>
            <div className="flex items-center gap-2">
              <RoleBadge role={log.role} />
              {showUser && (
                <span className="text-[11px] font-semibold text-zinc-500">Oleh: {log.userNama}</span>
              )}
            </div>
            <p className="line-clamp-2 text-xs font-medium text-zinc-600">{log.dokumenJudul}</p>
            {log.catatan && (
              <p className="line-clamp-2 text-xs font-medium text-zinc-500">{log.catatan}</p>
            )}
          </PegawaiPanel>
        ))}
      </div>
    </>
  )
}

function DateTimeCell({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500">
      <Clock3 size={16} strokeWidth={1.8} className="shrink-0 text-zinc-500" aria-hidden="true" />
      {formatDateTime(value)}
    </span>
  )
}

function dateValue(value: string) {
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}
