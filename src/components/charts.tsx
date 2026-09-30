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
          {rows.map((r) => (
            <tr key={r.label} className="border-t">
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
        {data.map((d) => {
          const pct = Math.max(0, Math.min(100, max ? (d.value / max) * 100 : 0));
          return (
            <li key={d.label}>
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
    return { x, y, d };
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
          <circle key={p.d.label} cx={p.x} cy={p.y} r="4" fill="hsl(var(--primary))" stroke="hsl(var(--card))" strokeWidth="2" />
        ))}
      </svg>
      <DataTable caption={caption} rows={data} valueLabel={valueLabel} toggleLabel={toggleLabel} />
    </figure>
  );
}

/** Circular progress ring (e.g. readiness score). */
export function RingProgress({ value, label, size = 112, color }: { value: number; label: string; size?: number; color?: string }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--muted))" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color ?? "hsl(var(--primary))"}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
        />
      </svg>
      <span className="absolute text-2xl font-semibold tabular-nums" aria-hidden="true">
        {Math.round(pct)}
      </span>
    </div>
  );
}

/** Seven-by-N activity heat strip for streaks. */
export function ActivityStrip({ days, caption }: { days: { date: string; active: boolean; label: string }[]; caption: string }) {
  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>
      <ul className="flex flex-wrap gap-1" aria-label={caption}>
        {days.map((d) => (
          <li
            key={d.date}
            title={d.label}
            aria-label={d.label}
            className={cn("h-4 w-4 rounded-sm border", d.active ? "border-transparent bg-success" : "bg-muted")}
          />
        ))}
      </ul>
    </figure>
  );
}
