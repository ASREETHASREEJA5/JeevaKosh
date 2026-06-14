import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ClipboardPlus,
  HeartPulse,
  Pencil,
  Pill,
  Save,
  Scissors,
  UserRound,
  X,
} from "lucide-react";
import PageHead from "../components/PageHead.jsx";
import Button from "../components/Button.jsx";
import { fetchProfile, updateProfile } from "../api";

const emptyPersonal = {
  full_name: "",
  date_of_birth: "",
  gender: "",
  blood_group: "",
  height_cm: "",
  weight_kg: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
};

const emptyEmergency = { name: "", relation: "", phone: "" };
const emptyCondition = { name: "", diagnosed_year: "", status: "Active", notes: "" };
const emptySurgery = { procedure: "", hospital: "", date: "", notes: "" };
const emptyMedication = {
  name: "",
  dosage: "",
  frequency: "",
  prescribed_by: "",
  start_date: "",
  reason: "",
};
const emptyAllergy = { allergen: "", reaction: "", severity: "Moderate" };

function mergeProfile(data) {
  return {
    personal: { ...emptyPersonal, ...(data?.personal || {}) },
    emergency_contact: { ...emptyEmergency, ...(data?.emergency_contact || {}) },
    chronic_conditions: data?.chronic_conditions?.length ? data.chronic_conditions : [],
    surgeries: data?.surgeries?.length ? data.surgeries : [],
    current_medications: data?.current_medications?.length ? data.current_medications : [],
    allergies: data?.allergies?.length ? data.allergies : [],
    doctor_notes: data?.doctor_notes || "",
  };
}

function display(value) {
  if (value === null || value === undefined || String(value).trim() === "") return "—";
  return value;
}

function Field({ label, value, onChange, type = "text", placeholder = "", full = false, options, readOnly = false }) {
  if (readOnly) {
    return (
      <div className={`profile-view-field ${full ? "full" : ""}`}>
        <span className="profile-view-label">{label}</span>
        <span className="profile-view-value">{display(value)}</span>
      </div>
    );
  }

  return (
    <label className={`field ${full ? "full" : ""}`}>
      <span>{label}</span>
      {options ? (
        <select value={value} onChange={onChange}>
          <option value="">Select</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <input type={type} value={value} placeholder={placeholder} onChange={onChange} />
      )}
    </label>
  );
}

function TextAreaField({ label, value, onChange, placeholder, readOnly = false }) {
  if (readOnly) {
    return (
      <div className="profile-view-field full">
        <span className="profile-view-label">{label}</span>
        <p className="profile-view-value block">{display(value)}</p>
      </div>
    );
  }

  return (
    <label className="field full">
      <span>{label}</span>
      <textarea value={value} placeholder={placeholder} onChange={onChange} rows={4} />
    </label>
  );
}

