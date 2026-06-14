import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./contexts/AuthContext.jsx";
import { fetchHospitals } from "./api";
import {
  Activity,
  Baby,
  Bell,
  Bone,
  Brain,
  CalendarCheck,
  Clock3 as ClockIcon,
  ClipboardList,
  ClipboardPlus,
  Droplets,
  Ear,
  FileText,
  Gauge,
  Heart,
  HeartPulse as HeartPulseIcon,
  Home,
  Hospital,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MapPin,
  Microscope,
  NotebookText,
  Pill,
  ReceiptText,
  Search,
  Share2,
  ShieldCheck,
  Siren,
  Stethoscope,
  UserRound,
  UserRoundPlus,
  Users,
  WalletCards,
  MessageCircle,
} from "lucide-react";
import Brand from "./components/Brand.jsx";
import Button from "./components/Button.jsx";
import Icon, { IconBadge, HeartPulse } from "./components/Icon.jsx";
import PageHead from "./components/PageHead.jsx";
import AddPatientModal from "./components/AddPatientModal.jsx";
import Landing from "./pages/Landing.jsx";
import Patients from "./pages/Patients.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Hospitals from "./pages/Hospitals.jsx";
import HospitalVault from "./pages/HospitalVault.jsx";
import ReportFoldersPage from "./pages/ReportFoldersPage.jsx";
import Documents from "./pages/Documents.jsx";
import Chat from "./pages/Chat.jsx";
import HealthDashboard from "./pages/HealthDashboard.jsx";
import Profile from "./pages/Profile.jsx";

const h = React.createElement;
const iconProps = { size: 22, strokeWidth: 2.1, "aria-hidden": true };

const initialPatients = [
  { id: 1, name: "Ananya Rao", relation: "Self", age: 34, blood: "B+", phone: "+91 98765 21011", risk: "Stable" },
  { id: 2, name: "Ravi Rao", relation: "Father", age: 67, blood: "O+", phone: "+91 98450 11228", risk: "Monitor BP" },
  { id: 3, name: "Mira Rao", relation: "Daughter", age: 9, blood: "A+", phone: "+91 99162 33410", risk: "Vaccines due" },
];

const specialties = [
  "Gastroenterology",
  "Hepatology",
  "Cardiology",
  "Oncology",
  "Neurology",
  "ENT",
  "Orthopedics",
  "Pulmonology",
  "Dermatology",
  "Nephrology",
  "Endocrinology",
  "Pediatrics",
];

const doctors = [
  { name: "Dr. Kavya Menon", specialty: "Gastroenterology", exp: "14 years", rating: "4.9", initials: "KM", next: "10:30 AM", photoIndex: 1 },
  { name: "Dr. Arjun Varma", specialty: "Hepatology", exp: "11 years", rating: "4.8", initials: "AV", next: "12:15 PM", photoIndex: 0 },
  { name: "Dr. Sana Iqbal", specialty: "Cardiology", exp: "16 years", rating: "4.9", initials: "SI", next: "09:00 AM", photoIndex: 3 },
  { name: "Dr. Neel Reddy", specialty: "Oncology", exp: "13 years", rating: "4.7", initials: "NR", next: "03:00 PM", photoIndex: 2 },
  { name: "Dr. Priya Shah", specialty: "Neurology", exp: "10 years", rating: "4.8", initials: "PS", next: "05:45 PM", photoIndex: 4 },
  { name: "Dr. Vivek Nair", specialty: "ENT", exp: "9 years", rating: "4.6", initials: "VN", next: "11:45 AM", photoIndex: 5 },
  { name: "Dr. Meera Thomas", specialty: "Orthopedics", exp: "15 years", rating: "4.8", initials: "MT", next: "04:20 PM", photoIndex: 6 },
  { name: "Dr. Kabir Anand", specialty: "Pulmonology", exp: "12 years", rating: "4.7", initials: "KA", next: "02:10 PM", photoIndex: 7 },
];

const timeline = [
  { date: "10 Jun 2026", type: "Report", title: "Liver function panel", meta: "Diagnostic report uploaded", tone: "teal" },
  { date: "03 Jun 2026", type: "Prescription", title: "Digestive care prescription", meta: "Dr. Kavya Menon", tone: "blue" },
  { date: "28 May 2026", type: "Bill", title: "Consultation invoice", meta: "Aster Prime Hospital", tone: "amber" },
  { date: "12 May 2026", type: "Visit", title: "Gastroenterology follow-up", meta: "Symptoms improved", tone: "green" },
];

