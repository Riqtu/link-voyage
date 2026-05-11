export function ChecklistLoadingSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Загрузка чеклиста">
      <div className="flex flex-wrap items-center gap-3 gap-y-2">
        <div className="h-6 w-24 rounded-full bg-muted/60 motion-safe:animate-pulse motion-reduce:bg-muted/45" />
        <div className="h-5 w-20 rounded-full bg-muted/35 motion-safe:animate-pulse motion-reduce:bg-muted/28" />
      </div>
      <div className="h-2 max-w-xl overflow-hidden rounded-full bg-muted/40">
        <div className="h-full w-1/3 rounded-full bg-primary/35 motion-safe:animate-pulse" />
      </div>
      <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/55">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={`cl-sk-${i}`} className="space-y-2 px-3 py-3 sm:py-4">
            <div className="h-11 rounded-lg bg-muted/45 motion-safe:animate-pulse motion-reduce:bg-muted/38" />
            {i % 3 === 0 ? (
              <div className="h-px w-full bg-border/40" aria-hidden />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
