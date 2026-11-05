"""Holiday sets for Anniversaries. UK + Christian dates are computed every year; lunar
calendars (Islamic, Jewish, Hindu, Sikh, Buddhist, Chinese) use a table of published
dates — they can shift by a day depending on the community / moon sighting."""

from datetime import date, timedelta

HOLIDAY_SETS: dict[str, dict] = {
    "uk": {"label": "UK bank holidays & celebrations", "group": "UK"},
    "christian": {"label": "Christian", "group": "Religious"},
    "islamic": {"label": "Islamic", "group": "Religious"},
    "jewish": {"label": "Jewish", "group": "Religious"},
    "hindu": {"label": "Hindu", "group": "Religious"},
    "sikh": {"label": "Sikh", "group": "Religious"},
    "buddhist": {"label": "Buddhist", "group": "Religious"},
    "chinese": {"label": "Chinese & Lunar New Year", "group": "Cultural"},
}
DEFAULT_SETS = ["uk"]


def easter(y: int) -> date:
    """Anonymous Gregorian algorithm."""
    a, b, c = y % 19, y // 100, y % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l_ = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l_) // 451
    month = (h + l_ - 7 * m + 114) // 31
    day = (h + l_ - 7 * m + 114) % 31 + 1
    return date(y, month, day)


def _nth_weekday(y: int, month: int, weekday: int, n: int) -> date:
    """n-th weekday (0=Mon) of a month; n=-1 → last."""
    if n > 0:
        d = date(y, month, 1)
        d += timedelta(days=(weekday - d.weekday()) % 7)
        return d + timedelta(weeks=n - 1)
    d = date(y + (month == 12), month % 12 + 1, 1) - timedelta(days=1)
    return d - timedelta(days=(d.weekday() - weekday) % 7)


def _uk(y: int) -> list[tuple[date, str, str]]:
    e = easter(y)
    ny = date(y, 1, 1)
    ny_obs = ny + timedelta(days={5: 2, 6: 1}.get(ny.weekday(), 0))
    xmas, boxing = date(y, 12, 25), date(y, 12, 26)
    if xmas.weekday() == 5:
        xmas_obs, boxing_obs = xmas + timedelta(days=2), boxing + timedelta(days=2)
    elif xmas.weekday() == 6:
        xmas_obs, boxing_obs = xmas + timedelta(days=2), boxing
    elif boxing.weekday() == 5:
        xmas_obs, boxing_obs = xmas, boxing + timedelta(days=2)
    else:
        xmas_obs, boxing_obs = xmas, boxing
    out = [
        (ny_obs, "New Year's Day" + (" (bank holiday)" if ny_obs != ny else ""), "🎆"),
        (e - timedelta(days=2), "Good Friday", "✝️"),
        (e + timedelta(days=1), "Easter Monday", "🐣"),
        (_nth_weekday(y, 5, 0, 1), "Early May bank holiday", "🌷"),
        (_nth_weekday(y, 5, 0, -1), "Spring bank holiday", "🌼"),
        (_nth_weekday(y, 8, 0, -1), "Summer bank holiday", "☀️"),
        (xmas, "Christmas Day", "🎄"),
        (boxing, "Boxing Day", "🎁"),
        (date(y, 2, 14), "Valentine's Day", "💝"),
        (e - timedelta(days=21), "Mother's Day", "💐"),
        (_nth_weekday(y, 6, 6, 3), "Father's Day", "👔"),
        (date(y, 10, 31), "Halloween", "🎃"),
        (date(y, 11, 5), "Bonfire Night", "🎇"),
        (date(y, 12, 31), "New Year's Eve", "🥂"),
    ]
    if xmas_obs != xmas:
        out.append((xmas_obs, "Christmas bank holiday (substitute day)", "🎄"))
    if boxing_obs != boxing:
        out.append((boxing_obs, "Boxing Day bank holiday (substitute day)", "🎁"))
    return out


def _christian(y: int) -> list[tuple[date, str, str]]:
    e = easter(y)
    return [
        (date(y, 1, 6), "Epiphany", "⭐"),
        (e - timedelta(days=46), "Ash Wednesday", "✝️"),
        (e - timedelta(days=7), "Palm Sunday", "🌿"),
        (e - timedelta(days=2), "Good Friday", "✝️"),
        (e, "Easter Sunday", "🐣"),
        (e + timedelta(days=49), "Pentecost", "🕊️"),
        (date(y, 12, 24), "Christmas Eve", "🕯️"),
        (date(y, 12, 25), "Christmas Day", "🎄"),
    ]