const features = [
  ["Vault", "Reports and prescriptions", "Upload diagnostics, doctor notes, medicine plans, and discharge summaries against each patient."],
  ["Slots", "Appointments and slots", "Find doctors by hospital and specialty, view available slots, and request emergency consultations."],
  ["Assist", "Symptoms checker", "Capture symptoms before a visit and route the family member to relevant specialties."],
  ["Track", "Bills and visit timeline", "Keep consultation bills, diagnostics, health checkups, and hospital visits ordered by date."],
];

const recordTypes = [
  ["Diagnostics", "Blood tests, imaging, scans, pathology, and lab summaries."],
  ["Prescriptions", "Medicines, dosage plans, refills, and doctor instructions."],
  ["Visit Notes", "Hospital visits, symptoms, diagnosis notes, and follow-up advice."],
  ["Bills", "Consultation bills, lab invoices, packages, and payment references."],
  ["Vitals", "Blood pressure, sugar logs, weight, temperature, and pulse history."],
  ["Emergency", "Allergies, blood group, emergency contacts, and critical alerts."],
];

const trustPoints = [
  ["OTP-first access", "Mobile verification keeps account entry simple and familiar."],
  ["Patient-owned records", "Each family member has a dedicated health profile and timeline."],
  ["Consent-ready sharing", "Designed for controlled sharing with hospitals and doctors."],
  ["One family dashboard", "Parents, children, and elders can be managed from one account."],
];

const useCases = [
  ["For parents", "Track vaccinations, pediatric prescriptions, school health forms, and recurring symptoms."],
  ["For elders", "Keep chronic-care records, cardiac reviews, diabetes logs, prescriptions, and bills together."],
  ["For emergencies", "Open blood group, allergies, serious symptoms, and prior hospital details quickly."],
];

const faqs = [
  ["Can I add my family members?", "Yes. After login, you can select an existing patient or add a new family member."],
  ["Can I book doctors by specialty?", "Yes. Choose hospital, specialty, doctor, date, and available slot from the booking flow."],
  ["What OTP should I use in this prototype?", "Use 123456 to continue through the demo OTP screen."],
];

const visitorCards = [
  ["Online Services", "Access reports, prescriptions, bills, and appointments from one place.", "Vault"],
  ["Find a Hospital", "Continue with previous hospitals or choose a new care location.", "Hospitals"],
  ["Find a Doctor", "Browse doctors by specialty, rating, availability, and emergency access.", "Doctors"],
  ["Connect With Care", "Prepare symptoms and carry visit context into the next appointment.", "Care"],
];

const articleCards = [
  ["Patient Records", "How a family health vault prevents missing reports during hospital visits."],
  ["Appointments", "What to keep ready before choosing a specialty and doctor slot."],
  ["Emergency Care", "Why blood group, allergies, and critical notes should be one tap away."],
];

const dashboardActions = [
  ["Specialty", "Search by specialty", "Find care by gastroenterology, cardiology, neurology and more.", "specialties"],
  ["Hospital", "Select hospital", "Choose a previous hospital or new hospital visit.", "hospitals"],
  ["Booking", "Book appointment", "Reserve an available calendar slot.", "specialties"],
  ["Triage", "Symptoms checker", "Capture symptoms before choosing a doctor.", "specialties"],
  ["Checks", "Health checkups", "Compare preventive packages and lab visits.", "dashboard"],
  ["Reports", "Reports", "View diagnostics and medical documents.", "dashboard"],
  ["Rx", "Prescriptions", "Doctor medicine plans and refills.", "dashboard"],
  ["Bills", "Bills", "Consultation and diagnostics billing history.", "dashboard"],
];

const specialtyIcons = {
  Gastroenterology: Stethoscope,
  Hepatology: Activity,
  Cardiology: HeartPulseIcon,
  Oncology: ShieldCheck,
  Neurology: Brain,
  ENT: Ear,
  Orthopedics: Bone,
  Pulmonology: Activity,
  Dermatology: ShieldCheck,
  Nephrology: Droplets,
  Endocrinology: Gauge,
  Pediatrics: Baby,
};

const featureIcons = {
  Vault: FileText,
  Slots: CalendarCheck,
  Assist: ClipboardPlus,
  Track: ClipboardList,
};

