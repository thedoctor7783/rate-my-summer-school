#!/usr/bin/env python3
"""Build the static Search Programs expansion from a downloaded directory page.

The generated website catalog intentionally keeps only factual discovery fields:
program name, host, state, category, format, and the official program URL. It does
not copy editorial descriptions, infer deadlines/costs, or create student ratings.
"""

from __future__ import annotations

import argparse
import collections
import json
import re
from pathlib import Path


CATEGORY_META = {
    "academic": ("Pre-college & academic", "大学预科与学术", "#9bb6f5"),
    "stem": ("STEM", "STEM", "#67d7b9"),
    "research": ("Research internship", "科研实习", "#8eb7e8"),
    "health-medicine": ("Health & medicine", "健康与医学", "#ff9d8d"),
    "business": ("Business & entrepreneurship", "商业与创业", "#f3bd62"),
    "arts": ("Visual & performing arts", "视觉与表演艺术", "#e58bd8"),
    "music": ("Music", "音乐", "#b59be5"),
    "writing-debate": ("Writing, debate & journalism", "写作、辩论与新闻", "#7ec7d9"),
    "coding-tech": ("Coding & technology", "编程与科技", "#70c6a9"),
    "leadership": ("Leadership & civic", "领导力与公民参与", "#f08b72"),
    "language": ("Language & culture", "语言与文化", "#d9a46f"),
}

QUOTAS = {
    "academic": 75,
    "stem": 60,
    "research": 32,
    "health-medicine": 30,
    "business": 25,
    "arts": 25,
    "music": 22,
    "writing-debate": 22,
    "coding-tech": 14,
    "leadership": 14,
    "language": 1,
}

STATE_ZH = {
    "Alabama": "阿拉巴马州", "Alaska": "阿拉斯加州", "Arizona": "亚利桑那州",
    "Arkansas": "阿肯色州", "California": "加利福尼亚州", "Colorado": "科罗拉多州",
    "Connecticut": "康涅狄格州", "Delaware": "特拉华州", "Florida": "佛罗里达州",
    "Georgia": "佐治亚州", "Hawaii": "夏威夷州", "Idaho": "爱达荷州",
    "Illinois": "伊利诺伊州", "Indiana": "印第安纳州", "Iowa": "爱荷华州",
    "Kansas": "堪萨斯州", "Kentucky": "肯塔基州", "Louisiana": "路易斯安那州",
    "Maine": "缅因州", "Maryland": "马里兰州", "Massachusetts": "马萨诸塞州",
    "Michigan": "密歇根州", "Minnesota": "明尼苏达州", "Mississippi": "密西西比州",
    "Missouri": "密苏里州", "Montana": "蒙大拿州", "Nebraska": "内布拉斯加州",
    "Nevada": "内华达州", "New Hampshire": "新罕布什尔州", "New Jersey": "新泽西州",
    "New Mexico": "新墨西哥州", "New York": "纽约州", "North Carolina": "北卡罗来纳州",
    "North Dakota": "北达科他州", "Ohio": "俄亥俄州", "Oklahoma": "俄克拉何马州",
    "Oregon": "俄勒冈州", "Pennsylvania": "宾夕法尼亚州", "Rhode Island": "罗德岛州",
    "South Carolina": "南卡罗来纳州", "South Dakota": "南达科他州", "Tennessee": "田纳西州",
    "Texas": "得克萨斯州", "Utah": "犹他州", "Vermont": "佛蒙特州",
    "Virginia": "弗吉尼亚州", "Washington": "华盛顿州", "West Virginia": "西弗吉尼亚州",
    "Wisconsin": "威斯康星州", "Wyoming": "怀俄明州",
}

DIRECTORY_URL = "https://www.kidtocollege.com/summer-programs"

# Source rows that are alternate names for programs already represented in the
# original hand-curated catalog. Keep them out so the expansion count reflects
# distinct programs rather than aliases of the same offering.
EXCLUDED_SOURCE_IDS = {
    75,   # Stanford SIMR
    77,   # COSMOS
    80,   # Berkeley B-BAY
    156,  # Emory Pre-College
    209,  # UChicago Pre-College immersion
    228,  # Rose-Hulman Operation Catapult
    332,  # Johns Hopkins summer/pre-college umbrella
    333,  # Johns Hopkins Engineering Innovation
    394,  # Interlochen Arts Camp
    528,  # Princeton Summer Journalism Program
    557,  # Cornell Summer College
    561,  # Columbia Summer Immersion
    574,  # Duke Pre-College
}


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


def parse_directory_html(path: Path) -> list[dict]:
    html = path.read_text(encoding="utf-8")
    chunks: list[str] = []
    pattern = r'self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)</script>'
    for match in re.finditer(pattern, html):
        try:
            chunks.append(json.loads(match.group(1)))
        except json.JSONDecodeError:
            continue
    joined = "".join(chunks)
    start = joined.find('"results":[')
    end = joined.find(',"total":', start)
    if start < 0 or end < 0:
        raise RuntimeError("Could not find the directory results payload")
    return json.loads("{" + joined[start:end] + "}")["results"]


def existing_facts(data_js: Path) -> tuple[set[str], set[str]]:
    source = data_js.read_text(encoding="utf-8")
    programs = source[source.find("const PROGRAMS = ["):source.find("const PROGRAM_DETAILS = {")]
    names = {normalize(value) for value in re.findall(r"name:\s*\{\s*en:\s*'([^']+)'", programs)}
    urls = {value.rstrip("/") for value in re.findall(r"website:\s*'([^']+)'", programs)}
    return names, urls


