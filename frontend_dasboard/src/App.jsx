import { useEffect, useState } from "react";
import ReportCharts from "./components/ReportCharts";
import "./App.css";

const API_BASE = "http://127.0.0.1:8000";

function App() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/dashboard/`)
      .then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then((data) => setDashboard(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>JeevaKosha Dashboard</h1>
        <p className="dashboard-subtitle">Trend graphs grouped by report type</p>
      </header>

      {loading && <p className="status">Loading reports…</p>}
      {error && <p className="status error">Failed to load dashboard: {error}</p>}

      {!loading && !error && dashboard?.available_tests?.length === 0 && (
        <p className="status">No completed reports found. Upload and OCR reports to see graphs.</p>
      )}

      <div className="report-grid">
        {dashboard?.available_tests?.map((reportType) => (
          <ReportCharts
            key={reportType}
            reportType={reportType}
            chartData={dashboard.charts[reportType]}
          />
        ))}
      </div>
    </div>
  );
}

export default App;
