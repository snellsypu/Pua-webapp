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
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from pydantic import ValidationError

from lib.db import db
from lib.dates import today_iso
from lib.briefing import build_bedtime, build_briefing, build_wake
from lib.voice_intents import is_briefing, match_score, parse_checkoff, parse_shopping, tokens
from lib.voice_simple import EXAMPLES, parse_simple
from models.voice import VoiceDraft, VoiceParseIn, VoiceParseOut, VoiceTranscript

router = APIRouter(prefix="/voice", tags=["voice"])
logger = logging.getLogger(__name__)

MAX_AUDIO_MB = 10
AUDIO_EXT = {"audio/webm": "webm", "audio/mp4": "mp4", "audio/mpeg": "mp3", "audio/wav": "wav",
             "audio/x-m4a": "m4a", "audio/m4a": "m4a", "audio/ogg": "webm", "video/webm": "webm"}

AI_SYSTEM = """You turn one spoken sentence into an action for the PUA planner app.
Today is {today} ({weekday}). Resolve relative dates ("next Tuesday", "in 3 days") from today.
Return ONLY a JSON object, no prose, no code fences, with these keys:
  "kind": "appointment" | "habit" | "reminder"   (things to remember or do = reminder; things at a
          time/place, often with others = appointment; recurring self-improvement = habit)
  "title": short title in sentence case, without the date/time words
  "date": "YYYY-MM-DD" or null            (appointment/reminder; null if never mentioned)
  "startTime": "HH:MM" 24h or null        (appointment)
  "endTime": "HH:MM" 24h or null          (appointment)
  "location": string, "" if none          (appointment)
  "private": true|false                   (appointment; true if they say private/personal/secret
          or ask to hide it from friends — then leave that word out of the title)
  "time": "HH:MM" 24h or null             (reminder)
  "emoji": one fitting emoji              (habit)
  "habitMode": "streak" | "monthly"       (habit; "N times a month" = monthly)
  "monthlyTarget": integer 1-99           (habit, monthly mode; default 12)
  "tracksDistance": true|false            (habit; true for running/jogging distance)
Vague times: morning 09:00, afternoon 14:00, evening 18:00, tonight 20:00.
Other kinds:
  {{"kind": "shopping", "title": "Shopping list", "items": ["Milk", "Eggs"]}}  — adding things to the
          shopping/grocery list; one short item per entry, capitalised, no quantities words like "some".
  {{"kind": "checkoff", "title": "<what they did, e.g. run / brush teeth / read>", "distanceKm": number|null}}
          — the user says they did or finished something (a habit or routine step). Convert miles to km.
  {{"kind": "briefing", "title": "Briefing"}} — they ask what their day looks like / for a briefing.
If the sentence is none of these, return {{"kind": null}}."""


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


async def _parse_ai(text: str, today: date) -> dict | None:
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
    return data if data and data.get("kind") else None


def _to_draft(data: dict) -> VoiceDraft | None:
    if data.get("kind") not in ("appointment", "habit", "reminder"):
        return None
    allowed = {"kind", "title", "date", "startTime", "endTime", "location", "private", "time", "emoji",
               "habitMode", "monthlyTarget", "tracksDistance"}
    data = {k: v for k, v in data.items() if k in allowed and (v is not None or k in ("date", "startTime", "endTime", "time"))}
    try:
        return VoiceDraft(**data)
    except ValidationError:
        logger.warning("AI draft failed validation: %s", data)
        return None


