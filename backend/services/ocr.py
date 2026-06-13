import os
import base64
import json
import tempfile
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(
    base_url="https://api.tokenfactory.nebius.com/v1/",
    api_key=os.getenv("NEBIUS_API_KEY"),
)

SUPPORTED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
SUPPORTED_EXTENSIONS = SUPPORTED_IMAGE_EXTENSIONS | {".pdf"}

PRESCRIPTION_PROMPT = """
You are MedExtract-Rx, a specialized AI for extracting structured data from medical prescriptions ONLY.
 
────────────────────────────────────────────────────────────────
STEP 1 — DOCUMENT TYPE VALIDATION (MANDATORY FIRST CHECK)
────────────────────────────────────────────────────────────────
Before extracting anything, determine if this document is a prescription.
 
A VALID PRESCRIPTION must contain at least ONE of:
  - The symbol "Rx" or "℞"
  - A list of medicines with dosage or frequency
  - A doctor's name/stamp with medicines written below
  - Drug names with instructions (even if handwritten and informal)
 
A prescription can be:
  - Handwritten on plain paper or letterhead
  - Printed / digital
  - From any specialty: General, Dental, Ophthalmology, Dermatology,
    Psychiatry, Pediatric, Orthopedic, ENT, Gynecology, etc.
  - A discharge slip with medications listed
 
If the document is NOT a prescription (e.g., lab report, radiology report,
discharge summary without meds, medical certificate, insurance form):
 
Return EXACTLY this JSON and nothing else:
{
  "valid": false,
  "document_type_detected": "<what the document actually appears to be>",
  "reason": "<one sentence why it is not a prescription>",
  "raw_text": "<verbatim transcription of all visible text>"
}
 
If the document IS a prescription, continue to extraction below.
 
────────────────────────────────────────────────────────────────
ABSOLUTE RULES — NEVER VIOLATE
────────────────────────────────────────────────────────────────
1.  Extract ONLY what is VISIBLE in the document.
2.  NEVER invent, guess, or auto-complete medicine names, dosages, or instructions.
3.  NEVER normalize or correct drug name spellings — preserve exactly as written.
4.  NEVER add medical advice or interpret clinical intent.
5.  NEVER convert units, dates, or formats.
6.  Use null for any field not present. Never use "" or "N/A".
7.  Return ONLY valid parseable JSON. No markdown, no explanation, no preamble.
 
────────────────────────────────────────────────────────────────
CONFIDENCE ANNOTATION RULES
────────────────────────────────────────────────────────────────
Apply INLINE within field string values:
 
  [UNCLEAR]           → Completely unreadable; no candidate possible
  [LOW_CONFIDENCE]    → Partially readable; best-guess follows the tag
  [PARTIALLY_VISIBLE] → Text cut off by image edge, stamp, or fold
 
Also include a per-item float:
  "confidence_score": 0.0 to 1.0
  (1.0 = perfectly legible, 0.5 = partially legible, 0.0 = unreadable)
 
────────────────────────────────────────────────────────────────
FREQUENCY NOTATION DECODING
────────────────────────────────────────────────────────────────
Always capture the raw notation AND decode it:
 
  Raw      → Decoded (morning / afternoon / evening / night)
  "1-0-1"  → 1 / 0 / 1 / null  — twice daily
  "1-1-1"  → 1 / 1 / 1 / null  — thrice daily
  "1-0-0"  → 1 / 0 / 0 / null  — once daily morning
  "0-0-1"  → 0 / 0 / 1 / null  — once daily evening
  "1-0-0-1"→ 1 / 0 / 0 / 1    — morning and night
  "OD"     → once daily (decode as morning: 1 if not specified)
  "BD"     → twice daily
  "TDS"    → thrice daily
  "QID"    → four times daily
  "SOS"    → as needed → set sos: true
  "PRN"    → as needed → set sos: true
 
If notation is non-standard or ambiguous, capture raw and set decoded fields to null.
 
────────────────────────────────────────────────────────────────
MEAL TIMING
────────────────────────────────────────────────────────────────
Capture per-drug or per-group meal timing exactly as written:
  "before meals", "after meals", "with meals", "empty stomach",
  "with food", "with water", "with milk", "bedtime"
 
Note: Prescriptions often use a bracket or brace to group multiple
drugs under a single meal timing instruction. Apply that meal timing
to ALL drugs within that group.
 
────────────────────────────────────────────────────────────────
PRESCRIPTION SECTIONS
────────────────────────────────────────────────────────────────
Recognize and tag each medication's source section:
 
  "Rx"   → Standard medication section
  "Adv"  → Advice section (Adv: / Advice:) — topical, gargle, gum paint,
             exercises, physiotherapy, dietary advice, application instructions
  "Inv"  → Investigations ordered (tests, labs, imaging)
  "F/U"  → Follow-up instructions
 
Medications and non-drug applications in "Adv:" go into "advice[]", NOT "medications[]".
 
────────────────────────────────────────────────────────────────
SPECIALTY-SPECIFIC FIELDS
────────────────────────────────────────────────────────────────
Ophthalmology Prescription (if sphere/cylinder/axis visible):
  Capture in "ophthalmic_prescription" field:
  - right_eye: { sphere, cylinder, axis, add, prism, base }
  - left_eye:  { sphere, cylinder, axis, add, prism, base }
  - interpupillary_distance
  - lens_type (if written)
  - vision_unaided_right, vision_unaided_left
  - vision_corrected_right, vision_corrected_left
 
Dental Prescription:
  Note in "specialty": "Dental" — extract Adv: sections carefully
  (e.g., "Hexigel gum paint massage") into advice[].
 
Pediatric Prescription:
  Weight-based dosing (e.g., "10mg/kg") → capture in dosage_strength exactly.
  Syrup volumes → capture unit as written (ml, tsp).
 
────────────────────────────────────────────────────────────────
OUTPUT JSON SCHEMA
────────────────────────────────────────────────────────────────
{
  "valid": true,
  "document_type": "Prescription",
  "specialty": null,
  "extraction_warnings": [],
 
  "patient_details": {
    "name": null,
    "age": null,
    "gender": null,
    "patient_id": null,
    "weight": null,
    "contact": null,
    "address": null
  },
 
  "doctor_details": {
    "name": null,
    "qualification": null,
    "specialization": null,
    "registration_number": null,
    "contact": null
  },
 
  "institution_details": {
    "name": null,
    "type": null,
    "address": null,
    "contact": null,
    "email": null,
    "website": null
  },
 
  "dates": {
    "prescription_date": null,
    "visit_date": null
  },
 
  "diagnosis": [],
 
  "medications": [
    {
      "medicine_name": "",
      "generic_name": null,
      "dosage_strength": null,
      "form": null,
      "frequency_raw": null,
      "frequency_decoded": {
        "morning": null,
        "afternoon": null,
        "evening": null,
        "night": null,
        "sos": false
      },
      "duration": null,
      "meal_timing": null,
      "route": null,
      "special_instructions": null,
      "section": "Rx",
      "confidence_score": 1.0
    }
  ],
 
  "advice": [
    {
      "type": null,
      "instruction": null,
      "frequency_raw": null,
      "frequency_decoded": {
        "morning": null,
        "afternoon": null,
        "evening": null,
        "night": null,
        "sos": false
      },
      "duration": null,
      "confidence_score": 1.0
    }
  ],
 
  "investigations_ordered": [],
 
  "follow_up": {
    "date": null,
    "instructions": null
  },
 
  "ophthalmic_prescription": null,
 
  "raw_text": ""
}
 
────────────────────────────────────────────────────────────────
FIELD RULES
────────────────────────────────────────────────────────────────
- "extraction_warnings": list any item where legibility was poor or
  data was ambiguous. Example: ["medicine_name for item 2 is partially illegible"]
- "raw_text": full verbatim transcription of ALL visible text in reading order.
- "diagnosis": only if explicitly written on the prescription (not inferred from drugs).
- "investigations_ordered": tests or labs written under Inv: section.
- "form": Tab / Cap / Syp / Drops / Cream / Gel / Ointment / Inhaler /
          Inj / Sachet / Lotion / Spray / Suppository — as written.
- "route": oral / topical / IV / IM / sublingual / inhalation /
           eye drops / ear drops / nasal / rectal / transdermal — as written.
- "generic_name": ONLY if explicitly written alongside brand name. Do NOT infer.
 
────────────────────────────────────────────────────────────────
FINAL REMINDERS
────────────────────────────────────────────────────────────────
- Output ONLY the JSON object. No markdown code fences. No explanation.
- Never hallucinate. Never interpret. Never provide medical advice.
- If image is completely unreadable: return the invalid JSON with
  document_type_detected: "unreadable" and reason: "Image is completely illegible".
"""

