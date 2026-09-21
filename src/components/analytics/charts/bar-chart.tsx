export type BarChartDatum = { label: string; value: number; tooltip?: string };

/** A minimal, dependency-free, server-renderable SVG bar chart with native `<title>` tooltips. */
export function BarChart({
  data,
  height = 160,
  color = "var(--accent)",
  ariaLabel,
}: {
  data: BarChartDatum[];
  height?: number;
  color?: string;
  ariaLabel: string;
}) {
  const width = 600;
  const paddingLeft = 8;
  const paddingBottom = 22;
  const paddingTop = 12;
  const paddingRight = 8;

  const maxValue = Math.max(1, ...data.map((d) => d.value));
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;
  const barGap = 8;
  const barWidth = data.length > 0 ? (plotWidth - barGap * (data.length - 1)) / data.length : 0;

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={ariaLabel}>
        <line
          x1={paddingLeft}
          x2={width - paddingRight}
          y1={height - paddingBottom}
          y2={height - paddingBottom}
          style={{ stroke: "var(--border)" }}
          strokeWidth={1}
        />
        {data.map((d, i) => {
          const barHeight = (d.value / maxValue) * plotHeight;
          const x = paddingLeft + i * (barWidth + barGap);
          const y = height - paddingBottom - barHeight;
          return (
            <g key={i}>
              <rect
                x={x}
                y={d.value > 0 ? y : height - paddingBottom - 2}
                width={barWidth}
                height={d.value > 0 ? barHeight : 2}
                rx={3}
                style={{ fill: color, opacity: d.value > 0 ? 1 : 0.25 }}
              >
                <title>{d.tooltip ?? `${d.label}: ${d.value}`}</title>
              </rect>
              <text
                x={x + barWidth / 2}
                y={height - paddingBottom + 13}
                textAnchor="middle"
                fontSize={9}
                style={{ fill: "var(--muted-foreground)" }}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
