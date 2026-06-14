import re
from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends

from backend.database import documents_col
from backend.services.auth import get_current_user
from backend.services.ocr import (
    BLOOD_TEST_RESULT_KEYS,
    DIABETES_RESULT_KEYS,
    _resolve_report_category,
)

router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"],
)

METRICS_BY_REPORT_TYPE: dict[str, tuple[str, ...]] = {
    "Blood Test": BLOOD_TEST_RESULT_KEYS,
    "Diabetes": DIABETES_RESULT_KEYS,
}

CANONICAL_REPORT_TYPE = {
    "blood_test": "Blood Test",
    "diabetes": "Diabetes",
}


def _canonical_report_type(name: str | None) -> str | None:
    category = _resolve_report_category(name)
    return CANONICAL_REPORT_TYPE.get(category) if category else None


def _extract_result_blocks(ocr_data: dict) -> list[dict]:
    """Return OCR blocks that may contain a results object (handles multi-page PDFs)."""
    if not isinstance(ocr_data, dict):
        return []

    if ocr_data.get("multi_page") and isinstance(ocr_data.get("pages"), list):
        blocks = [
            page
            for page in ocr_data["pages"]
            if isinstance(page, dict) and page.get("valid") is not False
        ]
        return blocks or [ocr_data]

    if ocr_data.get("valid") is False:
        return []

    return [ocr_data]


def _parse_numeric(result) -> float | None:
    if result is None:
        return None
    cleaned = str(result).strip().replace(",", "")
    match = re.search(r"[\d.]+", cleaned)
    if not match:
        return None
    try:
        return float(match.group())
    except ValueError:
        return None