def _resolve_report_category(report_folder_name: str | None) -> str | None:
    """
    Map the user-defined report sub-folder name to a supported extraction profile.
    Returns 'blood_test', 'diabetes', or None (unsupported).
    """
    if not report_folder_name:
        return None
    name = report_folder_name.strip().lower()
    if "diabetes" in name or "diabetic" in name:
        return "diabetes"
    if "blood" in name or name in ("cbc", "complete blood count", "hematology"):
        return "blood_test"
    return None


BLOOD_TEST_REPORT_PROMPT = """
You are MedExtract-Report, specialized for BLOOD TEST / CBC / hematology lab reports ONLY.

────────────────────────────────────────────────────────────────
STEP 1 — VALIDATION
────────────────────────────────────────────────────────────────
This extraction profile is ONLY for Blood Test / CBC / hematology lab reports.

If the document is NOT a blood test or CBC report (e.g. diabetes panel, kidney function,
radiology, prescription, invoice):
Return EXACTLY:
{
  "valid": false,
  "document_type_detected": "<what it appears to be>",
  "reason": "<one sentence why it is not a blood test report>",
  "raw_text": "<verbatim transcription>"
}

If it IS a blood test / CBC report, continue below.

────────────────────────────────────────────────────────────────
ABSOLUTE RULES
────────────────────────────────────────────────────────────────
1. Extract ONLY what is VISIBLE. Never invent values.
2. Use null for any field not found. Never use "" or "N/A".
3. Do NOT extract any test other than the four listed below.
4. Return ONLY valid JSON. No markdown fences.

────────────────────────────────────────────────────────────────
RESULTS — EXTRACT ONLY THESE 4 TESTS
────────────────────────────────────────────────────────────────
Populate the "results" object with EXACTLY these keys (use null if not visible):

  "Hemoglobin"         — aliases: Hb, HGB, Haemoglobin
  "WBC Count"          — aliases: WBC, Total WBC, White Blood Cell Count
  "Platelet Count"     — aliases: PLT, Platelets, Platelet
  "RBC Count"          — aliases: RBC, Red Blood Cell Count, Total RBC

For each key, extract:
  value            → numeric result exactly as printed (include < or > if present)
  unit             → exactly as printed (g/dL, cells/cumm, etc.)
  reference_range  → exactly as printed

────────────────────────────────────────────────────────────────
OUTPUT JSON SCHEMA
────────────────────────────────────────────────────────────────
{
  "valid": true,
  "document_type": "Medical Report",
  "report_type": "Blood Test",
  "extraction_warnings": [],
  "patient_details": {
    "name": null, "age": null, "gender": null, "patient_id": null
  },
  "dates": {
    "report_date": null, "sample_collected_on": null
  },
  "institution_details": {
    "name": null, "address": null
  },
  "results": {
    "Hemoglobin":       { "value": null, "unit": null, "reference_range": null },
    "WBC Count":        { "value": null, "unit": null, "reference_range": null },
    "Platelet Count":   { "value": null, "unit": null, "reference_range": null },
    "RBC Count":        { "value": null, "unit": null, "reference_range": null }
  },
  "raw_text": ""
}

Output ONLY the JSON object.
"""

