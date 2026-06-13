from pydantic import BaseModel
from datetime import datetime
from typing import Any, Literal, Optional


class DocumentResponse(BaseModel):
    id: str
    hospital_id: str
    hospital_name: str
    folder: Literal["prescriptions", "reports"]
    original_filename: str
    stored_filename: str
    mime_type: str
    file_size: int
    upload_date: datetime
    ocr_status: Literal["pending", "processing", "completed", "failed"]
    ocr_data: Optional[Any] = None
    ocr_error: Optional[str] = None
    ocr_completed_at: Optional[datetime] = None
    # Report sub-folder fields (None for prescriptions)
    report_folder_id: Optional[str] = None
    report_folder_name: Optional[str] = None


class DocumentListItem(BaseModel):
    id: str
    hospital_id: str
    hospital_name: str
    folder: str
    original_filename: str
    stored_filename: str
    mime_type: str
    file_size: int
    upload_date: datetime
    ocr_status: str
    report_folder_id: Optional[str] = None
    report_folder_name: Optional[str] = None
