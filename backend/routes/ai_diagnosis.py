"""
AI Diagnosis routes — voice interview session, STT/TTS, and MedGemma analysis.
All endpoints are prefixed with /ai-diagnosis.

Multilingual flow
-----------------
1. /session/start
   - If language != "en", translate all 10 English questions → user's language
     in parallel using Sarvam translate API, store in session.
   - TTS is produced in the user's language.

2. /voice/transcribe
   - Sarvam STT returns text in the user's language (language_code is forwarded).

3. /voice/answer
   - Answer is saved in the user's language.
   - For the red_flag_screen question (Q10), the answer is translated to English
     first so English keyword matching remains reliable.

4. /diagnosis/analyze
   - Answers are translated from user's language → English before MedGemma
     (MedGemma produces best results in English).
   - MedGemma response is in English.
   - All text fields are translated back to the user's language before returning.
"""
import asyncio
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import os

from backend.services.medgemma_service import analyze_symptoms
from backend.services.sarvam_service import (
    text_to_speech,
    transcribe_audio,
    translate_diagnosis,
    translate_text,
    translate_texts,
)
from backend.services.session_store import store
from backend.voice_agent_prompts import QUESTIONS

router = APIRouter(prefix="/ai-diagnosis", tags=["AI Diagnosis"])


@router.get("/config")
async def get_config():
    """
    Returns the active AI Diagnosis configuration (no secrets).
    Useful for verifying env vars are loaded correctly.
    """
    endpoint = os.getenv("HF_INFERENCE_ENDPOINT", "")
    model = os.getenv("HF_MODEL", "google/medgemma-4b-it")
    sarvam_key = os.getenv("SARVAM_API_KEY", "")
    hf_token = os.getenv("HF_API_TOKEN", "")
    return {
        "hf_endpoint_set": bool(endpoint),
        "hf_endpoint_suffix": endpoint[-40:] if endpoint else "(not set)",
        "hf_model": model,
        "hf_token_set": bool(hf_token),
        "sarvam_key_set": bool(sarvam_key),
    }

# ── Red-flag keywords (English — used after translating user's answer) ─────────
_RED_FLAGS = [
    "difficulty breathing", "chest pain", "coughing blood", "vomiting blood",
    "sudden confusion", "weakness on one side", "faint", "unconscious",
    "severe chest", "can't breathe", "shortness of breath",
    "hemoptysis", "hematemesis", "stroke", "emergency",
]

# Emergency message translated at analysis time (see get_diagnosis)
_EMERGENCY_FLAG_EN = "Potential emergency symptoms reported during screening"


def _has_red_flag(text: str) -> bool:
    """Check English text for red-flag keywords."""
    low = text.lower()
    return any(kw in low for kw in _RED_FLAGS)


# ── Schemas ────────────────────────────────────────────────────────────────────

class SessionStartRequest(BaseModel):
    preferred_language: str = "en"


class SessionStartResponse(BaseModel):
    session_id: str
    first_question: str
    audio_base64: str
    language: str


class TranscribeRequest(BaseModel):
    session_id: str
    audio_base64: str
    language: str
    mime_type: str = "audio/webm"


class TranscribeResponse(BaseModel):
    transcript: str
    session_id: str


class SpeakRequest(BaseModel):
    text: str
    language: str


class SpeakResponse(BaseModel):
    audio_base64: str


class AnswerSubmitRequest(BaseModel):
    session_id: str
    question_key: str
    answer: str


class AnswerSubmitResponse(BaseModel):
    next_question: Optional[str] = None
    audio_base64: Optional[str] = None
    is_complete: bool
    question_number: int
    is_emergency: bool = False


class Differential(BaseModel):
    condition_name: str
    brief_reason: str
    confidence: str


class DiagnosisRequest(BaseModel):
    session_id: str


class DiagnosisResponse(BaseModel):
    urgency: str
    clinical_summary: str
    urgency_reason: str
    care_timeline: str
    red_flags_detected: List[str] = []
    differentials: List[Differential]
    next_steps: List[str]
    when_to_seek_care: str
    reassuring_notes: str = ""
    disclaimer: str
    answers: dict = {}


# ── Session ────────────────────────────────────────────────────────────────────