DIABETES_REPORT_PROMPT = """
You are MedExtract-Report, specialized for DIABETES / glucose lab reports ONLY.

────────────────────────────────────────────────────────────────
STEP 1 — VALIDATION
────────────────────────────────────────────────────────────────
This extraction profile is ONLY for diabetes or blood glucose test reports.

If the document is NOT a diabetes / glucose report (e.g. CBC, kidney function,
radiology, prescription, invoice):
Return EXACTLY:
{
  "valid": false,
  "document_type_detected": "<what it appears to be>",
  "reason": "<one sentence why it is not a diabetes report>",
  "raw_text": "<verbatim transcription>"
}

If it IS a diabetes / glucose report, continue below.

────────────────────────────────────────────────────────────────
ABSOLUTE RULES
────────────────────────────────────────────────────────────────
1. Extract ONLY what is VISIBLE. Never invent values.
2. Use null for any field not found. Never use "" or "N/A".
3. Do NOT extract any test other than the two listed below.
4. Return ONLY valid JSON. No markdown fences.

────────────────────────────────────────────────────────────────
RESULTS — EXTRACT ONLY THESE 2 TESTS
────────────────────────────────────────────────────────────────
Populate the "results" object with EXACTLY these keys (use null if not visible):

  "Fasting Glucose"       — aliases: FBS, Fasting Blood Sugar, FBG, Fasting Plasma Glucose
  "Post fasting glucose"  — aliases: PPBS, Postprandial Glucose, PPG, Post Meal Glucose,
                            Random Glucose if clearly post-meal context

For each key, extract:
  value            → numeric result exactly as printed
  unit             → exactly as printed (usually mg/dL or mmol/L)
  reference_range  → exactly as printed

────────────────────────────────────────────────────────────────
OUTPUT JSON SCHEMA
────────────────────────────────────────────────────────────────
{
  "valid": true,
  "document_type": "Medical Report",
  "report_type": "Diabetes",
  "extraction_warnings": [],
  "patient_details": {
    "name": null, "age": null, "gender": null, "patient_id": null
  },
  "dates": {
    "report_date": null, "sample_collected_on": null
  },
  "institution_details": {
    "name": null, "address": null
  },
  "results": {
    "Fasting Glucose":      { "value": null, "unit": null, "reference_range": null },
    "Post fasting glucose": { "value": null, "unit": null, "reference_range": null }
  },
  "raw_text": ""
}

Output ONLY the JSON object.
"""

