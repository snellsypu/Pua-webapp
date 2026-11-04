"""Voice commands: free phrase parsing for everyone; Premium voice (a Settings
switch) adds Whisper transcription and Claude Sonnet 5.5 natural-language
understanding via the Emergent LLM key. Nothing is saved here — the client
shows the draft as a preview and saves through the normal endpoints."""

import io
import json
import logging
import os
import re
import uuid
from datetime import date

from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage
from emergentintegrations.llm.openai import OpenAISpeechToText
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import ValidationError

from lib.db import db
from lib.dates import today_iso
from lib.voice_simple import EXAMPLES, parse_simple
from models.voice import VoiceDraft, VoiceParseIn, VoiceParseOut, VoiceTranscript

router = APIRouter(prefix="/voice", tags=["voice"])
logger = logging.getLogger(__name__)

MAX_AUDIO_MB = 10
AUDIO_EXT = {"audio/webm": "webm", "audio/mp4": "mp4", "audio/mpeg": "mp3", "audio/wav": "wav",
             "audio/x-m4a": "m4a", "audio/m4a": "m4a", "audio/ogg": "webm", "video/webm": "webm"}

AI_SYSTEM = """You turn one spoken sentence into a calendar item for the PUA planner app.
Today is {today} ({weekday}). Resolve relative dates ("next Tuesday", "in 3 days") from today.
Return ONLY a JSON object, no prose, no code fences, with these keys:
  "kind": "appointment" | "habit" | "reminder"   (things to remember or do = reminder; things at a
          time/place, often with others = appointment; recurring self-improvement = habit)
  "title": short title in sentence case, without the date/time words
  "date": "YYYY-MM-DD" or null            (appointment/reminder; null if never mentioned)
  "startTime": "HH:MM" 24h or null        (appointment)
  "endTime": "HH:MM" 24h or null          (appointment)
  "location": string, "" if none          (appointment)
  "time": "HH:MM" 24h or null             (reminder)
  "emoji": one fitting emoji              (habit)
  "habitMode": "streak" | "monthly"       (habit; "N times a month" = monthly)
  "monthlyTarget": integer 1-99           (habit, monthly mode; default 12)
  "tracksDistance": true|false            (habit; true for running/jogging distance)
Vague times: morning 09:00, afternoon 14:00, evening 18:00, tonight 20:00.
If the sentence is not a request to add an appointment, habit or reminder, return {{"kind": null}}."""


async def _premium_enabled() -> bool:
    doc = await db.settings.find_one({"id": "app"}) or {}
    return bool(doc.get("premiumVoice", False))


def _extract_json(text: str) -> dict | None:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


async def _parse_ai(text: str, today: date) -> VoiceDraft | None:
    chat = LlmChat(
        api_key=os.environ["EMERGENT_LLM_KEY"],
        session_id=f"voice-{uuid.uuid4()}",  # stateless: one fresh session per command
        system_message=AI_SYSTEM.format(today=today.isoformat(), weekday=today.strftime("%A")),
    ).with_model("anthropic", "claude-sonnet-5-5")
    out = []
    async for ev in chat.stream_message(UserMessage(text=text)):
        if isinstance(ev, TextDelta):
            out.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    data = _extract_json("".join(out))
    if not data or not data.get("kind"):
        return None
    data = {k: v for k, v in data.items() if v is not None or k in ("date", "startTime", "endTime", "time")}
    try:
        return VoiceDraft(**data)
    except ValidationError:
        logger.warning("AI draft failed validation: %s", data)
        return None


@router.post("/parse", response_model=VoiceParseOut)
async def parse(input: VoiceParseIn):
    today = date.fromisoformat(today_iso())
    text = input.text.strip()
    if input.mode == "ai":
        if not await _premium_enabled():
            raise HTTPException(status_code=403, detail="Premium voice is off — turn it on in Settings")
        try:
            draft = await _parse_ai(text, today)
        except Exception:  # provider/network trouble — fall back so the user isn't stuck
            logger.exception("AI parse failed; falling back to simple phrases")
            draft = None
        if draft:
            return VoiceParseOut(transcript=text, mode="ai", draft=draft)
        simple, _ = parse_simple(text, today)
        if simple:
            return VoiceParseOut(transcript=text, mode="simple", draft=simple)
        return VoiceParseOut(transcript=text, mode="ai",
                             message="I couldn't turn that into an appointment, habit or reminder. " + EXAMPLES)
    draft, message = parse_simple(text, today)
    return VoiceParseOut(transcript=text, mode="simple", draft=draft, message=message)


@router.post("/transcribe", response_model=VoiceTranscript)
async def transcribe(file: UploadFile = File(...)):
    if not await _premium_enabled():
        raise HTTPException(status_code=403, detail="Premium voice is off — turn it on in Settings")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty recording")
    if len(data) > MAX_AUDIO_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Recording too long")
    ctype = (file.content_type or "").split(";")[0].strip().lower()
    ext = AUDIO_EXT.get(ctype)
    if not ext:
        raise HTTPException(status_code=415, detail="Unsupported audio format")
    buf = io.BytesIO(data)
    buf.name = f"command.{ext}"  # Whisper infers the format from the file name
    try:
        stt = OpenAISpeechToText(api_key=os.environ["EMERGENT_LLM_KEY"])
        res = await stt.transcribe(
            file=buf,
            model="whisper-1",
            response_format="json",
            prompt="Voice commands for a planner app called PUA: appointments, habits, reminders.",
            temperature=0.0,
        )
    except Exception as exc:
        logger.exception("transcription failed")
        raise HTTPException(status_code=502, detail="Transcription failed — try again") from exc
    text = (getattr(res, "text", "") or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail="I didn't catch anything — try again")
    return VoiceTranscript(text=text)