function ListSection({
  title,
  icon: Icon,
  items,
  editing,
  emptyItem,
  renderItem,
  renderViewItem,
  onAdd,
  onRemove,
  addLabel,
}) {
  return (
    <section className="profile-section panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">{title.toUpperCase()}</span>
          <h3>
            <Icon size={20} /> {title}
          </h3>
        </div>
        {editing && (
          <Button variant="ghost" icon={ClipboardPlus} onClick={onAdd}>
            {addLabel}
          </Button>
        )}
      </div>

      {items.length === 0 && (
        <p className="muted">{editing ? `Nothing added yet. Click "${addLabel}" to start.` : "No entries added."}</p>
      )}

      <div className="profile-list">
        {items.map((item, index) => (
          <div className="profile-list-item" key={index}>
            {editing ? renderItem(item, index) : renderViewItem(item, index)}
            {editing && (
              <button type="button" className="remove-row-btn" onClick={() => onRemove(index)}>
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Profile({ user }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(mergeProfile(null));
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: fetchProfile,
  });

  useEffect(() => {
    if (data) {
      setForm(mergeProfile(data));
      setEditing(!data.updated_at);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      setEditing(false);
      setToast("Profile saved successfully.");
      setTimeout(() => setToast(""), 3000);
    },
    onError: (err) => {
      setToast(err.response?.data?.detail || err.message || "Failed to save profile.");
      setTimeout(() => setToast(""), 4000);
    },
  });

  function setPersonal(field, value) {
    setForm((prev) => ({ ...prev, personal: { ...prev.personal, [field]: value } }));
  }

  function setEmergency(field, value) {
    setForm((prev) => ({
      ...prev,
      emergency_contact: { ...prev.emergency_contact, [field]: value },
    }));
  }

  function updateList(key, index, field, value) {
    setForm((prev) => {
      const list = [...prev[key]];
      list[index] = { ...list[index], [field]: value };
      return { ...prev, [key]: list };
    });
  }

  function addListItem(key, emptyItem) {
    setForm((prev) => ({ ...prev, [key]: [...prev[key], { ...emptyItem }] }));
  }

  function removeListItem(key, index) {
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].filter((_, i) => i !== index),
    }));
  }

  function handleSave() {
    const payload = {
      ...form,
      chronic_conditions: form.chronic_conditions.filter((c) => c.name?.trim()),
      surgeries: form.surgeries.filter((s) => s.procedure?.trim()),
      current_medications: form.current_medications.filter((m) => m.name?.trim()),
      allergies: form.allergies.filter((a) => a.allergen?.trim()),
    };
    saveMutation.mutate(payload);
  }

  function handleCancel() {
    setForm(mergeProfile(data));
    setEditing(false);
  }

  if (isLoading) {
    return <p className="dashboard-status">Loading your profile…</p>;
  }

  const readOnly = !editing;

  return (
    <div className="profile-page">
      <PageHead
        eyebrow="Patient portfolio"
        title="My health profile"
        desc="Your complete medical portfolio — show this to any doctor for a full picture of your health history, medicines, and allergies."
        icon={UserRound}
      />

      <div className="profile-actions">
        {!editing ? (
          <Button variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>
            Edit profile
          </Button>
        ) : (
          <>
            <Button icon={Save} onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save profile"}
            </Button>
            {data?.updated_at && (
              <Button variant="ghost" icon={X} onClick={handleCancel}>
                Cancel
              </Button>
            )}
          </>
        )}
        {data?.updated_at && (
          <span className="muted small">
            Last updated {new Date(data.updated_at).toLocaleString()}
          </span>
        )}
      </div>

      <section className="profile-section panel">
        <div className="section-head">
          <div>
            <span className="eyebrow">PERSONAL</span>
            <h3>
              <UserRound size={20} /> Personal details
            </h3>
          </div>
        </div>
        <div className="form-grid">
          <Field label="Full name" value={form.personal.full_name || user?.name || ""} readOnly={readOnly} onChange={(e) => setPersonal("full_name", e.target.value)} />
          <Field label="Date of birth" type="date" value={form.personal.date_of_birth} readOnly={readOnly} onChange={(e) => setPersonal("date_of_birth", e.target.value)} />
          <Field label="Gender" value={form.personal.gender} readOnly={readOnly} onChange={(e) => setPersonal("gender", e.target.value)} options={["Male", "Female", "Other", "Prefer not to say"]} />
          <Field label="Blood group" value={form.personal.blood_group} readOnly={readOnly} onChange={(e) => setPersonal("blood_group", e.target.value)} options={["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"]} />
          <Field label="Height (cm)" value={form.personal.height_cm} readOnly={readOnly} onChange={(e) => setPersonal("height_cm", e.target.value)} />
          <Field label="Weight (kg)" value={form.personal.weight_kg} readOnly={readOnly} onChange={(e) => setPersonal("weight_kg", e.target.value)} />
          <Field label="Phone" value={form.personal.phone} readOnly={readOnly} onChange={(e) => setPersonal("phone", e.target.value)} />
          <Field label="City" value={form.personal.city} readOnly={readOnly} onChange={(e) => setPersonal("city", e.target.value)} />
          <Field label="State" value={form.personal.state} readOnly={readOnly} onChange={(e) => setPersonal("state", e.target.value)} />
          <Field label="PIN code" value={form.personal.pincode} readOnly={readOnly} onChange={(e) => setPersonal("pincode", e.target.value)} />
          <Field label="Address" full value={form.personal.address} readOnly={readOnly} onChange={(e) => setPersonal("address", e.target.value)} placeholder="House no, street, area" />
        </div>
      </section>

      <section className="profile-section panel">
        <div className="section-head">
          <div>
            <span className="eyebrow">EMERGENCY</span>
            <h3>
              <AlertTriangle size={20} /> Emergency contact
            </h3>
          </div>
        </div>
        <div className="form-grid">
          <Field label="Contact name" value={form.emergency_contact.name} readOnly={readOnly} onChange={(e) => setEmergency("name", e.target.value)} />
          <Field label="Relation" value={form.emergency_contact.relation} readOnly={readOnly} onChange={(e) => setEmergency("relation", e.target.value)} placeholder="Spouse, parent, sibling…" />
          <Field label="Phone" value={form.emergency_contact.phone} readOnly={readOnly} onChange={(e) => setEmergency("phone", e.target.value)} />
        </div>
      </section>

      <ListSection
        title="Chronic conditions"
        icon={HeartPulse}
        items={form.chronic_conditions}
        editing={editing}
        emptyItem={emptyCondition}
        addLabel="Add condition"
        onAdd={() => addListItem("chronic_conditions", emptyCondition)}
        onRemove={(index) => removeListItem("chronic_conditions", index)}
        renderViewItem={(item) => (
          <div className="profile-view-grid">
            <div><strong>{display(item.name)}</strong>{item.status ? ` · ${item.status}` : ""}</div>
            {item.diagnosed_year && <div className="muted small">Since {item.diagnosed_year}</div>}
            {item.notes && <div className="muted small">{item.notes}</div>}
          </div>
        )}
        renderItem={(item, index) => (
          <div className="form-grid">
            <Field label="Condition" value={item.name} onChange={(e) => updateList("chronic_conditions", index, "name", e.target.value)} placeholder="Diabetes, Hypertension…" />
            <Field label="Diagnosed year" value={item.diagnosed_year} onChange={(e) => updateList("chronic_conditions", index, "diagnosed_year", e.target.value)} />
            <Field label="Status" value={item.status} onChange={(e) => updateList("chronic_conditions", index, "status", e.target.value)} options={["Active", "Managed", "Resolved"]} />
            <Field label="Notes" full value={item.notes} onChange={(e) => updateList("chronic_conditions", index, "notes", e.target.value)} />
          </div>
        )}
      />

      <ListSection
        title="Surgeries & operations"
        icon={Scissors}
        items={form.surgeries}
        editing={editing}
        emptyItem={emptySurgery}
        addLabel="Add surgery"
        onAdd={() => addListItem("surgeries", emptySurgery)}
        onRemove={(index) => removeListItem("surgeries", index)}
        renderViewItem={(item) => (
          <div className="profile-view-grid">
            <div><strong>{display(item.procedure)}</strong></div>
            {item.hospital && <div className="muted small">{item.hospital}</div>}
            {item.date && <div className="muted small">Date: {item.date}</div>}
            {item.notes && <div className="muted small">{item.notes}</div>}
          </div>
        )}
        renderItem={(item, index) => (
          <div className="form-grid">
            <Field label="Procedure / operation" value={item.procedure} onChange={(e) => updateList("surgeries", index, "procedure", e.target.value)} placeholder="Appendectomy, knee replacement…" />
            <Field label="Hospital" value={item.hospital} onChange={(e) => updateList("surgeries", index, "hospital", e.target.value)} />
            <Field label="Date" type="date" value={item.date} onChange={(e) => updateList("surgeries", index, "date", e.target.value)} />
            <Field label="Notes" full value={item.notes} onChange={(e) => updateList("surgeries", index, "notes", e.target.value)} />
          </div>
        )}
      />

      <ListSection
        title="Current medications"
        icon={Pill}
        items={form.current_medications}
        editing={editing}
        emptyItem={emptyMedication}
        addLabel="Add medicine"
        onAdd={() => addListItem("current_medications", emptyMedication)}
        onRemove={(index) => removeListItem("current_medications", index)}
        renderViewItem={(item) => (
          <div className="profile-view-grid">
            <div><strong>{display(item.name)}</strong>{item.dosage ? ` · ${item.dosage}` : ""}</div>
            {item.frequency && <div className="muted small">Frequency: {item.frequency}</div>}
            {item.prescribed_by && <div className="muted small">Prescribed by: {item.prescribed_by}</div>}
            {item.reason && <div className="muted small">Reason: {item.reason}</div>}
          </div>
        )}
        renderItem={(item, index) => (
          <div className="form-grid">
            <Field label="Medicine name" value={item.name} onChange={(e) => updateList("current_medications", index, "name", e.target.value)} />
            <Field label="Dosage" value={item.dosage} onChange={(e) => updateList("current_medications", index, "dosage", e.target.value)} placeholder="500 mg" />
            <Field label="Frequency" value={item.frequency} onChange={(e) => updateList("current_medications", index, "frequency", e.target.value)} placeholder="Once daily, BD, TDS…" />
            <Field label="Prescribed by" value={item.prescribed_by} onChange={(e) => updateList("current_medications", index, "prescribed_by", e.target.value)} />
            <Field label="Start date" type="date" value={item.start_date} onChange={(e) => updateList("current_medications", index, "start_date", e.target.value)} />
            <Field label="Reason" full value={item.reason} onChange={(e) => updateList("current_medications", index, "reason", e.target.value)} />
          </div>
        )}
      />

      <ListSection
        title="Allergies"
        icon={AlertTriangle}
        items={form.allergies}
        editing={editing}
        emptyItem={emptyAllergy}
        addLabel="Add allergy"
        onAdd={() => addListItem("allergies", emptyAllergy)}
        onRemove={(index) => removeListItem("allergies", index)}
        renderViewItem={(item) => (
          <div className="profile-view-grid">
            <div><strong>{display(item.allergen)}</strong>{item.severity ? ` · ${item.severity}` : ""}</div>
            {item.reaction && <div className="muted small">Reaction: {item.reaction}</div>}
          </div>
        )}
        renderItem={(item, index) => (
          <div className="form-grid">
            <Field label="Allergen" value={item.allergen} onChange={(e) => updateList("allergies", index, "allergen", e.target.value)} placeholder="Penicillin, peanuts, dust…" />
            <Field label="Reaction" value={item.reaction} onChange={(e) => updateList("allergies", index, "reaction", e.target.value)} placeholder="Rash, swelling, breathing difficulty…" />
            <Field label="Severity" value={item.severity} onChange={(e) => updateList("allergies", index, "severity", e.target.value)} options={["Mild", "Moderate", "Severe"]} />
          </div>
        )}
      />

      <section className="profile-section panel">
        <div className="section-head">
          <div>
            <span className="eyebrow">FOR YOUR DOCTOR</span>
            <h3>Additional notes</h3>
          </div>
        </div>
        <TextAreaField
          label="Anything else your doctor should know"
          value={form.doctor_notes}
          readOnly={readOnly}
          onChange={(e) => setForm((prev) => ({ ...prev, doctor_notes: e.target.value }))}
          placeholder="Family history, lifestyle habits, past hospitalizations, special instructions…"
        />
      </section>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