UNSUPPORTED_REPORT_PROMPT = """
You are MedExtract-Report. This system only processes Blood Test and Diabetes reports.

The user uploaded this document to an unsupported report category.

Return EXACTLY this JSON and nothing else:
{
  "valid": false,
  "document_type_detected": "<best guess of document type>",
  "reason": "Only Blood Test and Diabetes report folders are supported for extraction.",
  "raw_text": "<verbatim transcription of all visible text>"
}
"""

# Keys allowed in results per category (used for post-processing validation)
BLOOD_TEST_RESULT_KEYS = ("Hemoglobin", "WBC Count", "Platelet Count", "RBC Count")
DIABETES_RESULT_KEYS = ("Fasting Glucose", "Post fasting glucose")

RESULT_KEYS_BY_CATEGORY = {
    "blood_test": BLOOD_TEST_RESULT_KEYS,
    "diabetes": DIABETES_RESULT_KEYS,
}

REPORT_PROMPT = """
You are MedExtract-Report, a specialized AI for extracting structured data from medical reports ONLY.
 
────────────────────────────────────────────────────────────────
STEP 1 — DOCUMENT TYPE VALIDATION (MANDATORY FIRST CHECK)
────────────────────────────────────────────────────────────────
Before extracting anything, determine if this document is a medical report.
 
VALID MEDICAL REPORTS include:
  - Laboratory / Pathology Reports (CBC, KFT, LFT, Lipid, HbA1c, Thyroid,
    Culture & Sensitivity, Urine Routine, Coagulation, Hormone panels, etc.)
  - Radiology Reports (X-Ray, CT, MRI, USG, Echo, PET Scan, Mammography,
    DEXA, Angiography, Fluoroscopy)
  - Histopathology / Biopsy / Cytology Reports
  - Microbiology / Serology / Immunology Reports
  - Cardiology Reports (ECG, Holter, Stress Test / TMT, Spirometry)
  - Discharge Summaries
  - OPD / IPD Consultation Notes (text-heavy clinical findings)
  - Referral Letters
  - Medical Certificates (fitness, sick leave)
  - Vaccination Records
  - Genetic / Molecular Diagnostic Reports
  - Allergy Test Reports
  - Audiometry / Vision Screening Reports
  - Endoscopy / Colonoscopy Reports
 
If the document is NOT a report (e.g., it is a prescription with Rx and drug list,
an insurance form, a billing invoice, or an unrelated document):
 
Return EXACTLY this JSON and nothing else:
{
  "valid": false,
  "document_type_detected": "<what the document actually appears to be>",
  "reason": "<one sentence why it is not a medical report>",
  "raw_text": "<verbatim transcription of all visible text>"
}
 
If the document IS a report, continue to extraction below.
 
────────────────────────────────────────────────────────────────
ABSOLUTE RULES — NEVER VIOLATE
────────────────────────────────────────────────────────────────
1.  Extract ONLY what is VISIBLE in the document.
2.  NEVER invent test names, values, ranges, diagnoses, or findings.
3.  NEVER normalize values or convert units (mg/dL stays mg/dL).
4.  NEVER convert dates or reformat reference ranges.
5.  NEVER interpret or comment on results clinically.
6.  NEVER flag a result as abnormal unless the document explicitly marks it.
7.  Use null for any field not present. Never use "" or "N/A".
8.  Return ONLY valid parseable JSON. No markdown, no explanation, no preamble.
 
────────────────────────────────────────────────────────────────
CONFIDENCE ANNOTATION RULES
────────────────────────────────────────────────────────────────
Apply INLINE within field string values:
 
  [UNCLEAR]           → Completely unreadable
  [LOW_CONFIDENCE]    → Partially readable; best-guess follows the tag
  [PARTIALLY_VISIBLE] → Text cut off by image edge, stamp, or fold
 
Also include a per-item float:
  "confidence_score": 0.0 to 1.0
 
────────────────────────────────────────────────────────────────
REPORT TYPE DETECTION
────────────────────────────────────────────────────────────────
After validating, identify the specific report type and set "report_type":
 
  "Lab - Biochemistry"       → KFT, LFT, Lipid, Glucose, Electrolytes, etc.
  "Lab - Hematology"         → CBC, ESR, Coagulation (PT, INR, APTT), PBF
  "Lab - Microbiology"       → Culture & Sensitivity, Gram Stain, AFB
  "Lab - Serology"           → HIV, HBsAg, HCV, Widal, Dengue NS1, CRP, ANA
  "Lab - Hormones"           → Thyroid (T3/T4/TSH), Cortisol, FSH, LH, Prolactin
  "Lab - Urine"              → Urine Routine, Urine Culture, 24hr Urine
  "Lab - Genetic/Molecular"  → PCR, RT-PCR, FISH, Karyotype
  "Radiology - X-Ray"
  "Radiology - CT"
  "Radiology - MRI"
  "Radiology - USG"
  "Radiology - Echo"
  "Radiology - PET"
  "Radiology - Mammography"
  "Radiology - Angiography"
  "Histopathology"
  "Cytology"
  "Cardiology - ECG"
  "Cardiology - Holter"
  "Cardiology - Stress Test"
  "Cardiology - Spirometry"
  "Endoscopy"
  "Discharge Summary"
  "Consultation Note"
  "Referral Letter"
  "Medical Certificate"
  "Vaccination Record"
  "Audiology"
  "Allergy Report"
  "Other"
 
────────────────────────────────────────────────────────────────
LABORATORY REPORT — EXTRACTION RULES
────────────────────────────────────────────────────────────────
For EACH test result extract:
 
  - test_name          → Exactly as printed
  - method             → Sub-label under test name if printed
  - sample_type        → Serum / Urine / Blood / Plasma / CSF / Swab / Tissue / Other
  - result             → Exactly as printed (include "<" ">" symbols if present)
  - unit               → Exactly as printed
  - reference_range    → Exactly as printed including dashes, spaces, age/gender qualifiers
  - flag               → ONLY if EXPLICITLY printed: "High"/"Low"/"H"/"L"/"Critical"/
                         "Positive"/"Negative"/"*"/"A" — do NOT infer
  - flag_color         → If color-coded flag visible: "red"/"blue"/"orange"
  - confidence_score
 
────────────────────────────────────────────────────────────────
RADIOLOGY REPORT — EXTRACTION RULES
────────────────────────────────────────────────────────────────
  - modality, body_part, laterality, technique, clinical_history,
    findings, impression, recommendations — all verbatim
 
────────────────────────────────────────────────────────────────
HISTOPATHOLOGY / BIOPSY / CYTOLOGY — EXTRACTION RULES
────────────────────────────────────────────────────────────────
  - specimen, clinical_history, gross_description,
    microscopic_description, diagnosis, additional_notes — all verbatim
 
────────────────────────────────────────────────────────────────
CARDIOLOGY REPORT — EXTRACTION RULES
────────────────────────────────────────────────────────────────
ECG: rate, rhythm, axis, intervals, ST_changes, T_wave_changes, conclusion
Echo: LV_function, chamber_dimensions, valve_assessment, pericardium, conclusion
Stress Test: protocol, baseline, peak_HR, METS_achieved, ST_changes, conclusion
 
────────────────────────────────────────────────────────────────
DISCHARGE SUMMARY — EXTRACTION RULES
────────────────────────────────────────────────────────────────
  - admission_date, discharge_date, length_of_stay
  - admission_diagnosis, final_diagnosis (array)
  - procedures_performed (array)
  - significant_investigations (array)
  - in_hospital_medications (array)
  - discharge_medications (array)
  - diet_instructions, activity_restrictions
  - follow_up_date, follow_up_with, condition_at_discharge
 
────────────────────────────────────────────────────────────────
OUTPUT JSON SCHEMA
────────────────────────────────────────────────────────────────
{
  "valid": true,
  "document_type": "Medical Report",
  "report_type": "",
  "panel_name": null,
  "report_id": null,
  "extraction_warnings": [],
 
  "patient_details": {
    "name": null, "age": null, "gender": null,
    "patient_id": null, "contact": null, "address": null
  },
 
  "doctor_details": [
    {
      "name": null, "qualification": null, "specialization": null,
      "registration_number": null, "role": null
    }
  ],
 
  "institution_details": {
    "name": null, "type": null, "address": null,
    "contact": null, "email": null, "website": null
  },
 
  "dates": {
    "report_date": null, "sample_collected_on": null,
    "sample_collected_at": null, "reported_on": null,
    "visit_date": null, "admission_date": null, "discharge_date": null
  },
 
  "referred_by": null,
  "primary_sample_type": null,
 
  "lab_results": [
    {
      "sub_panel": null, "test_name": "", "method": null,
      "sample_type": null, "result": "", "unit": null,
      "reference_range": null, "flag": null, "flag_color": null,
      "confidence_score": 1.0
    }
  ],
 
  "culture_sensitivity": null,
  "radiology": null,
  "histopathology": null,
  "cardiology": null,
  "discharge_summary": null,
  "diagnosis": [],
  "clinical_history": null,
  "findings": null,
  "impression": null,
  "recommendations": null,
  "report_remarks": null,
  "raw_text": ""
}
 
────────────────────────────────────────────────────────────────
FINAL REMINDERS
────────────────────────────────────────────────────────────────
- Output ONLY the JSON object. No markdown code fences. No explanation.
- Never hallucinate. Never interpret. Never flag results as abnormal unless
  the document itself marks them.
- If image is completely unreadable: return the invalid JSON with
  document_type_detected: "unreadable" and reason: "Image is completely illegible".
"""

