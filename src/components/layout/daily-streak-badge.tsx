export function DailyStreakBadge({ streakCount }: { streakCount: number }) {
  return (
    <span
      className="border-border/70 bg-secondary/60 text-foreground flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium"
      title={`${streakCount} day login streak`}
      aria-label={`${streakCount} day login streak`}
    >
      <span aria-hidden="true">🔥</span>
      {streakCount}
    </span>
  );
}
