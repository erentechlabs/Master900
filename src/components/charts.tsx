import * as React from "react";
import { cn } from "@/lib/utils";

type Datum = { label: string; value: number; secondary?: string; color?: string };

function DataTable({ caption, rows, valueLabel, toggleLabel }: { caption: string; rows: Datum[]; valueLabel: string; toggleLabel: string }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{toggleLabel}</summary>
      <table className="mt-2 w-full text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="py-1 pr-2 font-medium">
              {caption}
            </th>
            <th scope="col" className="py-1 font-medium">
              {valueLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, index) => (
            <tr key={`${r.label}:${index}`} className="border-t">
              <td className="py-1 pr-2">{r.label}</td>
              <td className="py-1 tabular-nums">
                {r.value}
                {r.secondary ? ` (${r.secondary})` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Horizontal bar chart with values 0..max (default 100). */
export function BarList({
  data,
  max = 100,
  caption,
  valueSuffix = "%",
  valueLabel,
  toggleLabel,
  className,
}: {
  data: Datum[];
  max?: number;
  caption: string;
  valueSuffix?: string;
  valueLabel: string;
  toggleLabel: string;
  className?: string;
}) {
  return (
    <figure className={cn("space-y-3", className)}>
      <figcaption className="sr-only">{caption}</figcaption>
      <ul className="space-y-3" aria-hidden="true">
        {data.map((d, index) => {
          const pct = Math.max(0, Math.min(100, max ? (d.value / max) * 100 : 0));
          return (
            <li key={`${d.label}:${index}`}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{d.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {d.value}
                  {valueSuffix}
                  {d.secondary ? <span className="ml-1 text-xs">({d.secondary})</span> : null}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: d.color ?? "hsl(var(--primary))" }} />
              </div>
            </li>
          );
        })}
      </ul>
      <DataTable caption={caption} rows={data.map((d) => ({ ...d, value: d.value }))} valueLabel={valueLabel} toggleLabel={toggleLabel} />
    </figure>
  );
}

/** Simple line chart for trends (values 0..max). */
export function LineChart({
  data,
  max = 100,
  caption,
  valueLabel,
  toggleLabel,
  height = 140,
}: {
  data: Datum[];
  max?: number;
  caption: string;
  valueLabel: string;
  toggleLabel: string;
  height?: number;
}) {
  const width = 480;
  const pad = 24;
  const points = data.map((d, i) => {
    const x = data.length === 1 ? width / 2 : pad + (i * (width - pad * 2)) / (data.length - 1);
    const y = height - pad - (Math.max(0, Math.min(max, d.value)) / max) * (height - pad * 2);
    return { x, y, d, index: i };
  });
  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={caption}>
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={pad}
            x2={width - pad}
            y1={height - pad - f * (height - pad * 2)}
            y2={height - pad - f * (height - pad * 2)}
            stroke="hsl(var(--border))"
            strokeDasharray="4 4"
          />
        ))}
        {points.length > 1 ? (
          <polyline fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" points={points.map((p) => `${p.x},${p.y}`).join(" ")} />
        ) : null}
        {points.map((p) => (
          <circle key={`${p.d.label}:${p.index}`} cx={p.x} cy={p.y} r="4" fill="hsl(var(--primary))" stroke="hsl(var(--card))" strokeWidth="2" />
        ))}
      </svg>
      <DataTable caption={caption} rows={data} valueLabel={valueLabel} toggleLabel={toggleLabel} />
    </figure>
  );
}

/** Circular progress ring (e.g. readiness score). `display` overrides the centre text (for example "75%"). */
export function RingProgress({ value, label, size = 112, color, display }: { value: number; label: string; size?: number; color?: string; display?: string }) {
  const stroke = Math.max(6, Math.round(size * 0.09));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const text = display ?? String(Math.round(pct));
  return (
    <div className="relative inline-flex items-center justify-center rounded-full bg-control/50 p-1 shadow-inner" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${text}`}>
      <svg width={size} height={size} className="-rotate-90 drop-shadow-sm" aria-hidden="true">
        <defs>
          <linearGradient id={`ring-${size}`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor={color ?? "hsl(var(--primary))"} />
            <stop offset="100%" stopColor="hsl(var(--primary))" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--border))" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color ?? `url(#ring-${size})`}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          className="transition-[stroke-dashoffset] duration-500 ease-fluent"
        />
      </svg>
      <span className={cn("absolute font-semibold tabular-nums", text.length > 3 ? "text-lg" : "text-2xl")} aria-hidden="true">{text}</span>
    </div>
  );
}

/** Seven-by-N activity heat strip for streaks. */
export function ActivityStrip({ days, caption }: { days: { date: string; active: boolean; label: string }[]; caption: string }) {
  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>
      <ul className="grid grid-flow-col grid-rows-7 gap-1.5 overflow-x-auto pb-1" aria-label={caption}>
        {days.map((d) => (
          <li
            key={d.date}
            title={d.label}
            aria-label={d.label}
            className={cn(
              "h-3.5 w-3.5 rounded-[3px] border transition-colors",
              d.active ? "border-success/70 bg-success shadow-[0_0_0_2px_hsl(var(--success)/0.12)]" : "border-stroke-card bg-control hover:bg-muted",
            )}
          />
        ))}
      </ul>
    </figure>
  );
}