const recordIcons = {
  Diagnostics: Microscope,
  Prescriptions: Pill,
  "Visit Notes": NotebookText,
  Bills: ReceiptText,
  Vitals: HeartPulseIcon,
  Emergency: Siren,
};

const timelineIcons = {
  Report: FileText,
  Prescription: Pill,
  Bill: ReceiptText,
  Visit: Stethoscope,
};

const trustIcons = {
  "OTP-first access": KeyRound,
  "Patient-owned records": UserRound,
  "Consent-ready sharing": Share2,
  "One family dashboard": Users,
};

const visitorIcons = {
  Vault: FileText,
  Hospitals: Hospital,
  Doctors: Stethoscope,
  Care: HeartPulseIcon,
};

const actionIcons = {
  Specialty: Search,
  Hospital,
  Booking: CalendarCheck,
  Triage: ClipboardPlus,
  Checks: HeartPulseIcon,
  Reports: FileText,
  Rx: Pill,
  Bills: WalletCards,
};

const navIcons = {
  Home,
  Patients: Users,
  Hospitals: Hospital,
  Profile: UserRound,
  Dashboard: LayoutDashboard,
  Chat: MessageCircle,
};

const metricIcons = {
  "patient profile": UserRound,
  "mobile-first access": KeyRound,
  "emergency path": Siren,
  "family dashboard": Users,
  "records this month": FileText,
  "upcoming visits": CalendarCheck,
  "health alert": Bell,
};

