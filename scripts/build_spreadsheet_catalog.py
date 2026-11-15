#!/usr/bin/env python3
"""Build the website catalog from the supplied 200-program workbook.

Rows already represented in the original 100 are merged into those records;
the remaining rows become new listings. Provisional spreadsheet values remain
explicitly provisional, and organizer domains are used only for logos and
school-homepage fallbacks when no official program URL is supplied.
"""

from __future__ import annotations

import argparse
import collections
import difflib
import json
import re
from pathlib import Path
from urllib.parse import urlparse

import openpyxl


CATEGORY_META = {
    "academic": ("Pre-college & academic", "大学预科与学术", "#9bb6f5"),
    "stem": ("STEM", "STEM", "#67d7b9"),
    "research": ("Research internship", "科研实习", "#8eb7e8"),
    "health": ("Health & medicine", "健康与医学", "#ff9d8d"),
    "business": ("Business & entrepreneurship", "商业与创业", "#f3bd62"),
    "arts": ("Visual & performing arts", "视觉与表演艺术", "#e58bd8"),
    "writing": ("Writing, debate & journalism", "写作、辩论与新闻", "#7ec7d9"),
    "leadership": ("Leadership & civic", "领导力与公民参与", "#f08b72"),
}

# Spreadsheet rows that correspond to a richer record in the original 100.
# They update that record's source metadata rather than creating a duplicate.
EXISTING_BY_ROW = {
    1: "yygs", 4: "uchicago-pre", 5: "columbia-immersion", 6: "brown-pre",
    7: "cornell-summer", 8: "upenn-summer", 11: "duke-pre", 12: "jhu-cty",
    13: "northwestern-pre", 14: "georgetown-pre", 15: "nyu-pre", 16: "bu-summer",
    17: "tufts-pre", 18: "emory-pre", 19: "rice-pre", 23: "urochester-pre",
    24: "ucla-pre", 26: "ucdavis-pre", 27: "ucirvine-pre", 28: "ucsd-pre",
    29: "ucsb-pre", 31: "usc-pre", 32: "cmu-pre", 34: "umich-pre",
    35: "uva-pre", 40: "gatech-pre", 41: "princeton-sjp", 42: "stanford-ssi",
    43: "harvard-ssp", 47: "uiuc-pre", 48: "purdue-pre", 53: "syracuse-pre",
    71: "wpi-pre", 72: "rpi-pre", 73: "stevens-pre", 75: "drexel-pre",
    76: "lehigh-pre", 78: "rose-hulman-pre", 79: "michigan-tech-pre",
    80: "iowa-yws", 82: "iu-pre", 85: "ut-austin-pre", 154: "barnard-pre",
    159: "smith-pre", 161: "rsi", 162: "simons-research", 163: "clark-scholars",
    165: "simr", 166: "smysp", 168: "ssp", 169: "promys", 172: "hcssim",
    173: "mathily", 179: "tass",
}

MANUAL_DOMAINS = {
    "AwesomeMath (independent)": "awesomemath.org",
    "Bank of America / partner nonprofits": "bankofamerica.com",
    "Boston University (host) / PROMYS": "bu.edu",
    "Cambridge Centre for International Research (independent)": "cambridge-research.org",
    "Canada/USA Mathcamp (independent; rotating host campus)": "mathcamp.org",
    "Center for Excellence in Education / MIT (host)": "cee.org",
    "Foundation for Teaching Economics (FTE)": "fte.org",
    "Immerse Education (independent)": "immerse.education",
    "Kenyon College / Kenyon Review": "kenyon.edu",
    "King's College London": "kcl.ac.uk",
    "LaunchX (independent)": "launchx.com",
    "Leangap (independent)": "leangap.org",
    "Marist University": "marist.edu",
    "MathILy / Bryn Mawr College (2026 host)": "brynmawr.edu",
    "Miami University (Ohio)": "miamioh.edu",
    "Northwestern University / Medill": "northwestern.edu",
    "Oxford Royale (independent)": "oxford-royale.com",
    "Oxford Scholastica Academy (independent)": "oxfordscholastica.com",
    "Ohio State University": "osu.edu",
    "Reach Cambridge (independent)": "reachcambridge.com",
    "Ross Mathematics Program (independent; host colleges)": "rossprogram.org",
    "SSP International (independent; multiple host campuses)": "ssp.org",
    "Stony Brook University": "stonybrook.edu",
    "Telluride Association (independent)": "tellurideassociation.org",
    "The Adroit Journal (independent)": "theadroitjournal.org",
    "The School of The New York Times (independent)": "nytimes.com",
    "University of Iowa / International Writing Program": "uiowa.edu",
    "Johns Hopkins University": "jhu.edu",
    "Hong Kong University of Science and Technology": "hkust.edu.hk",
    "University of Massachusetts Amherst / Juniper": "umass.edu",
    "University of Maryland": "umd.edu",
    "University of Michigan": "umich.edu",
    "University of Pennsylvania (Wharton)": "upenn.edu",
    "University of Virginia": "virginia.edu",
    "University of Richmond": "richmond.edu",
    "Quinnipiac University": "qu.edu",
    "Elon University": "elon.edu",
    "Virginia Polytechnic Institute and State University": "vt.edu",
    "William & Mary": "wm.edu",
}


