import os
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

import hashlib
import random

from main import analyze, geocode, MODEL_TEXT

app = FastAPI(title="F.I.R.E. ML सेवा", version="1.0")

TYPE_MAP = {
    "Жалоба": "Complaint",
    "Смена данных": "Change of data",
    "Консультация": "Consultation",
    "Претензия": "Complaint",
    "Неработоспособность приложения": "Technical issue",
    "Мошеннические действия": "Fraud",
    "Спам": "Spam",
}

SENTIMENT_MAP = {
    "Позитивный": "positive",
    "Нейтральный": "neutral",
    "Негативный": "negative",
}


class AnalyzeRequest(BaseModel):
    ticket_id: str
    segment: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    message: Optional[str] = None


class AnalyzeResponse(BaseModel):
    ticket_id: str
    type: str
    sentiment: str
    priority: int
    language: str
    summary: str
    recommendation: str
    geo: dict
    model_version: str


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze_ticket(req: AnalyzeRequest):
    def mock_result():
        seed = int(hashlib.md5(req.ticket_id.encode("utf-8")).hexdigest(), 16)
        rng = random.Random(seed)
        types = ["Consultation", "Complaint", "Technical issue", "Change of data", "Fraud", "Spam"]
        languages = ["RU", "KZ", "ENG"]
        return {
            "type": rng.choice(types),
            "sentiment": rng.choice(["neutral", "positive", "negative"]),
            "priority": rng.randint(1, 10),
            "language": rng.choice(languages),
            "summary": "Автоматическое резюме (mock) по обращению клиента.",
            "recommendation": "Назначить подходящего менеджера (mock).",
        }

    use_mock = os.getenv("MOCK_AI", "").lower() in ("1", "true", "yes") or not os.getenv("GROQ_API_KEY")
    if use_mock:
        result = mock_result()
    else:
        try:
            result = analyze(text=req.message)
        except Exception:
            result = mock_result()

    raw_type = result.get("type", "Консультация")
    raw_sentiment = result.get("sentiment", "Нейтральный")

    type_en = TYPE_MAP.get(raw_type, raw_type)
    sentiment_en = SENTIMENT_MAP.get(raw_sentiment, raw_sentiment)

    summary = result.get("summary", "")
    recommendation = result.get("recommendation") or summary

    coords = None
    if req.city or req.address:
        try:
            coords = geocode(
                country="Kazakhstan",
                city=req.city or "",
                street=req.address or "",
                house="",
            )
        except Exception:
            coords = None

    if coords:
        lat, lon = coords
        confidence = 0.8
    else:
        lat, lon, confidence = 0.0, 0.0, 0.0

    return {
        "ticket_id": req.ticket_id,
        "type": type_en,
        "sentiment": sentiment_en,
        "priority": int(result.get("priority", 1)),
        "language": result.get("language", "RU"),
        "summary": summary,
        "recommendation": recommendation,
        "geo": {
            "lat": lat,
            "lon": lon,
            "confidence": confidence,
        },
        "model_version": f"groq:{MODEL_TEXT}",
    }
