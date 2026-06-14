import React, { useCallback, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  HeartPulse,
  Mic,
  MicOff,
  Phone,
  RefreshCw,
  Share2,
  ShieldAlert,
  Stethoscope,
  Volume2,
} from "lucide-react";
import PageHead from "../components/PageHead.jsx";
import { aiAnalyze, aiStartSession, aiSubmitAnswer, aiTranscribe } from "../api";

const QUESTION_KEYS = [
  "chief_complaint",
  "onset_duration",
  "character_quality",
  "location_radiation",
  "severity_score",
  "aggravating_relieving",
  "associated_symptoms",
  "medical_history",
  "medications_allergies",
  "red_flag_screen",
];

const QUESTION_LABELS = {
  chief_complaint: "Main concern",
  onset_duration: "When it started",
  character_quality: "How it feels",
  location_radiation: "Location",
  severity_score: "Severity (0–10)",
  aggravating_relieving: "Triggers & relief",
  associated_symptoms: "Other symptoms",
  medical_history: "Medical history",
  medications_allergies: "Medications & allergies",
  red_flag_screen: "Warning signs",
};

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी (Hindi)" },
  { value: "ta", label: "தமிழ் (Tamil)" },
  { value: "te", label: "తెలుగు (Telugu)" },
  { value: "kn", label: "ಕನ್ನಡ (Kannada)" },
  { value: "ml", label: "മലയാളം (Malayalam)" },
  { value: "bn", label: "বাংলা (Bengali)" },
  { value: "mr", label: "मराठी (Marathi)" },
  { value: "gu", label: "ગુજરાતી (Gujarati)" },
  { value: "pa", label: "ਪੰਜਾਬੀ (Punjabi)" },
];

const URGENCY_CONFIG = {
  emergency: {
    label: "Emergency",
    headline: "Seek immediate medical care",
    icon: AlertTriangle,
    className: "aid-urgency-emergency",
  },
  urgent: {
    label: "Urgent",
    headline: "See a doctor within 24 hours",
    icon: ShieldAlert,
    className: "aid-urgency-urgent",
  },
  routine: {
    label: "Routine",
    headline: "Schedule a doctor visit this week",
    icon: ClipboardList,
    className: "aid-urgency-routine",
  },
  monitor: {
    label: "Monitor",
    headline: "Rest, observe, and track symptoms",
    icon: CheckCircle2,
    className: "aid-urgency-monitor",
  },
};

const CONFIDENCE_META = {
  likely: { label: "Likely", className: "aid-conf-likely", score: 85 },
  possible: { label: "Possible", className: "aid-conf-possible", score: 55 },
  "less likely": { label: "Less likely", className: "aid-conf-less", score: 25 },
};

async function playBase64Audio(audioBase64) {
  return new Promise((resolve) => {
    const audio = new Audio(`data:audio/wav;base64,${audioBase64}`);
    audio.onended = resolve;
    audio.onerror = resolve;
    audio.play().catch(resolve);
  });
}

