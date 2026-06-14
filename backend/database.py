import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket

load_dotenv()

MONGO_URI: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DB_NAME: str = os.getenv("DB_NAME", "jeevakosha")

client = AsyncIOMotorClient(MONGO_URI)
db = client[DB_NAME]

# GridFS bucket — stores raw file binaries (images / PDFs)
fs_bucket = AsyncIOMotorGridFSBucket(db, bucket_name="medical_files")

# Collections
users_col = db["users"]
hospitals_col = db["hospitals"]
documents_col = db["documents"]
report_folders_col = db["report_folders"]   # user-defined sub-folders inside Reports
profiles_col = db["profiles"]               # patient portfolio (one doc per user)


async def create_indexes() -> None:
    """Create / update MongoDB indexes on startup."""

    # ── Users ─────────────────────────────────────────────────────────────────
    await users_col.create_index("email", unique=True)

    # ── Hospitals ──────────────────────────────────────────────────────────────
    # Drop the old global slug index (pre-auth era) if it still exists.
    try:
        await hospitals_col.drop_index("slug_1")
    except Exception:
        pass  # index did not exist — that's fine

    # Slug must be unique per user, not globally.
    await hospitals_col.create_index(
        [("user_id", 1), ("slug", 1)], unique=True
    )

    # ── Documents ─────────────────────────────────────────────────────────────
    await documents_col.create_index(
        [("hospital_id", 1), ("folder", 1), ("stored_filename", 1)],
        unique=True,
    )
    await documents_col.create_index(
        [("hospital_id", 1), ("folder", 1), ("upload_date", -1)]
    )
    await documents_col.create_index("user_id")
    await documents_col.create_index("ocr_status")
    await documents_col.create_index("report_folder_id")

    # ── Report Folders ────────────────────────────────────────────────────────
    # Subfolder name must be unique per hospital per user
    await report_folders_col.create_index(
        [("hospital_id", 1), ("user_id", 1), ("slug", 1)], unique=True
    )

    # ── Patient Profiles ──────────────────────────────────────────────────────
    await profiles_col.create_index("user_id", unique=True)


async def create_vector_search_index() -> None:
    """
    Create (or confirm) the Atlas Vector Search index used by the RAG chatbot.

    Index definition:
      • 'embedding' field  → 4096-dim cosine vector search
      • 'user_id'  field   → pre-filter so each user only searches their own docs

    If the index already exists, Atlas raises an error that we silently ignore.
    If the cluster does not support programmatic index creation (e.g. free M0 tier
    via the Data API), create it manually in Atlas UI:
        Atlas → your cluster → Search → Create Search Index → JSON Editor:

        {
          "fields": [
            { "type": "vector", "path": "embedding",
              "numDimensions": 4096, "similarity": "cosine" },
            { "type": "filter", "path": "user_id" }
          ]
        }

        Index name: vector_index   Collection: documents
    """
    try:
        await documents_col.create_search_index(
            {
                "name": "vector_index",
                "type": "vectorSearch",
                "definition": {
                    "fields": [
                        {
                            "type": "vector",
                            "path": "embedding",
                            "numDimensions": 4096,
                            "similarity": "cosine",
                        },
                        {
                            "type": "filter",
                            "path": "user_id",
                        },
                    ]
                },
            }
        )
        print("[db] vector_index created on 'documents' collection.")
    except Exception as exc:
        # Duplicate index or cluster-level restriction — both are acceptable.
        print(f"[db] vector_index skipped ({exc.__class__.__name__}: {exc})")


async def purge_orphaned_records() -> None:
    """
    Remove hospitals and documents that have no user_id field.
    These were created before authentication was added (e.g. via Swagger UI).
    """
    orphan_hospitals = await hospitals_col.find(
        {"user_id": {"$exists": False}}
    ).to_list(None)

    for h in orphan_hospitals:
        h_id = str(h["_id"])
        # Cascade-delete associated documents and GridFS files
        orphan_docs = await documents_col.find({"hospital_id": h_id}).to_list(None)
        for d in orphan_docs:
            try:
                from bson import ObjectId
                await fs_bucket.delete(ObjectId(d["file_id"]))
            except Exception:
                pass
        await documents_col.delete_many({"hospital_id": h_id})

    if orphan_hospitals:
        await hospitals_col.delete_many({"user_id": {"$exists": False}})

    # Also purge any orphaned documents not caught above
    await documents_col.delete_many({"user_id": {"$exists": False}})