def balanced_by_state(rows: list[dict]) -> list[dict]:
    buckets: dict[str, list[dict]] = collections.defaultdict(list)
    for row in sorted(rows, key=lambda item: (item["state"], item["institution"], item["program_name"])):
        buckets[row["state"]].append(row)
    result: list[dict] = []
    states = sorted(buckets)
    while states:
        next_states: list[str] = []
        for state in states:
            result.append(buckets[state].pop(0))
            if buckets[state]:
                next_states.append(state)
        states = next_states
    return result


def select_rows(rows: list[dict], existing_names: set[str], existing_urls: set[str], count: int) -> list[dict]:
    candidates: list[dict] = []
    seen_names = set(existing_names)
    seen_urls = set(existing_urls)
    for row in rows:
        if row.get("id") in EXCLUDED_SOURCE_IDS:
            continue
        name_key = normalize(row.get("program_name", ""))
        source_url = (row.get("source_url") or "").rstrip("/")
        if row.get("status") != "active" or row.get("confidence") != "high":
            continue
        if row.get("category") not in CATEGORY_META or not source_url.startswith(("https://", "http://")):
            continue
        if name_key in seen_names or source_url in seen_urls:
            continue
        if "undergraduate" in (row.get("audience") or "").lower() and "high school" not in (row.get("audience") or "").lower():
            continue
        seen_names.add(name_key)
        seen_urls.add(source_url)
        candidates.append(row)

    grouped: dict[str, list[dict]] = collections.defaultdict(list)
    for row in candidates:
        grouped[row["category"]].append(row)
    for category in grouped:
        grouped[category] = balanced_by_state(grouped[category])

    selected: list[dict] = []
    selected_ids: set[int] = set()
    for category, quota in QUOTAS.items():
        for row in grouped.get(category, [])[:quota]:
            selected.append(row)
            selected_ids.add(row["id"])

    if len(selected) < count:
        remainder = balanced_by_state([row for row in candidates if row["id"] not in selected_ids])
        selected.extend(remainder[: count - len(selected)])
    if len(selected) < count:
        raise RuntimeError(f"Only {len(selected)} eligible unique listings were available")
    return sorted(selected[:count], key=lambda row: (row["institution"], row["program_name"]))


def js_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def compact_program(row: dict) -> dict:
    label_en, label_zh, color = CATEGORY_META[row["category"]]
    state = row["state"]
    host = row["institution"].strip()
    name = row["program_name"].strip()
    free = (row.get("cost_angle") or "").lstrip().lower().startswith("free")
    format_label = (row.get("format") or "").strip()
    format_en = format_label[:1].upper() + format_label[1:] if format_label else "See official page"
    return {
        "id": f"ktc-{row['id']}",
        "name": {"en": name, "zh": name},
        "host": {"en": host, "zh": host},
        "location": {"en": state, "zh": STATE_ZH.get(state, state)},
        "duration": {"en": "See official page", "zh": "请查看官网"},
        "tuition": {"en": "Free / funded" if free else "See official page", "zh": "免费 / 资助" if free else "请查看官网"},
        "deadline": {"en": "See official page", "zh": "请查看官网"},
        "website": row["source_url"],
        "category": {"en": label_en, "zh": label_zh},
        "cover": color,
        "subject": {"en": label_en, "zh": label_zh},
        "format": {"en": format_en, "zh": format_en},
        "subScores": {},
        "overall": 0,
        "reviewCount": 0,
        "acceptance": "Not published",
        "tagline": {
            "en": f"A {label_en.lower()} summer opportunity hosted by {host}. Check the official page for current dates, eligibility, and cost.",
            "zh": f"由 {host} 主办的{label_zh}暑期项目。最新日期、申请资格与费用请以官网为准。",
        },
        "catalogStatus": "official-source-listed",
        "source": {
            "directory": "KidToCollege",
            "directoryUrl": DIRECTORY_URL,
            "officialUrl": row["source_url"],
            "retrieved": "2026-10-11",
            "confidence": "high",
        },
    }


def write_js(programs: list[dict], path: Path) -> None:
    lines = [
        "/* Generated discovery listings. Rebuild with scripts/build_catalog_expansion.py.",
        " * Core facts come from a public nationwide directory and each record links to",
        " * the official program page. No ratings, reviews, deadlines, or prices are invented. */",
        "window.SS_PROGRAM_CATALOG_EXPANSION = [",
    ]
    for program in programs:
        lines.append("  " + json.dumps(program, ensure_ascii=False, separators=(",", ":")) + ",")
    lines.append("];\n")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("html", type=Path, help="Downloaded KidToCollege summer-program directory HTML")
    parser.add_argument("--count", type=int, default=320)
    parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()

    existing_names, existing_urls = existing_facts(args.project / "assets/js/data.js")
    selected = select_rows(parse_directory_html(args.html), existing_names, existing_urls, args.count)
    programs = [compact_program(row) for row in selected]
    write_js(programs, args.project / "assets/js/program-catalog.js")
    source_rows = [{
        "id": row["id"], "institution": row["institution"], "program_name": row["program_name"],
        "category": row["category"], "state": row["state"], "format": row.get("format", ""),
        "official_url": row["source_url"], "directory_url": DIRECTORY_URL,
        "retrieved": "2026-10-11", "confidence": row["confidence"],
    } for row in selected]
    (args.project / "data/program-catalog-expansion.json").write_text(
        json.dumps(source_rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Generated {len(programs)} programs")
    print("Categories:", dict(sorted(collections.Counter(row["category"] for row in selected).items())))
    print("States:", len({row["state"] for row in selected}))


if __name__ == "__main__":
    main()
