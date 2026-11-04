"""Free-mode voice parser: turns a fixed-pattern phrase into a VoiceDraft.

Understood patterns (case-insensitive, filler words ignored):
  appointment / meeting / event <title> [at|in <place>] [<day>] [at <time>] [to|until <time>]
  remind me to <title> [<day>] [at <time>]      — or "reminder <title> …"
  [monthly] habit <title> [<N> times a month] [track distance]
  <day> = today, tonight, tomorrow, day after tomorrow, [next] monday…sunday,
          in <N> days, <month> <D> / <D> <month>
  <time> = 3pm, 3:30 pm, 15:00, noon, midnight, morning, afternoon, evening, tonight
"""

import re
from datetime import date, timedelta

from models.voice import VoiceDraft

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august",
          "september", "october", "november", "december"]
NUMBER_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
                "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "fifteen": 15,
                "twenty": 20, "thirty": 30}
PERIODS = {"morning": "09:00", "afternoon": "14:00", "evening": "18:00", "tonight": "20:00",
           "noon": "12:00", "midday": "12:00", "midnight": "00:00"}
EMOJI_HINTS = [("read", "📚"), ("book", "📚"), ("run", "🏃"), ("jog", "🏃"), ("walk", "🚶"),
               ("medita", "🧘"), ("yoga", "🧘"), ("water", "💧"), ("drink", "💧"), ("gym", "🏋️"),
               ("lift", "🏋️"), ("workout", "🏋️"), ("sleep", "😴"), ("bed", "😴"), ("writ", "✍️"),
               ("journal", "✍️"), ("guitar", "🎸"), ("piano", "🎸"), ("music", "🎸"), ("clean", "🧹"),
               ("cod", "💻"), ("paint", "🎨"), ("draw", "🎨"), ("salad", "🥗"), ("veg", "🥗")]
FILLER = r"\b(?:please|can you|could you|i want to|i need to|new|add|create|set|make|schedule|book|an?|for|called|named)\b"

_AMPM = r"(a\.?\s?m\.?|p\.?\s?m\.?)"
TIME_RE = re.compile(
    rf"\b(?:at\s+)?(\d{{1,2}})(?:[:.](\d{{2}}))?\s*{_AMPM}"  # 3pm, 3:30 p.m.
    rf"|\bat\s+(\d{{1,2}})(?:[:.](\d{{2}}))?\b(?!\s*(?:times|days|pages|km|miles|minutes))"  # at 3, at 15:00
    rf"|\b(\d{{1,2}}):(\d{{2}})\b",  # 15:00
    re.I,
)


def _hhmm(h: int, m: int, ampm: str | None) -> str | None:
    if ampm:
        pm = ampm.lower().startswith("p")
        if not 1 <= h <= 12:
            return None
        h = (h % 12) + (12 if pm else 0)
    elif h <= 6:  # "at 3" with no am/pm almost always means afternoon
        h += 12
    if not (0 <= h <= 23 and 0 <= m <= 59):
        return None
    return f"{h:02d}:{m:02d}"


def _take_time(text: str) -> tuple[str | None, str]:
    m = TIME_RE.search(text)
    if not m:
        for word, hhmm in PERIODS.items():
            pm = re.search(rf"\b(?:this |in the |at )?{word}\b", text, re.I)
            if pm:
                return hhmm, (text[: pm.start()] + text[pm.end():])
        return None, text
    g = m.groups()
    if g[0]:
        val = _hhmm(int(g[0]), int(g[1] or 0), g[2])
    elif g[3]:
        val = _hhmm(int(g[3]), int(g[4] or 0), None)
    else:
        val = _hhmm(int(g[5]), int(g[6]), "") if int(g[5]) > 12 else _hhmm(int(g[5]), int(g[6]), None)
    return val, (text[: m.start()] + text[m.end():])


def _take_end_time(text: str) -> tuple[str | None, str]:
    m = re.search(rf"\b(?:to|until|till|-)\s+(\d{{1,2}})(?:[:.](\d{{2}}))?\s*{_AMPM}?", text, re.I)
    if not m:
        return None, text
    return _hhmm(int(m.group(1)), int(m.group(2) or 0), m.group(3)), text[: m.start()] + text[m.end():]


def _take_date(text: str, today: date) -> tuple[str | None, str]:
    t = text
    rules: list[tuple[str, callable]] = [
        (r"\bday after tomorrow\b", lambda m: today + timedelta(days=2)),
        (r"\btomorrow\b", lambda m: today + timedelta(days=1)),
        (r"\b(?:today|tonight)\b", lambda m: today),
        (r"\bin (\d+|" + "|".join(NUMBER_WORDS) + r") days?\b",
         lambda m: today + timedelta(days=int(NUMBER_WORDS.get(m.group(1).lower(), m.group(1))))),
    ]
    for pattern, fn in rules:
        m = re.search(pattern, t, re.I)
        if m:
            keep_tonight = m.group(0).lower() == "tonight"
            rest = t[: m.start()] + (" tonight " if keep_tonight else " ") + t[m.end():]
            return fn(m).isoformat(), rest
    m = re.search(r"\b(?:on\s+)?(next|this)?\s*(" + "|".join(WEEKDAYS) + r")\b", t, re.I)
    if m:
        target = WEEKDAYS.index(m.group(2).lower())
        delta = (target - today.weekday()) % 7
        if m.group(1) and m.group(1).lower() == "next" and delta == 0:
            delta = 7
        return (today + timedelta(days=delta)).isoformat(), t[: m.start()] + " " + t[m.end():]
    month_alt = "|".join(MONTHS + [mo[:3] for mo in MONTHS])
    m = (re.search(rf"\b(?:on\s+)?(?:the\s+)?({month_alt})\s+(\d{{1,2}})(?:st|nd|rd|th)?\b", t, re.I)
         or re.search(rf"\b(?:on\s+)?(?:the\s+)?(\d{{1,2}})(?:st|nd|rd|th)?\s+(?:of\s+)?({month_alt})\b", t, re.I))
    if m:
        a, b = m.group(1), m.group(2)
        month_word, day_num = (a, b) if not a.isdigit() else (b, a)
        month = next(i for i, mo in enumerate(MONTHS, 1) if mo.startswith(month_word.lower()[:3]))
        try:
            d = date(today.year, month, int(day_num))
            if d < today:
                d = date(today.year + 1, month, int(day_num))
            return d.isoformat(), t[: m.start()] + " " + t[m.end():]
        except ValueError:
            pass
    return None, t


