export default function DashboardLoading() {
  return (
    <div className="space-y-4 px-4 py-8 lg:px-8">
      <div className="h-8 w-48 animate-pulse rounded-xl bg-secondary/60" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="h-28 animate-pulse rounded-2xl bg-secondary/40" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-secondary/30" />
    </div>
  );
}
