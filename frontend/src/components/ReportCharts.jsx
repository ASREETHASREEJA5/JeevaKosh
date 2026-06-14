import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function MetricChart({ metric }) {
  const label = metric.unit
    ? `${metric.test_name} (${metric.unit})`
    : metric.test_name;

  return (
    <div className="metric-chart">
      <h4>{label}</h4>
      {metric.reference_range && (
        <p className="chart-meta">Reference: {metric.reference_range}</p>
      )}
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={metric.points} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis
            tick={{ fontSize: 12 }}
            tickFormatter={(v) => (Number.isFinite(v) ? v : "")}
            label={{
              value: metric.unit || "Value",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 12, fill: "var(--muted)" },
            }}
          />
          <Tooltip
            labelFormatter={(date) => `Date: ${date}`}
            formatter={(value, _name, props) => [
              props.payload.raw_result ?? value,
              metric.unit || "Value",
            ]}
          />
          <Line
            type="monotone"
            dataKey="value"
            name={metric.test_name}
            stroke="var(--accent)"
            strokeWidth={2}
            dot={{ r: 4, fill: "var(--accent)" }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ReportCharts({ reportType, chartData }) {
  const { report_count, metrics } = chartData;

  return (
    <section className="report-card">
      <header className="report-card-header">
        <h3>{reportType}</h3>
        <span className="report-count">
          {report_count} report{report_count !== 1 ? "s" : ""}
        </span>
      </header>

      {metrics.length > 0 ? (
        <div className="metrics-grid">
          {metrics.map((metric) => (
            <MetricChart key={metric.test_name} metric={metric} />
          ))}
        </div>
      ) : (
        <p className="no-metrics">No numeric lab values to chart for this report type yet.</p>
      )}
    </section>
  );
}