function App() {
  const { user, loading, login, signup, logout: authLogout } = useAuth();
  const [screen, setScreen] = useState("landing");
  const [authMode, setAuthMode] = useState(null);
  const [patients, setPatients] = useState(initialPatients);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [activeHospital, setActiveHospital] = useState(null);
  const [vaultFolder, setVaultFolder] = useState(null);
  const [selectedReportFolder, setSelectedReportFolder] = useState(null);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [selectedSpecialty, setSelectedSpecialty] = useState(null);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [selectedDay, setSelectedDay] = useState(1);
  const [selectedSlot, setSelectedSlot] = useState("10:30 AM");
  const [slide, setSlide] = useState(0);
  const [toast, setToast] = useState("");
  const [addPatientModal, setAddPatientModal] = useState(false);

  const { data: apiHospitals = [] } = useQuery({
    queryKey: ["hospitals"],
    queryFn: fetchHospitals,
    enabled: !!user,
  });

  useEffect(() => {
    if (!loading && user && screen === "landing") {
      setScreen("dashboard");
    }
  }, [loading, user, screen]);

  useEffect(() => {
    if (screen !== "landing" || authMode) return undefined;
    const timer = window.setInterval(() => setSlide((current) => (current + 1) % 3), 5200);
    return () => window.clearInterval(timer);
  }, [screen, authMode]);

  function openAuth(mode) {
    setAuthMode(mode);
  }

  function completeAuth() {
    setAuthMode(null);
    setScreen("dashboard");
  }

  function logout() {
    authLogout();
    setScreen("landing");
    setSelectedPatient(null);
    setActiveHospital(null);
    setVaultFolder(null);
    setSelectedReportFolder(null);
    setSelectedHospital(null);
    setSelectedSpecialty(null);
    setSelectedDoctor(null);
    setToast("");
  }

  function addPatient() {
    setAddPatientModal(true);
  }

  function createPatient(payload) {
    const id = patients.length + 1;
    const patient = {
      id,
      name: payload.name || `New Patient ${id}`,
      relation: payload.relation || "Family",
      age: payload.age || 0,
      blood: payload.blood || "Unknown",
      phone: payload.phone || "",
      risk: "Profile draft",
    };
    setPatients((p) => [...p, patient]);
    setAddPatientModal(false);
    setToast(`${patient.name} added`);
    setTimeout(() => setToast(""), 3000);
  }

  function navigate(next) {
    setScreen(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const commonProps = {
    screen,
    navigate,
    logout,
    patients,
    selectedPatient,
    selectedHospital,
    selectedSpecialty,
    selectedDoctor,
    setSelectedPatient,
    setSelectedHospital,
    setSelectedSpecialty,
    setSelectedDoctor,
    selectedDay,
    selectedSlot,
    setSelectedDay,
    setSelectedSlot,
    setToast,
    addPatient,
    apiHospitals,
    activeHospital,
    setActiveHospital,
    vaultFolder,
    setVaultFolder,
    selectedReportFolder,
    setSelectedReportFolder,
    specialties,
    doctors,
    specialtyIcons,
    features,
    recordTypes,
    trustPoints,
    useCases,
    faqs,
    articleCards,
    timeline,
  };

  if (loading) {
    return h("div", { className: "site-shell", style: { minHeight: "100vh", display: "grid", placeItems: "center" } }, h("p", { className: "muted" }, "Loading JeevaKosha…"));
  }

  return h(
    React.Fragment,
    null,
    screen === "landing" &&
      h(Landing, { slide, setSlide, openAuth, visitorCards, features, recordTypes, trustPoints, useCases, doctors, faqs, articleCards, visitorIcons, featureIcons, recordIcons, metricIcons, trustIcons }),
    screen === "patients" &&
      h(AppShell, { active: "Patients", logout, navigate, user }, h(Patients, commonProps)),
    screen === "dashboard" &&
      h(AppShell, { active: "Home", logout, navigate, user }, h(Dashboard, { ...commonProps, apiHospitals })),
    screen === "hospitals" &&
      h(AppShell, { active: "Hospitals", logout, navigate, user }, h(Hospitals, commonProps)),
    screen === "hospital-vault" &&
      h(AppShell, { active: "Hospitals", logout, navigate, user }, h(HospitalVault, { hospital: activeHospital, navigate, setVaultFolder })),
    screen === "report-folders" &&
      h(AppShell, { active: "Hospitals", logout, navigate, user }, h(ReportFoldersPage, { hospital: activeHospital, navigate, setSelectedReportFolder })),
    screen === "documents" &&
      h(AppShell, { active: "Hospitals", logout, navigate, user }, h(Documents, { hospital: activeHospital, vaultFolder, selectedReportFolder, navigate, setToast })),
    screen === "chat" &&
      h(AppShell, { active: "Chat", logout, navigate, user }, h(Chat, { navigate })),
    screen === "health-dashboard" &&
<<<<<<< HEAD
      h(AppShell, { active: "Dashboard", logout, navigate, user }, h(HealthDashboard)),
    screen === "profile" &&
      h(AppShell, { active: "Profile", logout, navigate, user }, h(Profile, { user })),
=======
      h(AppShell, { active: "Dashboard", logout, navigate, user }, h(HealthDashboard, {
        navigate,
        setActiveHospital,
        setVaultFolder,
        setSelectedReportFolder,
      })),
>>>>>>> cc7f9fd (Initial commmit)
    authMode &&
      h(AuthModal, {
        mode: authMode,
        login,
        signup,
        onClose: () => setAuthMode(null),
        onComplete: completeAuth,
      }),
    addPatientModal && h(AddPatientModal, { onClose: () => setAddPatientModal(false), onSubmit: createPatient }),
    toast && h("div", { className: "toast" }, toast)
  );
}

// Landing moved to ./pages/Landing.jsx

// Carousel moved to pages/Landing.jsx
function AuthModal({ mode, login, signup, onClose, onComplete }) {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isSignup = mode === "signup";

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form.entries());
    setSubmitting(true);
    try {
      if (isSignup) {
        const name = `${values.firstName} ${values.lastName}`.trim();
        if (!name || !values.email || !values.password) {
          setError("Please complete name, email, and password.");
          return;
        }
        await signup(name, values.email, values.password);
      } else {
        if (!values.email || !values.password) {
          setError("Please enter email and password.");
          return;
        }
        await login(values.email, values.password);
      }
      onComplete();
    } catch (err) {
      setError(err.response?.data?.detail ?? err.message ?? "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return h(
    "div",
    { className: "modal-backdrop" },
    h(
      "section",
      { className: "modal", role: "dialog", "aria-modal": "true" },
      h("div", { className: "modal-rail" }),
      h(
        "div",
        { className: "modal-head" },
        h("div", null, h("span", { className: "eyebrow" }, h(HeartPulse), isSignup ? "New account" : "Welcome back"), h("h2", null, isSignup ? "Create Jeevakosh account" : "Sign in to Jeevakosh"), h("p", { className: "muted" }, isSignup ? "Register with your email to access your health vault." : "Use your email and password to continue.")),
        h("button", { className: "icon-btn", onClick: onClose, "aria-label": "Close" }, "X")
      ),
      h(
        "form",
        { onSubmit: handleSubmit },
        isSignup && h(SignupFields),
        !isSignup && h(Field, { label: "Email", name: "email", type: "email", placeholder: "you@example.com" }),
        h(Field, { label: "Password", name: "password", type: "password", placeholder: "••••••••" }),
        h("p", { className: "error" }, error),
        h(Button, { type: "submit", disabled: submitting }, submitting ? "Please wait…" : isSignup ? "Create account" : "Sign in")
      )
    )
  );
}

function SignupFields() {
  return h(
    "div",
    { className: "form-grid" },
    h(Field, { label: "First name", name: "firstName" }),
    h(Field, { label: "Last name", name: "lastName" }),
    h(Field, { label: "Email ID", name: "email", type: "email" })
  );
}

function Field({ label, name, type = "text", placeholder = "", maxLength, textarea = false, full = false }) {
  return h(
    "label",
    { className: `field ${full ? "full" : ""}` },
    h("span", null, label),
    textarea ? h("textarea", { name, required: true, placeholder }) : h("input", { name, type, required: true, placeholder, maxLength })
  );
}

function SelectField({ label, name, options }) {
  return h(
    "label",
    { className: "field" },
    h("span", null, label),
    h("select", { name, required: true }, h("option", { value: "" }, "Select"), options.map((option) => h("option", { key: option }, option)))
  );
}

function AppShell({ active, logout, navigate, user, children }) {
  const items = ["Home", "Patients", "Hospitals", "Profile", "Chat", "Dashboard"];
  return h(
    "div",
    { className: "app-layout" },
    h(
      "aside",
      { className: "sidebar" },
      h(Brand, { light: true }),
      h("div", { className: "side-card" }, h("span", null, h(Bell, iconProps), "Signed in"), h("strong", null, user?.name ?? "User"), h("p", null, user?.email ?? "")),
      h(
        "nav",
        { className: "side-nav" },
        items.map((item) => h(SideButton, { key: item, item, active, navigate })),
        h("button", { onClick: logout }, h(LogOut, iconProps), "Logout")
      )
    ),
    h("main", { className: "main" }, children)
  );
}

function SideButton({ item, active, navigate }) {
  const routes = { Home: "dashboard", Patients: "patients", Hospitals: "hospitals", Profile: "profile", Chat: "chat", Dashboard: "health-dashboard" };
  return h("button", { className: active === item ? "active" : "", onClick: () => navigate(routes[item]) }, h(Icon, { icon: navIcons[item] || MessageCircle }), item);
}

const AppContext = React.createContext({ navigate: () => {} });

// Patients moved to ./pages/Patients.jsx

// Dashboard moved to ./pages/Dashboard.jsx

// Hospitals moved to ./pages/Hospitals.jsx

// Specialties moved to ./pages/Specialties.jsx

// Doctors moved to ./pages/Doctors.jsx

// Slots moved to ./pages/Slots.jsx

function Timeline() {
  return h("div", { className: "timeline" }, timeline.map((item) => h("article", { className: `timeline-card ${item.tone}`, key: item.title }, h("div", { className: "timeline-date" }, item.date), h("div", null, h("h3", null, h(Icon, { icon: timelineIcons[item.type] || ClipboardList }), item.title), h("p", { className: "muted" }, item.meta)), h("span", { className: "badge" }, h(Icon, { icon: timelineIcons[item.type] || ClipboardList, size: 15 }), item.type))));
}

function ActionTile({ icon, title, body, onClick }) {
  return h(
    "button",
    { className: "action-tile selectable", onClick },
    h(IconBadge, { icon, className: "tile-icon" }),
    h("div", null, h("h3", null, title), h("p", { className: "muted" }, body)),
    h("span", { className: "tile-cta" }, h(Icon, { icon: Search, size: 15 }), "Open")
  );
}

function FlashCard({ icon, title, body }) {
  return h("article", { className: "flash-card" }, h(IconBadge, { icon, className: "feature-icon" }), h("h3", null, title), h("p", null, body));
}

// PageHead moved to ./components/PageHead.jsx

function Metric({ value, label }) {
  return h("div", { className: "metric" }, h(Icon, { icon: metricIcons[label] || Activity, size: 20 }), h("strong", null, value), h("span", null, label));
}

// Button moved to ./components/Button.jsx

// Icon, IconBadge, HeartPulse moved to ./components/Icon.jsx

// Brand moved to ./components/Brand.jsx

function initials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default App;
