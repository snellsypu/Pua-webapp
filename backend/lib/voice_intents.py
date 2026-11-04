"""Free-mode voice intents beyond "create": daily briefing, shopping list items and
check-offs ("I ran 5k", "done brushing teeth"). Pure text helpers — the router
resolves check-off phrases against the user's habits and routine steps."""

import re

from lib.voice_simple import NUMBER_WORDS

KM_PER_MI = 1.609344

BRIEFING_RE = re.compile(
    r"\b(?:what(?:'s|’s| is)\s+(?:on\s+)?(?:my|the)\s+(?:day|agenda|schedule|plan)(?:\s+today)?"
    r"|what(?:'s|’s| is)\s+(?:on\s+)?(?:for\s+)?today|what do i have(?:\s+on)?\s+today"
    r"|(?:brief|briefing|morning briefing|daily briefing|my briefing)|how(?:'s|’s| is)\s+my day(?:\s+looking)?"
    r"|tell me about (?:my|today)|my day)\b",
    re.I,
)

SHOP_LIST = r"(?:the\s+|my\s+|our\s+)?(?:shopping|grocery|groceries)(?:\s+list)?"
SHOP_RE = [
    re.compile(rf"^(?:please\s+)?(?:add|put|stick|pop)\s+(.+?)\s+(?:to|on|onto|in)\s+{SHOP_LIST}$", re.I),
    re.compile(rf"^(?:add\s+to\s+|on\s+)?{SHOP_LIST}[\s,:]+(?:add\s+)?(.+)$", re.I),
    re.compile(r"^(?:i|we)\s+need\s+to\s+buy\s+(.+)$|^(?:i|we)\s+need\s+(.+?)\s+from\s+the\s+shops?$|^buy\s+(.+)$", re.I),
]

_DIST_NUM = r"(\d+(?:[.,]\d+)?|" + "|".join(NUMBER_WORDS) + r"|half\s+a)"
DIST_RE = re.compile(
    _DIST_NUM + r"(?:\s+and\s+a\s+half)?\s*(k|km|kms|kilomet(?:er|re)s?|mi|miles?)\b",
    re.I,
)
CHECKOFF_RE = [
    # "I ran 5k", "just ran 3 miles", "went for a run"
    re.compile(r"^(?:i\s+|i've\s+|i have\s+)?(?:just\s+)?(?:ran|run|jogged|did a run|went (?:for )?a run|went running|went jogging)\b(.*)$", re.I),
    # "done brushing teeth", "I've finished my stretch", "tick off read 20 pages"
    re.compile(
        r"^(?:i\s+|i've\s+|i have\s+)?(?:just\s+)?(?:done|did|finished|completed|complete|tick(?:ed)?\s+off|check(?:ed)?\s+off|mark(?:ed)?)\s+(.+?)(?:\s+(?:as\s+)?(?:done|complete|finished))?$",
        re.I,
    ),
    # "brushing teeth done", "stretch is finished"
    re.compile(r"^(.+?)\s+(?:is\s+|are\s+)?(?:done|finished|complete|completed|ticked off)$", re.I),
]

_STOP = {"my", "the", "a", "an", "i", "to", "of", "for", "and", "just", "some", "today", "this",
         "morning", "evening", "tonight", "minutes", "minute", "mins", "please", "it", "with", "glass"}
_IRREGULAR = {"ran": "run", "running": "run", "jogged": "jog", "jogging": "jog", "read": "read",
              "brushed": "brush", "drank": "drink", "made": "make", "wrote": "writ", "writing": "writ",
              "tooth": "teeth", "went": "go", "did": "do", "laid": "lay", "meditated": "medita",
              "meditation": "medita", "meditate": "medita"}


def is_briefing(text: str) -> bool:
    t = text.strip().rstrip("?.!").lower()
    return bool(BRIEFING_RE.search(t)) and len(t.split()) <= 10


def _clean_item(s: str) -> str:
    s = re.sub(r"^\s*(?:some|a|an|the|more|few|couple of|bit of)\s+", "", s.strip(), flags=re.I)
    s = re.sub(r"[\s.!?]+$", "", s)
    return s[:1].upper() + s[1:] if s else ""


def parse_shopping(text: str) -> list[str] | None:
    t = re.sub(r"\s+", " ", text.strip().rstrip(".!?"))
    for rx in SHOP_RE:
        m = rx.match(t)
        if m:
            body = next(g for g in m.groups() if g)
            parts = re.split(r"\s*(?:,|;|&|\band\b|\bplus\b|\balso\b)\s*", body, flags=re.I)
            items = [_clean_item(p) for p in parts]
            items = [i for i in items if i]
            return items[:20] or None
    return None


def _num(word: str) -> float | None:
    w = word.lower().replace(",", ".")
    if w.startswith("half"):
        return 0.5
    if w in NUMBER_WORDS:
        return float(NUMBER_WORDS[w])
    try:
        return float(w)
    except ValueError:
        return None


def take_distance(text: str) -> tuple[float | None, str]:
    m = DIST_RE.search(text)
    if not m:
        return None, text
    val = _num(m.group(1))
    if val is None:
        return None, text
    if "and a half" in m.group(0).lower():
        val += 0.5
    km = val * KM_PER_MI if m.group(2).lower().startswith("mi") else val
    return round(km, 2), text[: m.start()] + " " + text[m.end():]


def parse_checkoff(text: str) -> tuple[str, float | None] | None:
    """→ (phrase naming what was done, distance in km) or None."""
    t = re.sub(r"\s+", " ", text.strip().rstrip(".!?"))
    if re.match(r"^(?:remind|reminder|appointment|meeting|event|habit|add|create|new)\b", t, re.I):
        return None
    for i, rx in enumerate(CHECKOFF_RE):
        m = rx.match(t)
        if m:
            km, _ = take_distance(t)
            phrase = "run" if i == 0 else m.group(1)
            if i == 0 and m.group(1):
                phrase = "run " + take_distance(m.group(1))[1]
            phrase = take_distance(phrase)[1].strip()
            return (phrase or "run"), km
    return None


def tokens(text: str) -> set[str]:
    out = set()
    for w in re.findall(r"[a-z']+", text.lower()):
        w = w.strip("'")
        if not w or w in _STOP or w.isdigit():
            continue
        w = _IRREGULAR.get(w, w)
        for suf in ("ing", "ed", "es", "s"):
            if len(w) > 4 and w.endswith(suf):
                w = w[: -len(suf)]
                break
        out.add(_IRREGULAR.get(w, w))
    return out


def match_score(phrase_tokens: set[str], name: str) -> float:
    name_tokens = tokens(name)
    if not phrase_tokens or not name_tokens:
        return 0.0
    hits = sum(1 for p in phrase_tokens if any(p == n or (len(p) >= 4 and (n.startswith(p) or p.startswith(n))) for n in name_tokens))
    return hits / len(phrase_tokens) + hits / len(name_tokens) * 0.5