@router.post("/session/start", response_model=SessionStartResponse)
async def start_session(request: SessionStartRequest):
    """
    Create a diagnostic session.

    If the requested language is not English:
      - Translates all 10 questions from English to the target language in parallel.
      - Stores translated questions in the session so every /voice/answer call
        returns the question in the correct language.
    """
    try:
        session = store.create_session(request.preferred_language)

        if session.language != "en":
            # Translate all questions in parallel — one Sarvam translate call each
            en_scripts = [q["script"] for q in QUESTIONS]
            translated = await translate_texts(en_scripts, "en", session.language)
            session.translated_questions = translated
        else:
            session.translated_questions = [q["script"] for q in QUESTIONS]

        first_question = session.get_current_question_text()
        audio_base64 = await text_to_speech(first_question, session.language)

        return SessionStartResponse(
            session_id=session.session_id,
            first_question=first_question,
            audio_base64=audio_base64,
            language=session.language,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


# ── Voice ──────────────────────────────────────────────────────────────────────

@router.post("/voice/transcribe", response_model=TranscribeResponse)
async def transcribe(request: TranscribeRequest):
    """
    Transcribe a base64-encoded audio recording using Sarvam STT.
    The transcript is returned in the same language the user spoke.
    """
    try:
        transcript = await transcribe_audio(
            request.audio_base64, request.language, request.mime_type
        )
        return TranscribeResponse(transcript=transcript, session_id=request.session_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/voice/speak", response_model=SpeakResponse)
async def speak(request: SpeakRequest):
    """Convert text to speech using Sarvam TTS in the requested language."""
    try:
        audio = await text_to_speech(request.text, request.language)
        return SpeakResponse(audio_base64=audio)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/voice/answer", response_model=AnswerSubmitResponse)
async def submit_answer(request: AnswerSubmitRequest):
    """
    Save an answer to the current question and advance to the next.

    For the red_flag_screen question (Q10), the answer is translated to English
    before the keyword check so it works for every language.
    """
    session = store.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Save the original answer (in whatever language the user answered)
    store.save_answer(request.session_id, request.question_key, request.answer)

    # ── Red-flag check ─────────────────────────────────────────────────────────
    is_emergency = False
    if request.question_key == "red_flag_screen":
        # Always compare against English keywords for reliability
        text_for_check = (
            await translate_text(request.answer, session.language, "en")
            if session.language != "en"
            else request.answer
        )
        if _has_red_flag(text_for_check):
            is_emergency = True
            store.mark_emergency(request.session_id)

    is_complete = session.is_complete()
    resp = AnswerSubmitResponse(
        is_complete=is_complete,
        is_emergency=is_emergency,
        question_number=session.current_question_index + 1,
    )

    if not is_complete:
        # Advance to next question — get_current_question_text() returns the
        # pre-translated text stored in the session
        next_text = store.advance_question(request.session_id)
        if next_text:
            try:
                audio = await text_to_speech(next_text, session.language)
                resp.next_question = next_text
                resp.audio_base64 = audio
            except Exception:
                # TTS failed — still return the text so the UI can display it
                resp.next_question = next_text
    else:
        store.complete_session(request.session_id)

    return resp


# ── Diagnosis ──────────────────────────────────────────────────────────────────

@router.post("/diagnosis/analyze", response_model=DiagnosisResponse)
async def get_diagnosis(request: DiagnosisRequest):
    """
    Analyse symptoms and return a differential diagnosis.

    Translation pipeline (non-English sessions):
      1. Translate all collected answers → English   (MedGemma works best in English)
      2. Call MedGemma                               (always receives English input)
      3. Translate all result text fields → user's language

    The `answers` field in the response always contains the originals in the
    user's language so the UI can display what the user said.
    """
    session = store.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.answers:
        raise HTTPException(status_code=400, detail="No answers collected yet")

    try:
        # ── Step 1: translate answers to English for MedGemma ─────────────────
        if session.language != "en":
            keys   = list(session.answers.keys())
            values = list(session.answers.values())
            en_values = await translate_texts(values, session.language, "en")
            medgemma_answers = dict(zip(keys, en_values))
        else:
            medgemma_answers = session.answers

        # ── Step 2: MedGemma analysis (always in English) ─────────────────────
        result = await analyze_symptoms(medgemma_answers, "en")

        # ── Step 3: translate results back to user's language ──────────────────
        if session.language != "en":
            result = await translate_diagnosis(result, session.language)

    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    # Override urgency if emergency was detected during the interview
    if session.status == "emergency":
        result["urgency"] = "emergency"
        if not result.get("red_flags_detected"):
            # Translate the fallback emergency message too
            msg = _EMERGENCY_FLAG_EN
            if session.language != "en":
                msg = await translate_text(msg, "en", session.language)
            result["red_flags_detected"] = [msg]

    # Always attach original answers (in user's language) for the results UI
    result["answers"] = session.answers
    return DiagnosisResponse(**result)
