import React, { useRef } from "react";
import Brand from "../components/Brand.jsx";
import Button from "../components/Button.jsx";
import Icon from "../components/Icon.jsx";
import {
  ArrowLeft,
  Download,
  Share2,
  FileText,
  ArrowDownCircle,
} from "lucide-react";

export default function Report(props) {
  const patient = props.selectedPatient || {
    name: "J.V.SIDDHARTHA CH",
    age: 20,
    relation: "Self",
  };
  const reportRef = useRef(null);

  function handleDownload() {
    const content = reportRef.current
      ? reportRef.current.innerHTML
      : document.body.innerHTML;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${patient.name} - Report</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${content}</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${patient.name.replace(/\s+/g, "_")}_report.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  
  function handlePrint() {
    const content = reportRef.current ? reportRef.current.innerHTML : document.body.innerHTML;
    const head = document.head.innerHTML;
    const html = `<!doctype html><html><head>${head}<meta charset="utf-8"><title>${patient.name} - Report</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${content}</body></html>`;
    const win = window.open("", "_blank");
    if (!win) {
      alert("Please allow popups to print the report.");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    // Give the new window a moment to render styles
    setTimeout(() => {
      try {
        win.print();
      } catch (e) {
        console.error(e);
      }
    }, 350);
  }

  async function handleShare() {
    const shareText = `${patient.name} - Medical report`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${patient.name} Report`,
          text: shareText,
          url: window.location.href,
        });
        return;
      } catch (e) {
        /* fallthrough to clipboard */
      }
    }
    try {
      const html = reportRef.current
        ? reportRef.current.innerText
        : `${patient.name} - report`;
      await navigator.clipboard.writeText(
        shareText + "\n\n" + html.slice(0, 800),
      );
      alert("Report content copied to clipboard. Share it in your apps.");
    } catch (e) {
      alert("Share is not supported in this browser.");
    }
  }

  return (
    <div className="site-shell report-page">
      <header className="report-top">
        <button
          className="back-btn"
          onClick={() => props.navigate("dashboard")}
          aria-label="Back"
        >
          <ArrowLeft size={22} />
        </button>
        <h2>Smart Report</h2>
        <div className="report-actions">
          <button className="icon-btn" onClick={handlePrint} title="Print / Save as PDF">
            <Download size={18} />
          </button>
          <button className="icon-btn" onClick={handleShare} title="Share report">
            <Share2 size={18} />
          </button>
        </div>
      </header>

      <div className="report-logos">
        <img
          src="assets/logo.png"
          alt="hospital"
          className="report-hospital-logo"
        />
        <div className="report-badges">
          <span className="badge small">✔︎</span>
          <span className="badge small">NABH</span>
          <span className="badge small">ISO</span>
        </div>
      </div>

      <section className="report-info-card report-card" ref={reportRef}>
        <div className="report-info-grid">
          <div>
            <p>
              <strong>Patient Name</strong>
            </p>
            <p className="muted">Report Date</p>
            <p className="muted">UHID No</p>
            <p className="muted">Collection Date</p>
            <p className="muted">Age / Sex</p>
            <p className="muted">Ref Doctor</p>
          </div>
          <div>
            <p> : {patient.name}</p>
            <p> : 08/06/2026 18:17</p>
            <p> : AIGG.21224108</p>
            <p> : 08/06/2026 12:52</p>
            <p> : {patient.age} Year(s) / Male</p>
            <p> : Dr. Nishanth Paturi</p>
          </div>
        </div>
      </section>

      <section className="report-section">
        <div className="report-section-head">
          <h3>
            <FileText size={20} /> BLOOD LEAD LEVELS
          </h3>
          <small className="muted">( Sample Type - EDTA Whole Blood )</small>
        </div>

        <div className="critical panel warn-panel">
          <strong>Critical Findings</strong>
        </div>

        <div className="result-card report-card">
          <div className="result-row">
            <div>Test Name</div>
            <div>Result</div>
            <div>Unit</div>
          </div>
          <div className="result-row result-item">
            <div>LEAD</div>
            <div className="result-value">
              <span className="up">↑ 8.2</span>
              <br />
              <span className="muted">High</span>
            </div>
            <div>ug/dL</div>
          </div>
        </div>

        <div className="result-graph-card report-card" aria-label="Lead level reference range">
          <h4>Reference Range</h4>
          <div className="result-graph" aria-hidden>
            <div className="graph-bar">
              <div className="graph-pointer" />
            </div>
          </div>
        </div>

        <details className="full-report">
          <summary>Full Report</summary>
          <article className="report-content report-card">
            <h4>BLOOD LEAD LEVELS</h4>
            <p>Interpretation:</p>
            <p className="muted">
              Toxicity &lt;15 Years - &gt;20 ; &gt;15 Years - &gt;70
            </p>
            <p className="muted">
              1. To assess occupational exposure sample should be collected at
              the end of the shift on the last day of the work week
            </p>
            <p>
              Comments
              <br />
              Lead is the most ubiquitous toxic metal detectable in practically
              all phases of the inert environment and in all biological
              systems... (truncated)
            </p>

            <div className="report-signature">
              <div className="signature-img">[signature]</div>
              <div>
                <div className="sig-name">Dr.G. DEEPIKA</div>
                <div className="sig-meta">
                  Director & HOD – Biochemistry
                  <br />
                  MBBS, MD
                </div>
              </div>
            </div>
          </article>
        </details>
      </section>
    </div>
  );
}
