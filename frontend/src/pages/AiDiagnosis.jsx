import { LayoutDashboard } from "lucide-react";
import PageHead from "../components/PageHead.jsx";

export default function AiDiagnosis() {
  return (
    <div className="health-dashboard">
      <PageHead
        eyebrow="Coming soon"
        title="AI Diagnosis"
        desc="This feature is under development. Check back later."
        icon={LayoutDashboard}
      />
      <div className="panel" style={{ padding: "2rem", textAlign: "center" }}>
        <p className="muted">AI Diagnosis will be available here soon.</p>
      </div>
    </div>
  );
}
