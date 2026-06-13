"""
RAG Chat endpoint.

POST /chat
  • LLM decides whether to call the search_medical_records tool
  • Vector search runs only when the model requests it
  • Streams the answer from google/gemma-3-27b-it via Nebius (SSE)

POST /chat/reembed
  • Background task: backfill embeddings for existing OCR-completed documents

SSE event shapes:
  data: {"type": "sources",  "sources": [...]}
  data: {"type": "text",     "text": "..."}
  data: {"type": "error",    "text": "..."}
  data: [DONE]
"""

import asyncio
import json
import os
from datetime import datetime
from typing import AsyncGenerator

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openai import OpenAI
from pydantic import BaseModel

from backend.database import documents_col
from backend.services.auth import get_current_user
from backend.services.embedding import _get_client, _ocr_data_to_text, get_document_embedding

router = APIRouter(tags=["Chat"])

TOP_K = 8


CLASSIFIER_PROMPT = """\
Classify the user message into exactly one of these three categories.
Reply with only the single word — nothing else, no punctuation, no explanation.

SEARCH  — the user is asking about their own personal medical records, test results, prescriptions,
          medicines, lab reports, hospital visits, uploaded documents, or any data stored in JeevaKosha.
          Use this also when the question is ambiguous but could involve personal health data.

GENERAL — the user is asking a general medical or health related question that does not require
          their personal records. Examples: what does creatinine measure, what is normal blood sugar,
          what is diabetes, how to read a CBC report, what causes high blood pressure, what is a KFT test,
          what is the side effect of a medicine, how does a disease spread, what is a healthy diet.

CHAT    — greeting, farewell, thanks, small talk, questions about what JeevaKosha can do,
          OR any topic that is NOT related to medicine or health at all.
          Examples: hi, hello, thanks, who are you, what is the weather, tell me a joke,
          write me a poem, what is 2+2, help me with cooking.

Reply with exactly one word: SEARCH, GENERAL, or CHAT\
"""

def _llm_client() -> OpenAI:
    return OpenAI(
        base_url="https://api.tokenfactory.nebius.com/v1/",
        api_key=os.environ.get("NEBIUS_API_KEY"),
    )


# ── Pydantic models ───────────────────────────────────────────────────────────

class HistoryMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[HistoryMessage] = []


# ── Helpers ───────────────────────────────────────────────────────────────────

def _format_date(dt) -> str:
    if isinstance(dt, datetime):
        return dt.strftime("%d %b %Y")
    return str(dt)[:10]


def _ocr_to_structured_text(ocr_data: dict, indent: int = 0) -> str:
    """
    Recursively render OCR JSON as indented key: value lines so the LLM
    sees exactly what each number or string refers to.

    Example output:
        report_type: Kidney Function Test
        patient_name: John Doe
        test_date: 2026-01-10
        parameters:
          creatinine: 1.2
          unit: mg/dL
          reference_range: 0.6-1.2
    """
    lines: list[str] = []
    pad = "  " * indent

    if isinstance(ocr_data, dict):
        for key, val in ocr_data.items():
            if val is None or str(val).strip() in ("", "null", "n/a", "-"):
                continue
            if isinstance(val, (dict, list)):
                lines.append(f"{pad}{key}:")
                lines.append(_ocr_to_structured_text(val, indent + 1))
            else:
                lines.append(f"{pad}{key}: {val}")
    elif isinstance(ocr_data, list):
        for item in ocr_data:
            if isinstance(item, dict):
                lines.append(_ocr_to_structured_text(item, indent))
            elif str(item).strip():
                lines.append(f"{pad}- {item}")

    return "\n".join(lines)


def _build_context(docs: list[dict]) -> tuple[str, list[dict]]:
    parts: list[str] = []
    sources: list[dict] = []

    for i, doc in enumerate(docs, 1):
        ocr_data = doc.get("ocr_data") or {}
        folder = doc.get("folder", "")
        rf_name = doc.get("report_folder_name", "")
        doc_type = rf_name if rf_name else (
            "Prescription" if folder == "prescriptions" else "Report"
        )

        structured = _ocr_to_structured_text(ocr_data) if isinstance(ocr_data, dict) else str(ocr_data)

        block = (
            f"=== Record {i} ===\n"
            f"Hospital : {doc.get('hospital_name', 'Unknown')}\n"
            f"Type     : {doc_type}\n"
            f"File     : {doc.get('original_filename', '')}\n"
            f"Date     : {_format_date(doc.get('upload_date', ''))}\n"
            f"Extracted data:\n{structured or '(no extracted data yet)'}\n"
        )
        parts.append(block)
        sources.append({
            "hospital": doc.get("hospital_name", "Unknown"),
            "type": doc_type,
            "filename": doc.get("original_filename", ""),
            "date": _format_date(doc.get("upload_date", "")),
            "score": round(doc.get("score", 1.0), 3),
        })

    return "\n".join(parts), sources