function formatTimestamp() {
  return new Date().toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function DiagnosisResults({ diagnosis, onStartOver, onShare }) {
  const urgency = URGENCY_CONFIG[diagnosis.urgency] || URGENCY_CONFIG.routine;
  const UrgIcon = urgency.icon;
  const answers = diagnosis.answers || {};
  const answerEntries = QUESTION_KEYS.filter((k) => answers[k]).map((k) => ({
    key: k,
    label: QUESTION_LABELS[k],
    value: answers[k],
  }));

  return (
    <div className="aid-page aid-results-page">
      <PageHead
        eyebrow="Assessment complete"
        title="Your Health Assessment"
        desc={`Generated on ${formatTimestamp()}`}
        icon={Activity}
      />

      <div className={`aid-result-hero panel ${urgency.className}`}>
        <div className="aid-result-hero-top">
          <div className="aid-result-hero-icon">
            <UrgIcon size={28} />
          </div>
          <div>
            <span className="aid-result-hero-badge">{urgency.label} priority</span>
            <h2>{urgency.headline}</h2>
            <p className="aid-result-hero-summary">{diagnosis.clinical_summary}</p>
          </div>
        </div>
        <div className="aid-result-meta-grid">
          <div className="aid-result-meta-card">
            <CalendarClock size={18} />
            <div>
              <span>Recommended timeline</span>
              <strong>{diagnosis.care_timeline}</strong>
            </div>
          </div>
          <div className="aid-result-meta-card">
            <HeartPulse size={18} />
            <div>
              <span>Conditions reviewed</span>
              <strong>{diagnosis.differentials.length} possibilities</strong>
            </div>
          </div>
          <div className="aid-result-meta-card">
            <Clock3 size={18} />
            <div>
              <span>Questions answered</span>
              <strong>{answerEntries.length || 10} of 10</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="panel aid-section aid-section-highlight">
        <h3>Why this urgency level?</h3>
        <p className="aid-body-text">{diagnosis.urgency_reason}</p>
        {diagnosis.reassuring_notes && (
          <p className="aid-reassure-text">{diagnosis.reassuring_notes}</p>
        )}
      </div>

      {diagnosis.red_flags_detected?.length > 0 && (
        <div className="panel aid-section aid-redflags-section">
          <h3>
            <AlertTriangle size={18} /> Warning signs detected
          </h3>
          <ul className="aid-redflags-list">
            {diagnosis.red_flags_detected.map((flag, i) => (
              <li key={i}>{flag}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel aid-section">
        <h3>Possible conditions</h3>
        <p className="aid-section-desc">
          Ranked by how well they match your reported symptoms. This is not a final diagnosis.
        </p>
        <div className="aid-diff-grid">
          {diagnosis.differentials.map((d, i) => {
            const conf = CONFIDENCE_META[d.confidence] || CONFIDENCE_META.possible;
            return (
              <div key={i} className="aid-diff-card-v2">
                <div className="aid-diff-card-head">
                  <span className="aid-diff-rank">#{i + 1}</span>
                  <div>
                    <div className="aid-diff-name">{d.condition_name}</div>
                    <span className={`aid-conf-badge ${conf.className}`}>{conf.label}</span>
                  </div>
                </div>
                <div className="aid-conf-meter">
                  <div className="aid-conf-meter-fill" style={{ width: `${conf.score}%` }} />
                </div>
                {d.brief_reason && <p className="aid-diff-reason">{d.brief_reason}</p>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="aid-two-col">
        <div className="panel aid-section">
          <h3>Recommended next steps</h3>
          <ol className="aid-numbered-steps">
            {diagnosis.next_steps.map((step, i) => (
              <li key={i}>
                <span className="aid-step-num">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="panel aid-section">
          <h3>When to seek care</h3>
          <div className="aid-when-box">{diagnosis.when_to_seek_care}</div>
        </div>
      </div>

      {answerEntries.length > 0 && (
        <div className="panel aid-section">
          <h3>Your reported symptoms</h3>
          <p className="aid-section-desc">Summary of what you shared during the interview.</p>
          <div className="aid-symptom-grid">
            {answerEntries.map(({ key, label, value }) => (
              <div key={key} className="aid-symptom-item">
                <span className="aid-symptom-label">{label}</span>
                <span className="aid-symptom-value">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="aid-disclaimer-full">
        <ShieldAlert size={16} />
        <span>{diagnosis.disclaimer}</span>
      </div>

      <div className="aid-result-actions">
        <button className="aid-btn aid-btn-primary" onClick={onStartOver}>
          <RefreshCw size={16} /> New assessment
        </button>
        <button className="aid-btn aid-btn-outline" onClick={onShare}>
          <Share2 size={16} /> Copy report
        </button>
      </div>
    </div>
  );
}

export default function AiDiagnosis() {
  const [screen, setScreen] = useState("welcome");
  const [language, setLanguage] = useState("en");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);

  const [sessionId, setSessionId] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [questionKey, setQuestionKey] = useState(QUESTION_KEYS[0]);
  const [questionText, setQuestionText] = useState("");
  const [agentSpeaking, setAgentSpeaking] = useState(false);

  const [recState, setRecState] = useState("idle");
  const [submitting, setSubmitting] = useState(false);
  const [transcript, setTranscript] = useState("");
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const mimeTypeRef = useRef("audio/webm");

  const [diagnosis, setDiagnosis] = useState(null);
  const [isEmergency, setIsEmergency] = useState(false);
  const [processingError, setProcessingError] = useState(null);

  const startSession = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const resp = await aiStartSession(language);
      setSessionId(resp.session_id);
      setQuestionIndex(0);
      setQuestionKey(QUESTION_KEYS[0]);
      setQuestionText(resp.first_question);
      setTranscript("");
      setScreen("interview");
      setAgentSpeaking(true);
      await playBase64Audio(resp.audio_base64);
      setAgentSpeaking(false);
    } catch (e) {
      setError("Failed to start session: " + (e?.response?.data?.detail || e.message));
    } finally {
      setStarting(false);
    }
  }, [language]);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";
      mimeTypeRef.current = mimeType.split(";")[0];
      const mr = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current });
        const reader = new FileReader();
        reader.onload = async () => {
          setRecState("transcribing");
          try {
            const base64 = reader.result.split(",")[1];
            const res = await aiTranscribe(sessionId, base64, language, mimeTypeRef.current);
            setTranscript(res.transcript);
          } catch (e) {
            setError("Transcription failed: " + (e?.response?.data?.detail || e.message));
          } finally {
            setRecState("idle");
          }
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecState("recording");
    } catch (e) {
      setError("Microphone access denied: " + e.message);
    }
  }, [sessionId, language]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && recState === "recording") {
      mediaRecorderRef.current.stop();
      setRecState("transcribing");
    }
  }, [recState]);

  const toggleRecording = () => {
    if (recState === "recording") stopRecording();
    else if (recState === "idle") startRecording();
  };

  const submitAnswer = useCallback(async () => {
    if (!transcript.trim()) {
      setError("Please provide an answer before continuing.");
      return;
    }
    if (submitting) return; // prevent double submission
    setSubmitting(true);
    setError(null);
    try {
      const resp = await aiSubmitAnswer(sessionId, questionKey, transcript.trim());

      if (resp.is_emergency) {
        setIsEmergency(true);
        return;
      }

      if (resp.is_complete) {
        setProcessingError(null);
        setScreen("processing");
        try {
          const dx = await aiAnalyze(sessionId);
          setDiagnosis(dx);
          if (dx.urgency === "emergency") setIsEmergency(true);
          setScreen("results");
        } catch (analyzeErr) {
          // Analysis failed — return to interview screen with a clear message
          const detail =
            analyzeErr?.response?.data?.detail || analyzeErr.message || "Analysis failed";
          setProcessingError(detail);
          setScreen("analyze-error");
        }
      } else {
        const nextIndex = questionIndex + 1;
        setQuestionIndex(nextIndex);
        setQuestionKey(QUESTION_KEYS[nextIndex]);
        setQuestionText(resp.next_question || "");
        setTranscript("");
        if (resp.audio_base64) {
          setAgentSpeaking(true);
          await playBase64Audio(resp.audio_base64);
          setAgentSpeaking(false);
        }
      }
    } catch (e) {
      setError("Error: " + (e?.response?.data?.detail || e.message));
    } finally {
      setSubmitting(false);
    }
  }, [sessionId, questionKey, transcript, questionIndex, submitting]);

  const startOver = () => {
    setScreen("welcome");
    setSessionId(null);
    setTranscript("");
    setDiagnosis(null);
    setIsEmergency(false);
    setError(null);
    setProcessingError(null);
    setQuestionIndex(0);
    setRecState("idle");
    setSubmitting(false);
    setAgentSpeaking(false);
  };

  const shareResults = () => {
    if (!diagnosis) return;
    const lines = [
      "JeevaKosha — AI Health Assessment Report",
      `Date: ${formatTimestamp()}`,
      "",
      `Priority: ${diagnosis.urgency.toUpperCase()}`,
      `Timeline: ${diagnosis.care_timeline}`,
      "",
      "Summary:",
      diagnosis.clinical_summary,
      "",
      "Why this urgency:",
      diagnosis.urgency_reason,
      "",
      "Possible conditions:",
      ...diagnosis.differentials.map(
        (d, i) => `${i + 1}. ${d.condition_name} (${d.confidence}) — ${d.brief_reason}`
      ),
      "",
      "Next steps:",
      ...diagnosis.next_steps.map((s, i) => `${i + 1}. ${s}`),
      "",
      "When to seek care:",
      diagnosis.when_to_seek_care,
      "",
      diagnosis.disclaimer,
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      alert("Assessment report copied to clipboard.");
    });
  };

  const progress = Math.round(((questionIndex + 1) / 10) * 100);

  if (isEmergency) {
    return (
      <div className="aid-emergency-overlay">
        <AlertTriangle size={64} />
        <h2>EMERGENCY</h2>
        <p>
          This sounds serious. Please go to the nearest emergency room or call emergency
          services right now. Do not wait.
        </p>
        <a href="tel:112" className="aid-btn aid-btn-danger aid-btn-lg">
          <Phone size={20} /> Call 112
        </a>
        <button className="aid-btn aid-btn-ghost" onClick={startOver}>
          Start over
        </button>
      </div>
    );
  }

  if (screen === "welcome") {
    return (
      <div className="aid-page">
        <PageHead
          eyebrow="AI Diagnosis"
          title="Voice Health Assessment"
          desc="Answer 10 questions about your symptoms and receive a preliminary AI analysis."
          icon={Stethoscope}
        />
        <div className="aid-welcome-card panel">
          <div className="aid-welcome-icon">
            <Stethoscope size={40} />
          </div>
          <h2>How it works</h2>
          <ol className="aid-steps">
            <li>Select your language</li>
            <li>Answer 10 spoken questions about your symptoms</li>
            <li>Speak your answers into the microphone</li>
            <li>Receive a structured AI health assessment report</li>
          </ol>
          <div className="aid-lang-row">
            <label className="aid-label">Select language</label>
            <select
              className="aid-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="aid-error">{error}</p>}
          <button
            className="aid-btn aid-btn-primary"
            onClick={startSession}
            disabled={starting}
          >
            {starting ? "Starting…" : "Start Assessment"}
            {!starting && <ChevronRight size={18} />}
          </button>
          <p className="aid-disclaimer-small">
            This tool provides general health information only. It is not a substitute for
            professional medical advice, diagnosis, or treatment.
          </p>
        </div>
      </div>
    );
  }

  if (screen === "processing") {
    return (
      <div className="aid-page aid-center">
        <div className="aid-processing">
          <div className="aid-spinner" />
          <p className="aid-processing-text">Analysing your symptoms…</p>
          <p className="muted" style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
            MedGemma is reviewing your answers. This may take a moment.
          </p>
        </div>
      </div>
    );
  }

  if (screen === "analyze-error") {
    return (
      <div className="aid-page aid-center">
        <div className="panel aid-analysis-error">
          <AlertTriangle size={40} className="aid-error-icon" />
          <h3>Analysis could not be completed</h3>
          <p className="aid-body-text" style={{ marginTop: "0.5rem" }}>
            {processingError || "An unexpected error occurred while analysing your answers."}
          </p>
          <p className="muted" style={{ fontSize: "0.82rem", marginTop: "0.75rem" }}>
            Your 10 answers were saved. You can retry the analysis or start a new session.
          </p>
          <div className="aid-btn-row" style={{ marginTop: "1.25rem" }}>
            <button
              className="aid-btn aid-btn-primary"
              onClick={async () => {
                setProcessingError(null);
                setScreen("processing");
                try {
                  const dx = await aiAnalyze(sessionId);
                  setDiagnosis(dx);
                  if (dx.urgency === "emergency") setIsEmergency(true);
                  setScreen("results");
                } catch (e) {
                  const detail = e?.response?.data?.detail || e.message || "Analysis failed";
                  setProcessingError(detail);
                  setScreen("analyze-error");
                }
              }}
            >
              <RefreshCw size={16} /> Retry analysis
            </button>
            <button className="aid-btn aid-btn-outline" onClick={startOver}>
              Start over
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "results" && diagnosis) {
    return (
      <DiagnosisResults
        diagnosis={diagnosis}
        onStartOver={startOver}
        onShare={shareResults}
      />
    );
  }

  return (
    <div className="aid-page">
      <PageHead
        eyebrow={`Question ${questionIndex + 1} of 10`}
        title="Symptom Interview"
        desc="Speak your answer clearly after tapping the microphone."
        icon={Mic}
      />

      <div className="aid-progress-track">
        <div className="aid-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <p className="aid-progress-label">{progress}% complete</p>

      <div className="panel aid-question-card">
        <span className="aid-q-badge">Q{questionIndex + 1}</span>
        <p className="aid-q-text">{questionText}</p>
      </div>

      {agentSpeaking && (
        <div className="aid-speaking-bar">
          <Volume2 size={18} />
          <span>Agent is speaking…</span>
        </div>
      )}

      <div className="aid-mic-wrap">
        <button
          className={`aid-mic-btn ${recState === "recording" ? "aid-mic-recording" : ""} ${recState === "transcribing" ? "aid-mic-processing" : ""}`}
          onClick={toggleRecording}
          disabled={agentSpeaking || recState === "transcribing"}
        >
          {recState === "recording" ? <MicOff size={32} /> : <Mic size={32} />}
        </button>
        <p className="aid-mic-label">
          {recState === "recording"
            ? "Recording… tap to stop"
            : recState === "transcribing"
            ? "Transcribing…"
            : "Tap to speak"}
        </p>
      </div>

      <div className="panel aid-transcript-box">
        <textarea
          className="aid-transcript-area"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Your answer will appear here. You can also type directly."
          rows={4}
        />
      </div>

      {error && <p className="aid-error">{error}</p>}

      <div className="aid-btn-row">
        <button
          className="aid-btn aid-btn-outline"
          onClick={() => {
            setTranscript("");
            setError(null);
          }}
        >
          <RefreshCw size={15} /> Clear
        </button>
        <button
          className="aid-btn aid-btn-primary"
          onClick={submitAnswer}
          disabled={!transcript.trim() || recState !== "idle" || agentSpeaking || submitting}
        >
          {submitting
            ? (questionIndex < 9 ? "Saving…" : "Analysing…")
            : (questionIndex < 9 ? "Next" : "Analyse")}
          {!submitting && <ChevronRight size={18} />}
        </button>
      </div>
    </div>
  );
}
