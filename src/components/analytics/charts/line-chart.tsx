export type LineChartSeries = {
  label: string;
  color: string;
  points: { x: number; y: number; tooltip: string }[];
};

/**
 * A minimal, dependency-free SVG line chart — server-renderable (no client
 * JS needed for the base chart), with native `<title>` tooltips on each
 * point. `x` is a caller-supplied numeric position (commonly a sequential
 * attempt index, since real test dates are too irregular to space evenly).
 */
export function LineChart({
  series,
  height = 220,
  yDomain,
  yFormat,
  ariaLabel,
}: {
  series: LineChartSeries[];
  height?: number;
  yDomain?: [number, number];
  yFormat?: (value: number) => string;
  ariaLabel: string;
}) {
  const width = 600;
  const paddingLeft = 36;
  const paddingBottom = 24;
  const paddingTop = 12;
  const paddingRight = 12;

  const allPoints = series.flatMap((s) => s.points);
  if (allPoints.length === 0) return null;

  const xValues = allPoints.map((p) => p.x);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);

  const yValues = allPoints.map((p) => p.y);
  const [yMin, yMax] = yDomain ?? [Math.min(0, ...yValues), Math.max(...yValues) * 1.15 || 1];

  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  const scaleX = (x: number) =>
    xMax === xMin ? paddingLeft + plotWidth / 2 : paddingLeft + ((x - xMin) / (xMax - xMin)) * plotWidth;
  const scaleY = (y: number) =>
    yMax === yMin ? paddingTop + plotHeight / 2 : paddingTop + plotHeight - ((y - yMin) / (yMax - yMin)) * plotHeight;

  const tickCount = 4;
  const tickValues = Array.from({ length: tickCount + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / tickCount);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={ariaLabel}>
        {tickValues.map((tick, i) => (
          <g key={i}>
            <line
              x1={paddingLeft}
              x2={width - paddingRight}
              y1={scaleY(tick)}
              y2={scaleY(tick)}
              style={{ stroke: "var(--border)" }}
              strokeWidth={1}
            />
            <text
              x={paddingLeft - 8}
              y={scaleY(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={10}
              style={{ fill: "var(--muted-foreground)" }}
            >
              {yFormat ? yFormat(tick) : Math.round(tick)}
            </text>
          </g>
        ))}

        {series.map((s) => {
          const path = s.points.map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(p.x)} ${scaleY(p.y)}`).join(" ");
          return (
            <g key={s.label}>
              <path
                d={path}
                fill="none"
                style={{ stroke: s.color }}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {s.points.map((p, i) => (
                <circle
                  key={i}
                  cx={scaleX(p.x)}
                  cy={scaleY(p.y)}
                  r={4}
                  style={{ fill: s.color, stroke: "var(--card)" }}
                  strokeWidth={2}
                >
                  <title>{p.tooltip}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>

      {series.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-4">
          {series.map((s) => (
            <span key={s.label} className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden="true"
              />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