PROJ = {
    "hospital_name": 1,
    "folder": 1,
    "report_folder_name": 1,
    "original_filename": 1,
    "upload_date": 1,
    "ocr_data": 1,
}

FORMAT_RULES = """\
Response format rules (strictly follow these):
- Write in plain conversational text only.
- Do NOT use markdown of any kind.
- Do NOT use headings, bold, italics, bullet points, numbered lists, tables, or code blocks.
- Do NOT use *, #, -, **, __, or backtick characters for formatting.
- Use normal sentences and short paragraphs separated by blank lines when needed.
- For multiple values, write them naturally: "Your creatinine was 1.2 mg/dL and urea was 28 mg/dL."
"""

# Used when the LLM tool-called search_medical_records and records were found
RECORDS_PROMPT = """\
You are JeevaKosha, a personal medical records assistant. You only handle medical and health topics.

The user's own uploaded medical documents have been retrieved from the database and are shown below.

Instructions:
1. If the user's question is not about medicine or health, reply with exactly:
   I can only help with medical and health related questions. I cannot provide non medical details.
2. Answer the user's question directly and clearly using only the information in the records below.
3. State every relevant value with its unit (e.g. creatinine: 1.2 mg/dL).
4. Always say which hospital, document name, or report date the information comes from.
5. If a value is available but the user did not ask for it specifically, include it if relevant.
6. If something is not in the records, say "I don't find this in your records" — do not guess or invent.
7. If multiple records contain the same test, compare them and mention both with their dates.
8. After your answer, always end with exactly this sentence on a new line:
   It is better to consult a qualified doctor or healthcare professional for proper diagnosis and treatment.

""" + FORMAT_RULES

GENERAL_PROMPT = """\
You are JeevaKosha, a medical records assistant. You only handle medical and health related topics.

You handle three kinds of messages:

1. General medical or health questions (diseases, symptoms, test meanings, medicines, normal ranges,
   how to read a report, healthy habits, side effects, etc.):
   - Answer clearly and helpfully using your medical knowledge.
   - Explain terms in simple language a non-doctor can understand.
   - Always end with exactly this sentence on a new line:
     It is better to consult a qualified doctor or healthcare professional for proper diagnosis and treatment.

2. Casual or conversational messages related to health or the JeevaKosha app
   (greetings, thanks, questions about what you can do):
   - Reply naturally and briefly.
   - Do not add the doctor reminder for pure casual messages like "hi" or "thanks".
   - Mention that you can search the user's uploaded prescriptions and reports if helpful.

3. Any message that is NOT about medicine, health, or the user's medical records
   (e.g. weather, jokes, coding, cooking, math, sports, current events, etc.):
   - Reply with exactly this sentence and nothing else:
     I can only help with medical and health related questions. I cannot provide non medical details.

""" + FORMAT_RULES


async def _fetch_by_vector(user_id: str, query_vector: list[float]) -> list[dict]:
    """Atlas $vectorSearch scoped to the authenticated user."""
    pipeline = [
        {
            "$vectorSearch": {
                "index": "vector_index",
                "path": "embedding",
                "queryVector": query_vector,
                "numCandidates": TOP_K * 10,
                "limit": TOP_K,
                "filter": {"user_id": user_id},
            }
        },
        {"$project": {**PROJ, "score": {"$meta": "vectorSearchScore"}}},
    ]
    try:
        cursor = documents_col.aggregate(pipeline)
        results = await cursor.to_list(None)
        return [r for r in results if r.get("score", 0) > 0.1]
    except Exception:
        return []


async def _search_medical_records(user_id: str, query: str) -> list[dict]:
    """Tool implementation: embed the query, then run vector search."""
    try:
        emb_response = await asyncio.to_thread(
            lambda: _get_client().embeddings.create(
                model="Qwen/Qwen3-Embedding-8B",
                input=query,
            )
        )
        query_vector = emb_response.data[0].embedding
    except Exception:
        return []

    if not query_vector:
        return []
    return await _fetch_by_vector(user_id, query_vector)


async def _classify_message(message: str, history: list[HistoryMessage]) -> str:
    """
    Ask the LLM to classify the message as SEARCH / GENERAL / CHAT.
    Uses plain text generation (not tool calling) for maximum reliability.
    Defaults to SEARCH on any failure so medical queries are never silently dropped.
    """
    msgs: list[dict] = [{"role": "system", "content": CLASSIFIER_PROMPT}]
    for turn in history[-4:]:
        msgs.append({"role": turn.role, "content": turn.content})
    msgs.append({"role": "user", "content": message})

    def _call():
        return _llm_client().chat.completions.create(
            model="google/gemma-3-27b-it",
            messages=msgs,
            temperature=0,
            max_tokens=5,
        )

    try:
        response = await asyncio.to_thread(_call)
        label = response.choices[0].message.content.strip().upper()
        if label.startswith("GENERAL"):
            return "GENERAL"
        if label.startswith("CHAT"):
            return "CHAT"
        return "SEARCH"       # default — never miss a medical records query
    except Exception:
        return "SEARCH"       # on any API error, search is the safe default