async def _resolve_checkoff(phrase: str, km: float | None) -> tuple[VoiceDraft | None, str | None]:
    """Match "brushing teeth" / "run" to a habit or routine step and build a check-off draft."""
    today = today_iso()
    p = tokens(phrase)
    is_run = bool(p & {"run", "jog"}) or km is not None
    habits = await db.habits.find().to_list(200)
    done_habits = {c["habitId"] for c in await db.habit_completions.find({"date": today}).to_list(1000)}
    best: tuple[float, dict] | None = None
    for h in habits:
        score = match_score(p, h["name"])
        if is_run and h.get("tracksDistance"):
            score += 1.0
        if score > 0 and (best is None or score > best[0]):
            best = (score, {"type": "habit", "doc": h})
    for r in await db.routines.find().to_list(10):
        check = await db.routine_checks.find_one({"kind": r["kind"], "date": today}) or {}
        for st in r.get("steps", []):
            score = match_score(p, st["text"])
            if score > 0 and (best is None or score > best[0] + 0.001):
                best = (score, {"type": "routine", "doc": st, "kind": r["kind"],
                                "done": st["id"] in check.get("doneStepIds", [])})
    if not best or best[0] < 0.5:
        return None, (f"I couldn't find a habit or routine step matching “{phrase}”. "
                      'Try its name, e.g. "done brush teeth" or "I ran 5k".')
    hit = best[1]
    if hit["type"] == "habit":
        h = hit["doc"]
        dist = km if h.get("tracksDistance") else None
        if h["id"] in done_habits and dist is None:
            return None, f"{h['name']} is already ticked off today."
        return VoiceDraft(kind="checkoff", title=h["name"], emoji=h.get("emoji", "🎯"), targetType="habit",
                          targetId=h["id"], tracksDistance=bool(h.get("tracksDistance")), distanceKm=dist), None
    st = hit["doc"]
    if hit["done"]:
        return None, f"“{st['text']}” is already ticked off in your {hit['kind']} routine."
    return VoiceDraft(kind="checkoff", title=st["text"], emoji="☀️" if hit["kind"] == "morning" else "🌙",
                      targetType="routine", targetId=st["id"], routineKind=hit["kind"]), None


async def _intents(text: str) -> VoiceParseOut | None:
    """Briefing / shopping / check-off phrases (free mode, and the cheap first pass in Premium)."""
    if is_briefing(text):
        return VoiceParseOut(transcript=text, mode="simple", briefing=await build_briefing())
    items = parse_shopping(text)
    if items:
        return VoiceParseOut(transcript=text, mode="simple",
                             draft=VoiceDraft(kind="shopping", title="Shopping list", items=items))
    co = parse_checkoff(text)
    if co:
        draft, message = await _resolve_checkoff(*co)
        return VoiceParseOut(transcript=text, mode="simple", draft=draft, message=message)
    return None


@router.post("/parse", response_model=VoiceParseOut)
async def parse(input: VoiceParseIn):
    today = date.fromisoformat(today_iso())
    text = input.text.strip()
    if input.mode == "ai":
        if not await _premium_enabled():
            raise HTTPException(status_code=403, detail="Premium voice is off — turn it on in Settings")
        if is_briefing(text):
            return VoiceParseOut(transcript=text, mode="simple", briefing=await build_briefing())
        try:
            raw = await _parse_ai(text, today)
        except Exception:  # provider/network trouble — fall back so the user isn't stuck
            logger.exception("AI parse failed; falling back to simple phrases")
            raw = None
        if raw is not None:
            kind = raw.get("kind")
            if kind == "briefing":
                return VoiceParseOut(transcript=text, mode="ai", briefing=await build_briefing())
            if kind == "checkoff":
                km = raw.get("distanceKm")
                draft, message = await _resolve_checkoff(str(raw.get("title") or ""), float(km) if km else None)
                return VoiceParseOut(transcript=text, mode="ai", draft=draft, message=message)
            if kind == "shopping":
                items = [str(i).strip()[:80] for i in raw.get("items") or [] if str(i).strip()][:20]
                if items:
                    return VoiceParseOut(transcript=text, mode="ai",
                                         draft=VoiceDraft(kind="shopping", title="Shopping list", items=items))
            else:
                draft = _to_draft(raw)
                if draft:
                    return VoiceParseOut(transcript=text, mode="ai", draft=draft)
        fallback = await _intents(text)
        if fallback and (fallback.draft or fallback.briefing):
            return fallback
        simple, _ = parse_simple(text, today)
        if simple:
            return VoiceParseOut(transcript=text, mode="simple", draft=simple)
        return VoiceParseOut(transcript=text, mode="ai",
                             message="I couldn't turn that into something PUA can do. " + EXAMPLES)
    found = await _intents(text)
    if found:
        return found
    draft, message = parse_simple(text, today)
    return VoiceParseOut(transcript=text, mode="simple", draft=draft, message=message)


@router.get("/wake", response_model=VoiceTranscript)
async def wake_text(lat: float | None = Query(default=None, ge=-90, le=90),
                    lon: float | None = Query(default=None, ge=-180, le=180)):
    """Text read aloud when the wake-up link / notification opens PUA. lat/lon (the
    phone's live location) is only used with Premium + live location on."""
    live = (lat, lon) if lat is not None and lon is not None else None
    return VoiceTranscript(text=await build_wake(live))


@router.get("/bedtime", response_model=VoiceTranscript)
async def bedtime_text():
    """Tomorrow read-out for the bedtime routine (notification tap / first open)."""
    return VoiceTranscript(text=await build_bedtime())


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
