"""
Sarvam AI service — speech-to-text, text-to-speech, and translation.

All three functions are used by the AI Diagnosis pipeline:
  - transcribe_audio  : user voice → text (in the user's language)
  - text_to_speech    : question text → audio (in the user's language)
  - translate_text    : text between any two supported languages
  - translate_diagnosis : convenience wrapper to translate a whole result dict
"""
import asyncio
import base64
import os
from typing import Any, Dict, List

import httpx

SARVAM_API_KEY: str = os.getenv("SARVAM_API_KEY", "")

# BCP-47 codes used by Sarvam APIs
LANGUAGE_CODES: dict[str, str] = {
    "en": "en-IN",
    "hi": "hi-IN",
    "ta": "ta-IN",
    "te": "te-IN",
    "kn": "kn-IN",
    "ml": "ml-IN",
    "bn": "bn-IN",
    "mr": "mr-IN",
    "gu": "gu-IN",
    "pa": "pa-IN",
    "od": "od-IN",
    "ur": "ur-IN",
}


def _lang(code: str) -> str:
    """Return the Sarvam BCP-47 code for a short language code."""
    return LANGUAGE_CODES.get(code, "en-IN")


# ── Speech-to-text ─────────────────────────────────────────────────────────────

async def transcribe_audio(
    audio_base64: str,
    language: str,
    mime_type: str = "audio/webm",
) -> str:
    """
    Transcribe audio bytes (base64-encoded) using Sarvam STT.
    The transcript is returned in the user's chosen language.
    """
    if not SARVAM_API_KEY:
        raise ValueError("SARVAM_API_KEY is not set in environment")

    audio_bytes = base64.b64decode(audio_base64)
    lang_code = _lang(language)

    ext = "webm"
    content_type = mime_type or "audio/webm"
    if "wav" in content_type:
        ext, content_type = "wav", "audio/wav"
    elif "ogg" in content_type:
        ext, content_type = "ogg", "audio/ogg"
    elif "mp4" in content_type or "m4a" in content_type:
        ext, content_type = "m4a", "audio/mp4"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.sarvam.ai/speech-to-text",
            files={"file": (f"audio.{ext}", audio_bytes, content_type)},
            data={"language_code": lang_code, "model": "saarika:v2.5"},
            headers={"api-subscription-key": SARVAM_API_KEY},
        )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise Exception(
                f"Sarvam STT error {exc.response.status_code}: {exc.response.text}"
            ) from exc

        result = response.json()
        transcript = result.get("transcript", "")
        if not transcript:
            raise ValueError("No transcript in Sarvam response")
        return transcript


# ── Text-to-speech ─────────────────────────────────────────────────────────────

async def text_to_speech(text: str, language: str) -> str:
    """
    Convert text to speech via Sarvam TTS.
    Returns base64-encoded WAV audio.
    """
    if not SARVAM_API_KEY:
        raise ValueError("SARVAM_API_KEY is not set in environment")

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.sarvam.ai/text-to-speech",
            json={
                "inputs": [text],
                "target_language_code": _lang(language),
                "speaker": "anushka",
                "model": "bulbul:v2",
                "enable_preprocessing": True,
            },
            headers={"api-subscription-key": SARVAM_API_KEY},
        )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise Exception(
                f"Sarvam TTS error {exc.response.status_code}: {exc.response.text}"
            ) from exc

        result = response.json()
        audios = result.get("audios", [])
        if not audios:
            raise ValueError("No audio in Sarvam TTS response")

        audio = audios[0]
        if not isinstance(audio, str):
            audio = base64.b64encode(audio).decode("utf-8")
        return audio


# ── Translation ────────────────────────────────────────────────────────────────

async def translate_text(text: str, source_lang: str, target_lang: str) -> str:
    """
    Translate a single piece of text using Sarvam's translation API (mayura:v1).

    - source_lang / target_lang: short codes like "en", "te", "hi"
    - Falls back to the original text silently on any API error so the
      flow never breaks due to a translation failure.
    """
    if not text or not text.strip():
        return text
    if source_lang == target_lang:
        return text
    if not SARVAM_API_KEY:
        return text  # no key → no translation, keep original

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                "https://api.sarvam.ai/translate",
                json={
                    "input": text,
                    "source_language_code": _lang(source_lang),
                    "target_language_code": _lang(target_lang),
                    "speaker_gender": "Female",
                    "mode": "formal",
                    "model": "mayura:v1",
                    "enable_preprocessing": False,
                },
                headers={"api-subscription-key": SARVAM_API_KEY},
            )
            response.raise_for_status()
            result = response.json()
            translated = result.get("translated_text", "").strip()
            return translated if translated else text
    except Exception:
        return text  # graceful fallback — never break the flow


async def translate_texts(texts: List[str], source_lang: str, target_lang: str) -> List[str]:
    """
    Translate a list of texts in parallel. Preserves order.
    Empty strings are passed through unchanged.
    """
    if source_lang == target_lang:
        return texts
    results = await asyncio.gather(
        *[translate_text(t, source_lang, target_lang) for t in texts]
    )
    return list(results)


async def translate_diagnosis(result: Dict[str, Any], target_lang: str) -> Dict[str, Any]:
    """
    Translate all human-readable text fields in a MedGemma diagnosis result dict
    from English to `target_lang`.  Runs all translations in parallel for speed.

    Fields translated:
      - clinical_summary, urgency_reason, care_timeline
      - when_to_seek_care, reassuring_notes, disclaimer
      - red_flags_detected  (list of strings)
      - differentials[].condition_name + differentials[].brief_reason
      - next_steps          (list of strings)
    """
    if target_lang == "en":
        return result

    # ── Gather all texts to translate in one parallel batch ────────────────────
    scalar_keys = [
        "clinical_summary", "urgency_reason", "care_timeline",
        "when_to_seek_care", "reassuring_notes", "disclaimer",
    ]
    scalar_values = [result.get(k, "") for k in scalar_keys]

    red_flags: List[str] = result.get("red_flags_detected", [])
    next_steps: List[str] = result.get("next_steps", [])
    differentials = result.get("differentials", [])

    diff_names  = [d.get("condition_name", "") for d in differentials]
    diff_reasons = [d.get("brief_reason", "") for d in differentials]

    # Concatenate everything into one big list for a single asyncio.gather call
    all_texts = scalar_values + red_flags + next_steps + diff_names + diff_reasons

    translated = await translate_texts(all_texts, "en", target_lang)

    # ── Unpack results back into the dict ──────────────────────────────────────
    idx = 0
    for key in scalar_keys:
        result[key] = translated[idx]
        idx += 1

    result["red_flags_detected"] = translated[idx : idx + len(red_flags)]
    idx += len(red_flags)

    result["next_steps"] = translated[idx : idx + len(next_steps)]
    idx += len(next_steps)

    for i, diff in enumerate(differentials):
        diff["condition_name"] = translated[idx + i]
    idx += len(diff_names)

    for i, diff in enumerate(differentials):
        diff["brief_reason"] = translated[idx + i]

    result["differentials"] = differentials
    return result
