function Bar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 dark:bg-zinc-800 ${className}`} />
}

export function ListPageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Bar className="h-6 w-40" />
        <Bar className="h-9 w-32" />
      </div>
      <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <Bar className="h-7 w-7 rounded-full" />
              <Bar className="h-4 w-32" />
            </div>
            <Bar className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function TransactionsPageSkeleton() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Bar className="h-6 w-32" />
        <div className="flex gap-2">
          <Bar className="h-9 w-28" />
          <Bar className="h-9 w-36" />
        </div>
      </div>
      <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Bar className="h-7 w-7 rounded-full" />
              <div className="space-y-1">
                <Bar className="h-4 w-40" />
                <Bar className="h-3 w-24" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Bar className="h-4 w-16" />
              <Bar className="h-4 w-12" />
              <Bar className="h-4 w-12" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ProfilePageSkeleton() {
  return (
    <div className="max-w-lg space-y-6">
      <Bar className="h-6 w-24" />
      <div className="space-y-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Bar className="h-3 w-24" />
            <Bar className="h-9 w-full" />
          </div>
        ))}
        <Bar className="h-9 w-24" />
      </div>
    </div>
  )
}

export function DashboardPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-4">
            <Bar className="h-3 w-32" />
            <Bar className="h-7 w-24" />
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-4">
        <Bar className="mb-2 h-4 w-32" />
        <Bar className="h-[260px] w-full" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-4">
            <Bar className="h-3 w-28" />
            <Bar className="h-6 w-20" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-4">
            <Bar className="h-4 w-40" />
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex items-center gap-3">
                <Bar className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Bar className="h-4 w-32" />
                  <Bar className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-brand-300 dark:bg-black p-4">
        <Bar className="h-4 w-32" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-2">
            <div className="space-y-1">
              <Bar className="h-4 w-40" />
              <Bar className="h-3 w-24" />
            </div>
            <Bar className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}