def _normalize_date(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    text = str(value).strip()
    if not text:
        return None
    return text[:10] if len(text) >= 10 else text


def _report_date(ocr_data: dict, upload_date) -> str | None:
    dates = ocr_data.get("dates") or {}
    for key in ("report_date", "reported_on", "sample_collected_on", "visit_date"):
        normalized = _normalize_date(dates.get(key))
        if normalized:
            return normalized
    return _normalize_date(upload_date)


def _match_allowed_key(test_name: str, allowed_keys: tuple[str, ...]) -> str | None:
    if test_name in allowed_keys:
        return test_name
    lower = test_name.lower().strip()
    for key in allowed_keys:
        if key.lower() == lower:
            return key
    aliases = {
        "hb": "Hemoglobin",
        "hgb": "Hemoglobin",
        "haemoglobin": "Hemoglobin",
        "wbc": "WBC Count",
        "total wbc": "WBC Count",
        "white blood cell count": "WBC Count",
        "plt": "Platelet Count",
        "platelets": "Platelet Count",
        "platelet": "Platelet Count",
        "rbc": "RBC Count",
        "red blood cell count": "RBC Count",
        "total rbc": "RBC Count",
        "fbs": "Fasting Glucose",
        "fasting blood sugar": "Fasting Glucose",
        "fbg": "Fasting Glucose",
        "fasting plasma glucose": "Fasting Glucose",
        "fasting_glucose": "Fasting Glucose",
        "ppbs": "Post fasting glucose",
        "postprandial glucose": "Post fasting glucose",
        "ppg": "Post fasting glucose",
        "post meal glucose": "Post fasting glucose",
        "post fasting glucose": "Post fasting glucose",
        "postfasting glucose": "Post fasting glucose",
    }
    mapped = aliases.get(lower)
    if mapped and mapped in allowed_keys:
        return mapped
    return None


def _chart_data_for_type(items: list, report_type: str) -> dict:
    allowed_keys = METRICS_BY_REPORT_TYPE.get(report_type, ())
    series_map: dict[str, dict] = {
        key: {"unit": None, "reference_range": None, "points": []}
        for key in allowed_keys
    }
    items_by_id = {item["document_id"]: item for item in items}

    for item in items:
        upload_date = item.get("upload_date")
        report_label = item.get("original_filename") or f"Report {item['document_id'][:8]}"
        for ocr in _extract_result_blocks(item["ocr_data"]):
            date = _report_date(ocr, upload_date)

            results = ocr.get("results")
            if isinstance(results, dict):
                for test_name in allowed_keys:
                    entry = results.get(test_name)
                    if not isinstance(entry, dict):
                        continue
                    raw_value = entry.get("value")
                    value = _parse_numeric(raw_value)
                    if value is None:
                        continue

                    series = series_map[test_name]
                    if entry.get("unit"):
                        series["unit"] = entry["unit"]
                    if entry.get("reference_range"):
                        series["reference_range"] = entry["reference_range"]
                    series["points"].append(
                        {
                            "date": date,
                            "value": value,
                            "raw_result": str(raw_value) if raw_value is not None else None,
                            "document_id": item["document_id"],
                            "report_label": report_label,
                        }
                    )
                continue

            for lab in ocr.get("lab_results") or []:
                test_name = lab.get("test_name")
                if not test_name:
                    continue
                matched = _match_allowed_key(test_name, allowed_keys)
                if not matched:
                    continue
                value = _parse_numeric(lab.get("result"))
                if value is None:
                    continue

                series = series_map[matched]
                if lab.get("unit"):
                    series["unit"] = lab["unit"]
                if lab.get("reference_range"):
                    series["reference_range"] = lab["reference_range"]
                series["points"].append(
                    {
                        "date": date,
                        "value": value,
                        "raw_result": lab.get("result"),
                        "document_id": item["document_id"],
                        "report_label": report_label,
                    }
                )

    metrics = []
    for test_name in allowed_keys:
        data = series_map[test_name]
        if not data["points"]:
            continue
        points = sorted(data["points"], key=lambda p: p.get("date") or "")
        source_reports = _source_reports_for_points(points, items_by_id)
        metrics.append(
            {
                "test_name": test_name,
                "unit": data["unit"],
                "reference_range": data["reference_range"],
                "points": points,
                "source_reports": source_reports,
            }
        )

    return {
        "report_count": len(items),
        "metrics": metrics,
    }


def _source_reports_for_points(points: list, items_by_id: dict) -> list[dict]:
    seen: set[str] = set()
    sources: list[dict] = []

    for point in points:
        document_id = point.get("document_id")
        if not document_id or document_id in seen:
            continue
        seen.add(document_id)

        item = items_by_id.get(document_id) or {}
        sources.append(
            {
                "document_id": document_id,
                "filename": item.get("original_filename") or point.get("report_label"),
                "report_date": point.get("date"),
                "hospital_id": item.get("hospital_id"),
                "hospital_name": item.get("hospital_name"),
                "report_folder_id": item.get("report_folder_id"),
                "report_folder_name": item.get("report_folder_name"),
            }
        )

    return sorted(sources, key=lambda s: s.get("report_date") or "")


def _build_charts(reports: list) -> dict:
    by_type: dict[str, list] = defaultdict(list)

    for report in reports:
        ocr_data = report.get("ocr_data") or {}
        report_type_raw = ocr_data.get("report_type") or report.get("report_folder_name")
        report_type = _canonical_report_type(report_type_raw)
        if not report_type:
            continue
        by_type[report_type].append(
            {
                "document_id": str(report["_id"]),
                "original_filename": report.get("original_filename"),
                "hospital_id": report.get("hospital_id"),
                "hospital_name": report.get("hospital_name"),
                "report_folder_id": report.get("report_folder_id"),
                "report_folder_name": report.get("report_folder_name"),
                "ocr_data": ocr_data,
                "upload_date": report.get("upload_date"),
            }
        )

    return {report_type: _chart_data_for_type(items, report_type) for report_type, items in by_type.items()}


@router.get("/")
async def get_dashboard(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    reports = await documents_col.find(
        {
            "user_id": user_id,
            "folder": "reports",
            "ocr_status": "completed",
        }
    ).to_list(None)

    charts = _build_charts(reports)

    return {
        "available_tests": sorted(charts.keys()),
        "charts": charts,
    }
