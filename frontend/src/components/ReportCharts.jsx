import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ExternalLink, FileText } from "lucide-react";
import { previewUrl } from "../api";

function ChartTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-date">{label}</p>
      <p className="chart-tooltip-value">
        {point.raw_result ?? payload[0].value}
        {unit ? ` ${unit}` : ""}
      </p>
      {point.report_label && (
        <p className="chart-tooltip-report">{point.report_label}</p>
      )}
    </div>
  );
}

function SourceReports({ reports, onOpenReport }) {
  if (!reports?.length) return null;

  return (
    <div className="chart-source-reports">
      <p className="chart-source-label">Source reports</p>
      <ul className="chart-source-list">
        {reports.map((report) => (
          <li key={report.document_id} className="chart-source-item">
            <div className="chart-source-meta">
              <FileText size={14} aria-hidden />
              <span className="chart-source-name" title={report.filename}>
                {report.filename}
              </span>
              {report.report_date && (
                <span className="chart-source-date">{report.report_date}</span>
              )}
            </div>
            <div className="chart-source-actions">
              <button
                type="button"
                className="chart-source-link"
                onClick={() => window.open(previewUrl(report.document_id), "_blank")}
              >
                Preview
              </button>
              {onOpenReport && (
                <button
                  type="button"
                  className="chart-source-link"
                  onClick={() => onOpenReport(report)}
                >
                  <ExternalLink size={12} aria-hidden />
                  Open
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetricChart({ metric, reportType, reportCount, onOpenReport }) {
  const label = metric.unit
    ? `${metric.test_name} (${metric.unit})`
    : metric.test_name;

  return (
    <article className="report-card metric-chart-card">
      <header className="metric-chart-header">
        <div>
          <p className="metric-chart-type">{reportType}</p>
          <h4>{label}</h4>
          {metric.reference_range && (
            <p className="chart-meta">Reference: {metric.reference_range}</p>
          )}
        </div>
        <span className="report-count">
          {reportCount} report{reportCount !== 1 ? "s" : ""}
        </span>
      </header>
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
            content={<ChartTooltip unit={metric.unit} />}
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
      <SourceReports reports={metric.source_reports} onOpenReport={onOpenReport} />
    </article>
  );
}

export default function ReportCharts({ reportType, chartData, onOpenReport }) {
  const { report_count, metrics } = chartData;

  if (metrics.length === 0) {
    return (
      <article className="report-card metric-chart-card metric-chart-card--empty">
        <header className="metric-chart-header">
          <div>
            <p className="metric-chart-type">{reportType}</p>
            <h4>No chart data</h4>
          </div>
          <span className="report-count">
            {report_count} report{report_count !== 1 ? "s" : ""}
          </span>
        </header>
        <p className="no-metrics">No numeric lab values to chart for this report type yet.</p>
      </article>
    );
  }

  return (
    <>
      {metrics.map((metric) => (
        <MetricChart
          key={`${reportType}-${metric.test_name}`}
          metric={metric}
          reportType={reportType}
          reportCount={report_count}
          onOpenReport={onOpenReport}
        />
      ))}
    </>
  );
}