async def _stream_llm(
    system_prompt: str,
    message: str,
    history: list[HistoryMessage],
) -> AsyncGenerator[str, None]:
    """Stream Gemma tokens as SSE events."""
    messages: list[dict] = [{"role": "system", "content": system_prompt}]
    for turn in history[-10:]:
        messages.append({"role": turn.role, "content": turn.content})
    messages.append({"role": "user", "content": message})

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def _produce() -> None:
        try:
            llm = _llm_client()
            stream = llm.chat.completions.create(
                model="google/gemma-3-27b-it",
                messages=messages,
                stream=True,
                temperature=0.3,
                max_tokens=1024,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta:
                    loop.call_soon_threadsafe(queue.put_nowait, ("text", delta))
        except Exception as exc:
            loop.call_soon_threadsafe(queue.put_nowait, ("error", str(exc)))
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, ("done", None))

    loop.run_in_executor(None, _produce)

    while True:
        kind, payload = await queue.get()
        if kind == "done":
            break
        if kind == "error":
            yield f"data: {json.dumps({'type': 'error', 'text': f'LLM error: {payload}'})}\n\n"
            break
        yield f"data: {json.dumps({'type': 'text', 'text': payload})}\n\n"

    yield "data: [DONE]\n\n"


async def _stream_chat(
    message: str,
    history: list[HistoryMessage],
    user_id: str,
) -> AsyncGenerator[str, None]:

    # ── 1. Classify the message ───────────────────────────────────────────────
    intent = await _classify_message(message, history)

    # ── 2. Casual conversation — no records, no medical disclaimer ────────────
    if intent == "CHAT":
        yield f"data: {json.dumps({'type': 'sources', 'sources': []})}\n\n"
        async for event in _stream_llm(GENERAL_PROMPT, message, history):
            yield event
        return

    # ── 3. General medical question — answer from knowledge, add disclaimer ───
    if intent == "GENERAL":
        yield f"data: {json.dumps({'type': 'sources', 'sources': []})}\n\n"
        async for event in _stream_llm(GENERAL_PROMPT, message, history):
            yield event
        return

    # ── 4. SEARCH — retrieve the user's records and answer from them ──────────
    retrieved = await _search_medical_records(user_id, message)
    context, sources = _build_context(retrieved)
    yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

    if not retrieved:
        has_any = await documents_col.count_documents(
            {"user_id": user_id, "ocr_status": "completed"}, limit=1
        )
        if not has_any:
            msg = (
                "I don't have any medical records to answer from yet. "
                "Please upload your prescriptions or reports first."
            )
        else:
            msg = (
                "I searched your records but couldn't find information relevant to your question. "
                "Try asking about a specific test name, medicine, or hospital. "
                "If you have not yet re-indexed your records, click the Re-index button in the chat header."
            )
        yield f"data: {json.dumps({'type': 'text', 'text': msg})}\n\n"
        yield "data: [DONE]\n\n"
        return

    system_with_ctx = RECORDS_PROMPT + "\n\nRECORDS FROM DATABASE:\n" + context
    async for event in _stream_llm(system_with_ctx, message, history):
        yield event


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/chat")
async def chat(
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
):
    """RAG chat — streams SSE. Falls back to text search if vector index is missing."""
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    user_id = str(current_user["_id"])
    return StreamingResponse(
        _stream_chat(body.message.strip(), body.history, user_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Re-embed backfill ─────────────────────────────────────────────────────────

async def _backfill_embeddings(user_id: str) -> None:
    """
    Background task: generate embeddings for every OCR-completed document
    that belongs to this user and currently has an empty embedding array.
    """
    query = {
        "user_id": user_id,
        "ocr_status": "completed",
        "$or": [
            {"embedding": {"$exists": False}},
            {"embedding": []},
            {"embedding": None},
        ],
    }
    docs = await documents_col.find(query, {"_id": 1, "ocr_data": 1}).to_list(None)
    print(f"[reembed] {len(docs)} document(s) to backfill for user {user_id}")

    for doc in docs:
        try:
            ocr_data = doc.get("ocr_data") or {}
            embedding = await asyncio.to_thread(get_document_embedding, ocr_data)
            if embedding:
                await documents_col.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"embedding": embedding}},
                )
                print(f"[reembed] ✓ {doc['_id']}")
        except Exception as exc:
            print(f"[reembed] ✗ {doc['_id']}: {exc}")


@router.post("/chat/reembed", status_code=202)
async def reembed(
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    Trigger background embedding generation for all your documents that
    were uploaded before the embedding feature was added.
    Returns immediately; processing happens in the background.
    """
    user_id = str(current_user["_id"])
    background_tasks.add_task(_backfill_embeddings, user_id)
    return {
        "message": "Embedding backfill started in the background. "
                   "This may take a minute per document. "
                   "The chatbot works without embeddings too (fallback mode)."
    }
