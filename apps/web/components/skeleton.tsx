export function Block({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-panel bg-surface-2 ${className}`} />;
}

export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <Block className="h-9 w-56" />
      <Block className="h-44 max-w-xl" />
    </div>
  );
}
