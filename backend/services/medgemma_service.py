"""
MedGemma service — clinical differential diagnosis.

Uses a HuggingFace Inference Endpoint (OpenAI-compatible API / TGI).
All configuration is read at call-time so server restarts are not needed
when .env values change, and so that load_dotenv() order never matters.
"""
import json
import os
import re
from typing import Any, Dict

from dotenv import load_dotenv
from openai import OpenAI

from backend.voice_agent_prompts import MEDGEMMA_SYSTEM_PROMPT

load_dotenv()  # idempotent — safe to call multiple times


# ── Config helpers (read fresh every call) ─────────────────────────────────────

def _endpoint() -> str:
    ep = os.getenv("HF_INFERENCE_ENDPOINT", "").strip()
    if ep and not ep.rstrip("/").endswith("/v1"):
        ep = ep.rstrip("/") + "/v1"
    return ep


def _token() -> str:
    return os.getenv("HF_API_TOKEN", "").strip()


def _model() -> str:
    return os.getenv("HF_MODEL", "google/medgemma-4b-it").strip()


def _client() -> tuple[OpenAI, str]:
    ep = _endpoint()
    tok = _token()
    mod = _model()
    if not ep or not tok:
        raise ValueError(
            "HF_INFERENCE_ENDPOINT and HF_API_TOKEN must be set in .env for AI Diagnosis"
        )
    return OpenAI(base_url=ep, api_key=tok), mod


# ── Main analysis function ─────────────────────────────────────────────────────

async def analyze_symptoms(answers: Dict[str, str], language: str) -> Dict[str, Any]:
    """
    Send symptom interview answers (always in English) to MedGemma and return
    a validated structured diagnosis dict.

    Notes on HF Dedicated Endpoint compatibility:
    - We do NOT use response_format={"type":"json_object"} because older TGI
      versions reject it. JSON is enforced via the system prompt instead.
    - The model name is read at call-time so .env changes take effect without
      a server restart.
    """
    client, model = _client()

    # Append an explicit JSON-only instruction so TGI does not add markdown
    user_message = (
        "Patient symptom interview answers:\n"
        + json.dumps(answers, indent=2)
        + "\n\nRespond with ONLY the JSON object. No markdown fences. No explanation."
    )

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": MEDGEMMA_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=0.2,
            max_tokens=1500,
            # response_format intentionally omitted — not supported on all TGI versions
        )
        raw = response.choices[0].message.content or ""
        return _validate(_extract_json(raw))

    except Exception as exc:
        error_str = str(exc)
        # Surface a clear error if the model name on the endpoint is wrong
        if "does not exist" in error_str or "404" in error_str or "NotFound" in error_str:
            model_name = _model()
            endpoint = _endpoint()
            raise Exception(
                f"Model '{model_name}' was not found on the endpoint '{endpoint}'. "
                f"Check that HF_MODEL in .env matches the model deployed on your "
                f"HuggingFace Inference Endpoint."
            ) from exc
        raise Exception(f"MedGemma analysis error: {error_str}") from exc


# ── JSON extraction ────────────────────────────────────────────────────────────

def _extract_json(text: str) -> Dict[str, Any]:
    text = text.strip()
    # Direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Strip markdown fences
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        try:
            return json.loads(fenced.group(1))
        except json.JSONDecodeError:
            pass
    # Find first {...} block
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    raise ValueError(f"Could not parse JSON from model output: {text[:400]}")


# ── Validation and normalisation ───────────────────────────────────────────────

def _normalize_urgency(value: str) -> str:
    mapping = {
        "emergency": "emergency",
        "urgent": "urgent",
        "routine": "routine",
        "monitor": "monitor",
        "low": "monitor",
        "medium": "routine",
        "high": "urgent",
        "critical": "emergency",
    }
    return mapping.get((value or "routine").strip().lower(), "routine")


def _validate(data: Dict[str, Any]) -> Dict[str, Any]:
    validated_diffs = []
    for d in data.get("differentials", []):
        if isinstance(d, dict):
            validated_diffs.append({
                "condition_name": d.get("condition_name", "Unknown"),
                "brief_reason": d.get("brief_reason", ""),
                "confidence": d.get("confidence", "possible"),
            })
        elif isinstance(d, str) and d.strip():
            validated_diffs.append({
                "condition_name": d.strip(),
                "brief_reason": "",
                "confidence": "possible",
            })

    next_steps = data.get("next_steps", [])
    if not isinstance(next_steps, list):
        next_steps = []

    urgency = _normalize_urgency(data.get("urgency", "routine"))
    care_timeline = data.get("care_timeline") or _default_care_timeline(urgency)

    red_flags = data.get("red_flags_detected", [])
    if not isinstance(red_flags, list):
        red_flags = []
    red_flags = [str(f).strip() for f in red_flags if str(f).strip()]

    return {
        "urgency": urgency,
        "clinical_summary": data.get("clinical_summary") or _default_summary(validated_diffs, urgency),
        "urgency_reason": data.get("urgency_reason") or _default_urgency_reason(urgency),
        "care_timeline": care_timeline,
        "red_flags_detected": red_flags,
        "differentials": validated_diffs,
        "next_steps": [str(s) for s in next_steps],
        "when_to_seek_care": (
            data.get("when_to_seek_care")
            or "Seek emergency care immediately if symptoms worsen."
        ),
        "reassuring_notes": data.get("reassuring_notes") or "",
        "disclaimer": data.get("disclaimer") or (
            "This is an AI-generated preliminary assessment based on your reported symptoms. "
            "It is not a medical diagnosis. Please consult a qualified doctor for proper evaluation."
        ),
    }


def _default_care_timeline(urgency: str) -> str:
    return {
        "emergency": "Immediately",
        "urgent": "Within 24 hours",
        "routine": "This week",
        "monitor": "Monitor at home",
    }.get(urgency, "This week")


def _default_urgency_reason(urgency: str) -> str:
    return {
        "emergency": "Your reported symptoms may indicate a serious condition requiring immediate attention.",
        "urgent": "Your symptoms suggest you should be evaluated by a doctor soon.",
        "routine": "Your symptoms appear manageable but should be reviewed by a healthcare provider.",
        "monitor": "Your symptoms may improve with rest and self-care. Watch for any worsening.",
    }.get(urgency, "Please follow the recommended next steps below.")


def _default_summary(differentials: list, urgency: str) -> str:
    if not differentials:
        return "Based on your answers, we have generated a preliminary assessment of your symptoms."
    top = differentials[0]["condition_name"]
    return (
        f"Based on your symptom interview, the most relevant possibility is {top}. "
        f"This assessment is rated as {urgency} priority."
    )