# Published dates (can vary by a day by community / moon sighting).
TABLE: dict[str, dict[int, list[tuple[str, str, str]]]] = {
    "islamic": {
        2026: [("02-18", "Ramadan begins", "🌙"), ("03-20", "Eid al-Fitr", "🕌"), ("05-27", "Eid al-Adha", "🐑"),
               ("06-16", "Islamic New Year", "🌙"), ("08-25", "Mawlid al-Nabi", "🕌")],
        2027: [("02-08", "Ramadan begins", "🌙"), ("03-10", "Eid al-Fitr", "🕌"), ("05-16", "Eid al-Adha", "🐑"),
               ("06-06", "Islamic New Year", "🌙"), ("08-14", "Mawlid al-Nabi", "🕌")],
        2028: [("01-28", "Ramadan begins", "🌙"), ("02-27", "Eid al-Fitr", "🕌"), ("05-05", "Eid al-Adha", "🐑"),
               ("05-25", "Islamic New Year", "🌙"), ("08-03", "Mawlid al-Nabi", "🕌")],
    },
    "jewish": {
        2026: [("03-03", "Purim", "🎭"), ("04-02", "Passover begins", "🍷"), ("09-12", "Rosh Hashanah", "🍎"),
               ("09-21", "Yom Kippur", "🕍"), ("12-05", "Hanukkah begins", "🕎")],
        2027: [("03-23", "Purim", "🎭"), ("04-22", "Passover begins", "🍷"), ("10-02", "Rosh Hashanah", "🍎"),
               ("10-11", "Yom Kippur", "🕍"), ("12-25", "Hanukkah begins", "🕎")],
        2028: [("03-12", "Purim", "🎭"), ("04-11", "Passover begins", "🍷"), ("09-21", "Rosh Hashanah", "🍎"),
               ("09-30", "Yom Kippur", "🕍"), ("12-13", "Hanukkah begins", "🕎")],
    },
    "hindu": {
        2026: [("03-04", "Holi", "🎨"), ("08-28", "Raksha Bandhan", "🧶"), ("10-11", "Navratri begins", "💃"),
               ("11-08", "Diwali", "🪔")],
        2027: [("03-22", "Holi", "🎨"), ("08-17", "Raksha Bandhan", "🧶"), ("09-30", "Navratri begins", "💃"),
               ("10-29", "Diwali", "🪔")],
        2028: [("03-11", "Holi", "🎨"), ("08-05", "Raksha Bandhan", "🧶"), ("09-19", "Navratri begins", "💃"),
               ("10-17", "Diwali", "🪔")],
    },
    "sikh": {
        2026: [("04-14", "Vaisakhi", "🌾"), ("11-08", "Bandi Chhor Divas", "🪔"), ("11-24", "Guru Nanak Gurpurab", "🙏")],
        2027: [("04-14", "Vaisakhi", "🌾"), ("10-29", "Bandi Chhor Divas", "🪔"), ("11-14", "Guru Nanak Gurpurab", "🙏")],
        2028: [("04-13", "Vaisakhi", "🌾"), ("10-17", "Bandi Chhor Divas", "🪔"), ("11-02", "Guru Nanak Gurpurab", "🙏")],
    },
    "buddhist": {
        2026: [("05-31", "Vesak (Buddha Day)", "🪷"), ("12-08", "Bodhi Day", "🌳")],
        2027: [("05-20", "Vesak (Buddha Day)", "🪷"), ("12-08", "Bodhi Day", "🌳")],
        2028: [("05-09", "Vesak (Buddha Day)", "🪷"), ("12-08", "Bodhi Day", "🌳")],
    },
    "chinese": {
        2026: [("02-17", "Lunar New Year (Horse)", "🧧"), ("03-03", "Lantern Festival", "🏮"), ("06-19", "Dragon Boat Festival", "🐉"),
               ("09-25", "Mid-Autumn Festival", "🥮")],
        2027: [("02-06", "Lunar New Year (Goat)", "🧧"), ("02-20", "Lantern Festival", "🏮"), ("06-09", "Dragon Boat Festival", "🐉"),
               ("09-15", "Mid-Autumn Festival", "🥮")],
        2028: [("01-26", "Lunar New Year (Monkey)", "🧧"), ("02-09", "Lantern Festival", "🏮"), ("05-28", "Dragon Boat Festival", "🐉"),
               ("10-03", "Mid-Autumn Festival", "🥮")],
    },
}


def holidays_between(sets: list[str], start: date, end: date) -> list[dict]:
    """Every holiday from the chosen sets with start <= date <= end (deduped by date+name)."""
    out: dict[tuple[str, str], dict] = {}
    for y in range(start.year, end.year + 1):
        for s in sets:
            if s == "uk":
                rows = _uk(y)
            elif s == "christian":
                rows = _christian(y)
            else:
                rows = [(date.fromisoformat(f"{y}-{md}"), n, em) for md, n, em in TABLE.get(s, {}).get(y, [])]
            for d, name, emoji in rows:
                if start <= d <= end and (d.isoformat(), name) not in out:
                    out[(d.isoformat(), name)] = {"date": d, "title": name, "emoji": emoji, "set": s}
    return sorted(out.values(), key=lambda h: h["date"])