PROMPT_TEMPLATES: dict[str, str] = {
    "prescription": PRESCRIPTION_PROMPT,
    "report": REPORT_PROMPT,
}


# ── Internal helpers ──────────────────────────────────────────────────────────

def _image_to_base64(image_path: str) -> str:
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def _pdf_to_images(pdf_path: str) -> list[str]:
    """Render every PDF page to a PNG temp file. Returns list of file paths."""
    doc = fitz.open(pdf_path)
    image_paths: list[str] = []
    for page_num in range(len(doc)):
        page = doc[page_num]
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        image_path = os.path.join(
            tempfile.gettempdir(),
            f"jk_ocr_page_{page_num}.png",
        )
        pix.save(image_path)
        image_paths.append(image_path)
    doc.close()
    return image_paths


def _extract_with_gemma(image_path: str, system_prompt: str) -> str:
    """Send one image to the Gemma model and return the raw text response."""
    image_b64 = _image_to_base64(image_path)
    response = client.chat.completions.create(
        model="google/gemma-3-27b-it",
        temperature=0,
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Extract all content from this document."},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{image_b64}"},
                    },
                ],
            },
        ],
    )
    return response.choices[0].message.content


def _parse_json_safe(text: str) -> Any:
    """Parse LLM output as JSON, stripping accidental markdown fences."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        start = 1
        end = len(lines) - 1 if lines[-1].strip() == "```" else len(lines)
        text = "\n".join(lines[start:end]).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"parse_error": True, "raw_text": text}


def _normalize_results_block(data: dict, category: str) -> dict:
    """
    Ensure the results object contains only the allowed keys for the category,
    each with value / unit / reference_range — ready for graphing.
    """
    allowed = RESULT_KEYS_BY_CATEGORY.get(category, ())
    raw_results = data.get("results") if isinstance(data.get("results"), dict) else {}

    normalized: dict = {}
    for key in allowed:
        entry = raw_results.get(key) if isinstance(raw_results.get(key), dict) else {}
        normalized[key] = {
            "value": entry.get("value"),
            "unit": entry.get("unit"),
            "reference_range": entry.get("reference_range"),
        }
    data["results"] = normalized
    # Remove legacy lab_results if the model added it anyway
    data.pop("lab_results", None)
    return data


def _apply_report_category(data: Any, category: str, report_folder_name: str | None) -> Any:
    """Post-process a single extraction dict for blood_test / diabetes profiles."""
    if not isinstance(data, dict):
        return data

    if report_folder_name:
        data["report_type"] = report_folder_name

    if data.get("valid") is False:
        return data

    data = _normalize_results_block(data, category)
    return data


def _select_report_prompt(category: str | None) -> str:
    if category == "blood_test":
        return BLOOD_TEST_REPORT_PROMPT
    if category == "diabetes":
        return DIABETES_REPORT_PROMPT
    return UNSUPPORTED_REPORT_PROMPT


# ── Public API ────────────────────────────────────────────────────────────────

def extract_from_file(
    file_path: str,
    document_type: str,
    report_folder_name: str | None = None,
) -> dict:
    """
    Run OCR extraction on *file_path* using the appropriate prompt.

    document_type must be "prescription" or "report".
    report_folder_name: user-defined sub-folder name (required for report extraction).
      Only "Blood Test" and "Diabetes" categories are supported for reports.

    Returns:
      - For a single image or single-page PDF: the parsed extraction dict.
      - For a multi-page PDF: {"multi_page": True, "page_count": N, "pages": [...]}
    """
    if document_type not in PROMPT_TEMPLATES and document_type != "report":
        raise ValueError(
            f"document_type must be 'prescription' or 'report'; got '{document_type}'"
        )

    report_category: str | None = None
    if document_type == "report":
        report_category = _resolve_report_category(report_folder_name)
        system_prompt = _select_report_prompt(report_category)
    else:
        system_prompt = PROMPT_TEMPLATES[document_type]
    suffix = Path(file_path).suffix.lower()

    if suffix not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported file extension: {suffix}")

    def _post_process(result: Any) -> Any:
        if document_type != "report" or not report_category:
            return result
        if isinstance(result, dict) and result.get("multi_page"):
            pages = result.get("pages", [])
            result["pages"] = [
                _apply_report_category(page, report_category, report_folder_name)
                for page in pages
                if isinstance(page, dict)
            ]
            return result
        if isinstance(result, dict):
            return _apply_report_category(result, report_category, report_folder_name)
        return result

    if suffix == ".pdf":
        image_paths = _pdf_to_images(file_path)
        results: list[Any] = []
        try:
            for image_path in image_paths:
                try:
                    raw = _extract_with_gemma(image_path, system_prompt)
                    results.append(_parse_json_safe(raw))
                finally:
                    if os.path.exists(image_path):
                        os.unlink(image_path)
        except Exception:
            for p in image_paths:
                if os.path.exists(p):
                    os.unlink(p)
            raise

        if len(results) == 1:
            return _post_process(results[0])
        return _post_process(
            {"multi_page": True, "page_count": len(results), "pages": results}
        )

    raw = _extract_with_gemma(file_path, system_prompt)
    return _post_process(_parse_json_safe(raw))
