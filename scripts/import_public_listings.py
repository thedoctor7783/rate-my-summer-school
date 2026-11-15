"""Build the public program catalog from the supplied grouped workbook.

Only rows in `Public listings` become search cards. `Offering options` are
children of those listings and must never become duplicate cards.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urlparse

from openpyxl import load_workbook


SITE = Path(__file__).resolve().parents[1]
WORKBOOK = Path(
    "/Users/yafei.wu/WorkBuddy AI/2026-08-29-19-51-47/"
    "summer-school-platform/outputs/01a15c49-ac4c-7303-9b96-0a1805aa6ae1/"
    "US_Precollege_Summer_Programs_Grouped_public listings.xlsx"
)
OUTPUT = SITE / "assets/js/program-catalog-top100.js"
LOGOS = SITE / "assets/images/school-logos"


def text(value: object, default: str = "Unknown") -> str:
    value = str(value or "").strip()
    return value if value and value not in {"—", "-", "N/A"} else default


def normalized(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "program"


def bullets(value: object) -> list[str]:
    return [re.sub(r"^\s*[•*-]\s*", "", line).strip()
            for line in str(value or "").splitlines() if line.strip()]


def urls(value: object) -> list[str]:
    return [url.rstrip(".,;") for url in re.findall(r"https?://[^\s•]+", str(value or ""))]


def domain_for(url: str) -> str | None:
    hostname = (urlparse(url).hostname or "").lower()
    if not hostname:
        return None
    pieces = hostname.split(".")
    domain = ".".join(pieces[-2:]) if len(pieces) > 1 else hostname
    if (LOGOS / f"{domain}.svg").is_file() or (LOGOS / f"{domain}.png").is_file():
        return domain
    return None


old_text = OUTPUT.read_text(encoding="utf-8")
old_records = json.loads(old_text.split("=", 1)[1].strip().rstrip(";"))
old_by_name: dict[str, list[dict]] = {}
for program in old_records:
    old_by_name.setdefault(normalized(program["name"]["en"]), []).append(program)

book = load_workbook(WORKBOOK, read_only=True, data_only=True)
sheet = book["Public listings"]
rows = sheet.values
headers = next(rows)
records = []
used_ids = set()
reused_ids = []

for raw in rows:
    row = dict(zip(headers, raw))
    listing_id = text(row.get("Listing ID"), "")
    if not listing_id:
        continue
    name = text(row.get("Program"))
    host = text(row.get("Institution"))
    candidates = [p for p in old_by_name.get(normalized(name), [])
                  if normalized(p["host"]["en"]) == normalized(host) and p["id"] not in used_ids]
    previous = candidates[0] if len(candidates) == 1 else None
    record_id = previous["id"] if previous else f"public-{listing_id.lower()}-{slug(name)}"
    if record_id in used_ids:
        raise ValueError(f"Duplicate generated ID: {record_id}")
    used_ids.add(record_id)
    if previous:
        reused_ids.append(record_id)

    website = (urls(row.get("Official program website")) or ["Unknown"])[0]
    application = (urls(row.get("Official application / eligibility page")) or ["Unknown"])[0]
    source_urls = urls(row.get("Official source page"))
    source = (source_urls or [website])[0]
    raw_cost = bullets(row.get("Tuition / program cost"))
    fee_lines = [line for line in raw_cost if re.search(r"\bapplication fee\b", line, re.I)]
    tuition_lines = [line for line in raw_cost if line not in fee_lines]
    tuition = "\n".join("• " + line for line in tuition_lines) or text(row.get("Tuition / program cost"))
    application_fee = "\n".join("• " + line for line in fee_lines) or "Unknown"
    study = bullets(row.get("What the program studies"))
    methods = bullets(row.get("How the program studies"))
    logo = previous.get("logoDomain") if previous else None
    logo = logo or domain_for(website)
    cycle = text(row.get("Data cycle"))

    info = {
        "tracksFocus": "Unknown",
        "eligibility": text(row.get("Eligibility")),
        "applicationDeadline": text(row.get("Application deadline")),
        "selectivity": text(row.get("Selectivity")),
        "sessionLength": text(row.get("Session length")),
        "tuition": tuition,
        "applicationFee": application_fee,
        "financialAid": text(row.get("Financial aid")),
        "programDates": text(row.get("Program dates")),
        "academicCredit": text(row.get("Academic credit")),
        "participationFormat": text(row.get("Participation format")),
        "dataCycle": cycle,
        "programUrl": website,
        "applicationUrl": application,
        "sourceUrl": source,
        "officialSourceUrls": source_urls,
    }
    records.append({
        "id": record_id,
        "publicListingId": listing_id,
        "optionCount": int(row.get("Option count") or 0),
        "name": {"en": name, "zh": previous["name"].get("zh", name) if previous else name},
        "host": {"en": host, "zh": previous["host"].get("zh", host) if previous else host},
        "location": previous.get("location") if previous else {"en": "See official program page", "zh": "请查看项目官网"},
        "duration": {"en": info["sessionLength"], "zh": info["sessionLength"]},
        "tuition": {"en": tuition, "zh": tuition},
        "deadline": {"en": info["applicationDeadline"], "zh": info["applicationDeadline"]},
        "website": website,
        "applicationUrl": application,
        "sourceUrl": source,
        "category": {"en": "Pre-college program", "zh": "大学预科项目"},
        "cover": previous.get("cover", "#0a3a2e") if previous else "#0a3a2e",
        "subject": {"en": study[0] if study else "Unknown", "zh": study[0] if study else "Unknown"},
        "logoDomain": logo,
        "catalogStatus": "official-source-listed",
        "overall": 0,
        "reviewCount": 0,
        "discovery": {"subjects": study, "methods": methods},
        "officialInfo": info,
        "source": {"officialUrl": source, "verified": bool(source.startswith("https://")), "checked": "2026-11-03", "notes": "Imported from the supplied public-listings workbook; confirm the current cycle on the linked official page."},
        "spreadsheetSource": {"officialUrl": source, "verified": bool(source.startswith("https://")), "checked": "2026-11-03"},
    })

assert len(records) == 161, f"Expected 161 public listing rows; got {len(records)}"
assert len({r['id'] for r in records}) == len(records)
assert len({r['publicListingId'] for r in records}) == len(records)
OUTPUT.write_text("window.SS_PROGRAM_CATALOG_TOP100 = " + json.dumps(records, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
print(f"Wrote {len(records)} public listings; reused {len(reused_ids)} existing IDs; grouped options remain separate data.")
