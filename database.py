"""
AquaGuard AI – Database Layer
MongoDB Atlas operations for storing and retrieving analysis records.
"""

from datetime import datetime, timezone
from bson import ObjectId
from flask_pymongo import PyMongo

mongo = PyMongo()


def get_all_analyses(limit: int = 100) -> list:
    """Return recent analysis records, newest first."""
    cursor = mongo.db.analyses.find(
        {}, {"_id": 1, "location_name": 1, "water_type": 1, "risk_level": 1,
             "risk_score": 1, "analyzed_at": 1, "image_filename": 1,
             "latitude": 1, "longitude": 1}
    ).sort("analyzed_at", -1).limit(limit)
    return [_serialize(doc) for doc in cursor]


def get_analysis_by_id(analysis_id: str) -> dict | None:
    """Return a single analysis record by its ObjectId string."""
    try:
        doc = mongo.db.analyses.find_one({"_id": ObjectId(analysis_id)})
        return _serialize(doc) if doc else None
    except Exception:
        return None


def save_analysis(data: dict) -> str:
    """Insert a new analysis record and return its string id."""
    doc = dict(data)
    doc["analyzed_at"] = datetime.now(timezone.utc)
    result = mongo.db.analyses.insert_one(doc)
    return str(result.inserted_id)


def get_dashboard_stats() -> dict:
    """Aggregate statistics for the dashboard."""
    pipeline_risk = [
        {"$group": {"_id": "$risk_level", "count": {"$sum": 1}}}
    ]
    risk_counts = {
        doc["_id"]: doc["count"]
        for doc in mongo.db.analyses.aggregate(pipeline_risk)
    }

    pipeline_type = [
        {"$group": {"_id": "$water_type", "count": {"$sum": 1}}}
    ]
    type_counts = {
        doc["_id"]: doc["count"]
        for doc in mongo.db.analyses.aggregate(pipeline_type)
    }

    pipeline_trend = [
        {
            "$group": {
                "_id": {
                    "year": {"$year": "$analyzed_at"},
                    "month": {"$month": "$analyzed_at"},
                    "day": {"$dayOfMonth": "$analyzed_at"},
                },
                "avg_score": {"$avg": "$risk_score"},
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id.year": 1, "_id.month": 1, "_id.day": 1}},
        {"$limit": 30},
    ]
    trend_data = [
        {
            "date": f"{d['_id']['year']}-{d['_id']['month']:02d}-{d['_id']['day']:02d}",
            "avg_score": round(d["avg_score"], 1),
            "count": d["count"],
        }
        for d in mongo.db.analyses.aggregate(pipeline_trend)
    ]

    total = mongo.db.analyses.count_documents({})
    high_count = risk_counts.get("High", 0)
    avg_pipeline = [{"$group": {"_id": None, "avg": {"$avg": "$risk_score"}}}]
    avg_result = list(mongo.db.analyses.aggregate(avg_pipeline))
    avg_score = round(avg_result[0]["avg"], 1) if avg_result else 0.0

    return {
        "total_analyses": total,
        "high_risk_count": high_count,
        "average_score": avg_score,
        "risk_distribution": {
            "Low": risk_counts.get("Low", 0),
            "Medium": risk_counts.get("Medium", 0),
            "High": risk_counts.get("High", 0),
        },
        "water_type_distribution": type_counts,
        "trend_data": trend_data,
    }


def get_map_points() -> list:
    """Return all records that have lat/lon for the map."""
    cursor = mongo.db.analyses.find(
        {"latitude": {"$exists": True}, "longitude": {"$exists": True}},
        {"_id": 1, "location_name": 1, "water_type": 1, "risk_level": 1,
         "risk_score": 1, "analyzed_at": 1, "latitude": 1, "longitude": 1}
    )
    return [_serialize(doc) for doc in cursor]


def delete_analysis(analysis_id: str) -> bool:
    """Delete an analysis record by id. Returns True on success."""
    try:
        result = mongo.db.analyses.delete_one({"_id": ObjectId(analysis_id)})
        return result.deleted_count == 1
    except Exception:
        return False


def _serialize(doc: dict) -> dict:
    """Convert MongoDB document to JSON-safe dict."""
    if doc is None:
        return {}
    doc["id"] = str(doc.pop("_id"))
    if isinstance(doc.get("analyzed_at"), datetime):
        doc["analyzed_at"] = doc["analyzed_at"].isoformat()
    return doc


# ============================================================
# Satellite Water Pollution Explorer – DB helpers
# ============================================================

def save_satellite_analysis(data: dict) -> str:
    """Insert a satellite analysis record and return its string id."""
    doc = dict(data)
    doc["analyzed_at"] = datetime.now(timezone.utc)
    result = mongo.db.satellite_analyses.insert_one(doc)
    return str(result.inserted_id)


def get_all_satellite_analyses(limit: int = 50) -> list:
    """Return recent satellite analysis records, newest first."""
    cursor = mongo.db.satellite_analyses.find(
        {},
        {
            "_id": 1, "location_name": 1, "water_type": 1,
            "risk_level": 1, "risk_score": 1, "analyzed_at": 1,
            "image_filename": 1, "latitude": 1, "longitude": 1,
            "image_date": 1, "detected_regions": 1,
        }
    ).sort("analyzed_at", -1).limit(limit)
    return [_serialize(doc) for doc in cursor]


def get_satellite_analysis_by_id(analysis_id: str) -> dict | None:
    """Return a single satellite analysis record by its ObjectId string."""
    try:
        doc = mongo.db.satellite_analyses.find_one({"_id": ObjectId(analysis_id)})
        return _serialize(doc) if doc else None
    except Exception:
        return None


def delete_satellite_analysis(analysis_id: str) -> bool:
    """Delete a satellite analysis record. Returns True on success."""
    try:
        result = mongo.db.satellite_analyses.delete_one({"_id": ObjectId(analysis_id)})
        return result.deleted_count == 1
    except Exception:
        return False