def normalize(value: str) -> str:
    value = value.replace("–", "-").replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def hostname(url: str | None) -> str:
    if not url:
        return ""
    host = urlparse(url).hostname or ""
    return host.removeprefix("www.")


def primary_host(host: str) -> str:
    value = host.split("/")[0].strip()
    value = re.sub(r"\s*\([^)]*\)\s*", " ", value).strip()
    return value


def load_domains(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


def best_domain(host: str, source_url: str | None, universities: list[dict]) -> tuple[str, str]:
    if host in MANUAL_DOMAINS:
        return MANUAL_DOMAINS[host], "manual-organizer-map"

    target = normalize(primary_host(host))
    exact = [item for item in universities if normalize(item.get("name", "")) == target]
    if exact and exact[0].get("domains"):
        return exact[0]["domains"][0], "university-domain-list-exact"

    scored = []
    for item in universities:
        name = normalize(item.get("name", ""))
        if not name or not item.get("domains"):
            continue
        score = difflib.SequenceMatcher(None, target, name).ratio()
        scored.append((score, item))
    score, item = max(scored, key=lambda pair: pair[0])
    if score >= 0.87:
        return item["domains"][0], f"university-domain-list-fuzzy-{score:.2f}"
    source_domain = hostname(source_url)
    if source_domain:
        return source_domain, "official-program-url-fallback"
    return "", "unmatched"


def infer_category(name: str) -> str:
    lower = name.lower()
    tests = [
        ("research", ("research", "science program", "hshsp", "rsi", "simons", "clark scholars")),
        ("writing", ("writer", "writing", "journal", "medill", "new york times")),
        ("business", ("business", "wharton", "economics", "launchx", "leangap", "student leaders")),
        ("health", ("medical", "medicine", "biomedical", "health")),
        ("arts", ("art", "music", "theatre", "design")),
        ("leadership", ("leadership", "telluride")),
        ("stem", ("engineering", "math", "science", "technology", "stem", "mites", "promys", "mathily")),
    ]
    for category, words in tests:
        if any(word in lower for word in words):
            return category
    return "academic"


def localized(value, fallback_en: str, fallback_zh: str) -> dict:
    text = str(value).strip() if value not in (None, "") else ""
    if not text:
        return {"en": fallback_en, "zh": fallback_zh}
    en = text.replace("待官网核实", "Check official source").replace("未核实", "not yet verified")
    return {"en": en, "zh": text}


def build_program(row: tuple, universities: list[dict], original: dict) -> tuple[dict, dict]:
    index, name, host, length, location, tuition, fee_year, verification, source_url, notes = row
    index = int(index)
    source_url = str(source_url).strip() if source_url else ""
    verified = str(verification).startswith("官方")
    paused = index == 179
    domain, domain_source = best_domain(str(host), source_url, universities)
    existing_id = EXISTING_BY_ROW.get(index, "")
    if existing_id and not domain:
        domain = original["domains"].get(existing_id, "")
        domain_source = "original-catalog"
    website = source_url or (f"https://{domain}" if domain else "")
    category = infer_category(str(name))
    category_en, category_zh, color = CATEGORY_META[category]
    status = "paused" if paused else ("official-source-listed" if verified else "spreadsheet-provisional")
    program = {
        "id": f"sheet-{index:03d}",
        "existingId": existing_id,
        "name": {"en": str(name), "zh": str(name)},
        "host": {"en": str(host), "zh": str(host)},
        "location": localized(location, "Check source", "请核实"),
        "duration": localized(length, "Check source", "请核实"),
        "tuition": localized(tuition, "Check source", "请核实"),
        "deadline": {"en": "Check official source", "zh": "请查看官网"},
        "website": website,
        "logoDomain": domain,
        "category": {"en": category_en, "zh": category_zh},
        "cover": color,
        "subject": {"en": category_en, "zh": category_zh},
        "format": {"en": "See source", "zh": "请查看来源"},
        "subScores": {},
        "overall": 0,
        "reviewCount": 0,
        "acceptance": "Not published",
        "tagline": {
            "en": ("This program is paused for 2027. " if paused else "") + ("Details are linked to an official program source." if verified else "This directory entry is provisional and still needs official verification."),
            "zh": ("该项目 2027 年暂停。" if paused else "") + ("该条目信息已链接至官方项目来源。" if verified else "该目录条目仍为暂定信息，需要进一步官网核实。"),
        },
        "catalogStatus": status,
        "source": {
            "directory": "summer_programs_200_directory_2026_2027.xlsx",
            "spreadsheetRow": index + 3,
            "officialUrl": source_url,
            "schoolUrl": f"https://{domain}" if domain else "",
            "verified": verified,
            "verification": str(verification or ""),
            "feeYear": str(fee_year or ""),
            "notes": str(notes or ""),
            "checked": "2026-10-11",
        },
    }
    audit = {
        "index": index, "program_name": name, "organizer": host,
        "existing_id": existing_id or None, "status": status,
        "official_source_url": source_url or None, "logo_domain": domain or None,
        "logo_domain_source": domain_source, "verification": verification,
    }
    return program, audit


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--domain-list", type=Path, default=Path("/tmp/world-universities.json"))
    parser.add_argument("--original", type=Path, default=Path("/tmp/original-programs.json"))
    args = parser.parse_args()

    workbook = openpyxl.load_workbook(args.workbook, read_only=True, data_only=True)
    sheet = workbook["Summer Programs (200)"]
    rows = [row for row in sheet.iter_rows(min_row=4, values_only=True) if row[1]]
    universities = load_domains(args.domain_list)
    original = json.loads(args.original.read_text(encoding="utf-8"))
    original_ids = {program["id"] for program in original["programs"]}
    missing_ids = sorted(set(EXISTING_BY_ROW.values()) - original_ids)
    if missing_ids:
        raise RuntimeError(f"Unknown existing ids: {missing_ids}")

    built = [build_program(row, universities, original) for row in rows]
    programs = [item[0] for item in built]
    audit = [item[1] for item in built]
    if len(programs) != 200:
        raise RuntimeError(f"Expected 200 spreadsheet rows, found {len(programs)}")
    missing_domains = [item for item in audit if not item["logo_domain"]]
    if missing_domains:
        names = ", ".join(item["organizer"] for item in missing_domains)
        raise RuntimeError(f"Missing logo domains for {len(missing_domains)} organizers: {names}")

    js_lines = [
        "/* Generated from the user-supplied 200-program workbook.",
        " * Provisional rows remain labelled and do not receive invented reviews. */",
        "window.SS_PROGRAM_CATALOG_EXPANSION = [",
    ]
    js_lines.extend("  " + json.dumps(program, ensure_ascii=False, separators=(",", ":")) + "," for program in programs)
    js_lines.append("];\n")
    (args.project / "assets/js/program-catalog.js").write_text("\n".join(js_lines), encoding="utf-8")
    (args.project / "data/program-catalog-expansion.json").write_text(
        json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"Workbook rows: {len(programs)}")
    print(f"Merged into original records: {sum(bool(program['existingId']) for program in programs)}")
    print(f"New cards: {sum(not program['existingId'] for program in programs)}")
    print(f"Final catalog size: {len(original['programs']) + sum(not program['existingId'] for program in programs)}")
    print("Statuses:", dict(collections.Counter(program["catalogStatus"] for program in programs)))
    print("Logo domains:", len({program["logoDomain"] for program in programs}))


if __name__ == "__main__":
    main()
