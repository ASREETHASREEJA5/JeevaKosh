from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.database import create_indexes, create_vector_search_index, purge_orphaned_records
from backend.routes import documents, hospitals
from backend.routes import auth as auth_routes
from backend.routes import chat as chat_routes
from backend.routes import ocr as ocr_routes
from backend.routes import report_folders as report_folder_routes
from backend.routes import dashboard as dashboard_routes
from backend.routes import profile as profile_routes


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_indexes()
    await create_vector_search_index()   # Atlas vector search index for RAG chatbot
    await purge_orphaned_records()
    yield


app = FastAPI(
    title="JeevaKosha API",
    description=(
        "Medical repository system — manage hospital folders, "
        "upload prescriptions & reports, and extract structured data via OCR. "
        "All data is private and scoped to the authenticated user."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_routes.router)
app.include_router(hospitals.router)
app.include_router(report_folder_routes.router)
app.include_router(documents.router)
app.include_router(ocr_routes.router)
app.include_router(chat_routes.router)
app.include_router(dashboard_routes.router)
app.include_router(profile_routes.router)


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "service": "JeevaKosha API", "version": "2.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
