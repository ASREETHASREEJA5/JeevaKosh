import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
        <LineChart data={metric.points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value, _name, props) => [
              props.payload.raw_result ?? value,
              metric.unit || "value",
            ]}
          />
          <Line
            type="monotone"
            dataKey="value"
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
  const { report_count, timeline, metrics } = chartData;

  return (
    <section className="report-card">
      <header className="report-card-header">
        <h3>{reportType}</h3>
        <span className="report-count">{report_count} report{report_count !== 1 ? "s" : ""}</span>
      </header>

      {timeline.length > 0 && (
        <div className="chart-block">
          <h4>Reports over time</h4>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={timeline} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" name="Reports" fill="var(--accent)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

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
