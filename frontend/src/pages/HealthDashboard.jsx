import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard } from "lucide-react";
import PageHead from "../components/PageHead.jsx";
import ReportCharts from "../components/ReportCharts.jsx";
import { fetchDashboard, previewUrl } from "../api";

export default function HealthDashboard({
  navigate,
  setActiveHospital,
  setVaultFolder,
  setSelectedReportFolder,
}) {
  const { data: dashboard, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
  });

  function openReport(report) {
    if (!report.hospital_id || !report.report_folder_id) {
      window.open(previewUrl(report.document_id), "_blank");
      return;
    }

    setActiveHospital?.({
      id: report.hospital_id,
      name: report.hospital_name || "Hospital",
    });
    setVaultFolder?.("reports");
    setSelectedReportFolder?.({
      id: report.report_folder_id,
      name: report.report_folder_name || "Reports",
    });
    navigate?.("documents");
  }

  return (
    <div className="health-dashboard">
      <PageHead
        eyebrow="Analytics"
        title="Health dashboard"
        desc="Trend graphs grouped by report type from your uploaded diagnostics."
        icon={LayoutDashboard}
      />

      {isLoading && <p className="dashboard-status">Loading reports…</p>}
      {error && (
        <p className="dashboard-status error">
          Failed to load dashboard: {error.message}
        </p>
      )}

      {!isLoading && !error && dashboard?.available_tests?.length === 0 && (
        <p className="dashboard-status">
          No completed reports found. Upload and OCR reports to see graphs.
        </p>
      )}

      <div className="report-grid">
        {dashboard?.available_tests?.map((reportType) => (
          <ReportCharts
            key={reportType}
            reportType={reportType}
            chartData={dashboard.charts[reportType]}
            onOpenReport={openReport}
          />
        ))}
      </div>
    </div>
  );
}
