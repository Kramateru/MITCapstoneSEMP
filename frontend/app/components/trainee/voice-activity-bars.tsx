'use client';

interface VoiceActivityBarsProps {
  level: number;
  isActive: boolean;
  accent?: 'csr' | 'member';
}

const BAR_COUNT = 24;

export default function VoiceActivityBars({
  level,
  isActive,
  accent = 'csr',
}: VoiceActivityBarsProps) {
  const tint =
    accent === 'member'
      ? 'from-amber-400 via-orange-500 to-rose-500'
      : 'from-emerald-400 via-cyan-400 to-sky-500';

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950 px-4 py-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_55%)]" />
      <div className="relative flex h-28 items-end justify-between gap-1">
        {Array.from({ length: BAR_COUNT }).map((_, index) => {
          const baseline = 0.18 + ((index % 5) * 0.08);
          const activeBoost = isActive ? level * (0.8 + ((index % 4) * 0.12)) : 0.05;
          const height = Math.min(1, baseline + activeBoost);
          return (
            <span
              key={index}
              className={`w-full rounded-full bg-gradient-to-t ${tint} shadow-[0_0_20px_rgba(56,189,248,0.2)] transition-all duration-150`}
              style={{
                height: `${Math.max(14, height * 100)}%`,
                opacity: isActive ? 0.95 : 0.35,
                transform: `translateY(${isActive ? 0 : 10}px)`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