def _clean_title(text: str) -> str:
    t = re.sub(FILLER, " ", text, flags=re.I)
    t = re.sub(r"\b(?:on|at|in|the)\s*$", " ", t.strip(), flags=re.I)
    t = re.sub(r"^\s*(?:to|on|at|the|of)\b", " ", t, flags=re.I)
    t = re.sub(r"[\s,.;:!?-]+", " ", t).strip()
    return t[:1].upper() + t[1:] if t else ""


EXAMPLES = ('Try: "appointment dentist tomorrow at 3pm", "remind me to call mum Friday at 6pm", '
            'or "habit read 20 pages".')


def parse_simple(raw: str, today: date) -> tuple[VoiceDraft | None, str | None]:
    text = " " + re.sub(r"\s+", " ", raw.strip().rstrip(".!?")) + " "
    low = text.lower()

    # ---- kind
    if re.search(r"\b(?:remind me|reminder)\b", low):
        kind = "reminder"
        text = re.sub(r"\b(?:set\s+)?(?:a\s+)?(?:remind me(?: to)?|reminder(?: to)?)\b", " ", text, flags=re.I)
    elif re.search(r"\bhabits?\b", low):
        kind = "habit"
        text = re.sub(r"\bhabits?\b", " ", text, flags=re.I)
    elif m_kind := re.search(r"\b(appointment|meeting|event)\b", low):
        kind = "appointment"
        kind_word = m_kind.group(1)
        text = re.sub(r"\b(?:appointment|meeting|event)s?\b", " ", text, flags=re.I)
    else:
        kind = None
    kind_word = locals().get("kind_word", "")

    if kind == "habit":
        monthly = re.search(r"\b(\d+|" + "|".join(NUMBER_WORDS) + r")\s+times?\s+(?:a|per|each|every)\s+month\b", text, re.I)
        mode = "monthly" if monthly or re.search(r"\bmonthly\b", text, re.I) else "streak"
        target = int(NUMBER_WORDS.get(monthly.group(1).lower(), monthly.group(1))) if monthly else 12
        if monthly:
            text = text[: monthly.start()] + " " + text[monthly.end():]
        text = re.sub(r"\b(?:monthly|daily|streak|counter|every day|each day)\b", " ", text, flags=re.I)
        distance = bool(re.search(r"\b(?:track(?:ing)?\s+)?distance\b", text, re.I))
        text = re.sub(r"\b(?:and\s+|with\s+)?(?:track(?:ing)?\s+)?distance\b", " ", text, flags=re.I)
        title = _clean_title(text)
        if not title:
            return None, "I heard a habit but not its name. " + EXAMPLES
        lowt = title.lower()
        emoji = next((e for k, e in EMOJI_HINTS if k in lowt), "🎯")
        distance = distance or bool(re.search(r"\brun|jog", lowt))
        return VoiceDraft(kind="habit", title=title, emoji=emoji, habitMode=mode,
                          monthlyTarget=max(1, min(99, target)), tracksDistance=distance), None

    end_time, text = _take_end_time(text) if kind != "reminder" else (None, text)
    the_date, text = _take_date(text, today)
    the_time, text = _take_time(text)
    if kind is None:
        if not (the_date or the_time):
            return None, "I couldn't tell if that's an appointment, habit or reminder. " + EXAMPLES
        kind = "appointment"

    location = ""
    if kind == "appointment":
        m = re.search(r"\b(?:at|in)\s+(?:the\s+)?([A-Za-z][\w'’&. ]{1,60}?)\s*$", text.strip(), re.I)
        if m and m.group(1).lower() not in ("the", "morning", "evening"):
            location = m.group(1).strip().title() if m.group(1).islower() else m.group(1).strip()
            text = text.strip()[: m.start()]

    title = _clean_title(text)
    if title.lower().startswith("with ") and kind_word in ("meeting", "appointment"):
        title = f"{kind_word.capitalize()} {title[:1].lower()}{title[1:]}"  # "Meeting with Sam"
    if not title:
        return None, f"I heard a {kind} but not what it's for. " + EXAMPLES
    when = the_date or today.isoformat()
    if kind == "reminder":
        return VoiceDraft(kind="reminder", title=title, date=when, time=the_time or "09:00"), None
    return VoiceDraft(kind="appointment", title=title, date=when, startTime=the_time or "09:00",
                      endTime=end_time, location=location), None
