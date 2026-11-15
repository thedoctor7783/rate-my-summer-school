#!/usr/bin/env python3
"""Download local school-logo assets for the supplied spreadsheet catalog."""

from __future__ import annotations

import json
import io
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
AUDIT_PATH = ROOT / "data" / "program-catalog-expansion.json"
OUTPUT_DIR = ROOT / "assets" / "images" / "school-logos"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"


def filename_for(domain: str) -> str:
    return re.sub(r"[^a-z0-9.-]+", "-", domain.lower()).strip("-") + ".png"


def fetch(domain: str) -> dict[str, object]:
    target = OUTPUT_DIR / filename_for(domain)
    if target.exists() and target.stat().st_size >= 100:
        return {
            "domain": domain,
            "file": target.relative_to(ROOT).as_posix(),
            "bytes": target.stat().st_size,
            "ok": True,
            "source": "existing",
        }
    urls = [
        "https://www.google.com/s2/favicons?domain_url=" + quote(
            f"https://{domain}", safe=""
        ) + "&sz=256",
        f"https://unavatar.io/{quote(domain, safe='')}?fallback=false",
    ]
    last_error = ""
    for url in urls:
        for attempt in range(2):
            try:
                request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urlopen(request, timeout=25) as response:
                    payload = response.read()
                if len(payload) < 100:
                    raise ValueError(f"image response too small ({len(payload)} bytes)")
                with Image.open(io.BytesIO(payload)) as image:
                    if getattr(image, "n_frames", 1) > 1:
                        image.seek(image.n_frames - 1)
                    converted = image.convert("RGBA")
                    converted.save(target, format="PNG")
                return {
                    "domain": domain,
                    "file": target.relative_to(ROOT).as_posix(),
                    "bytes": target.stat().st_size,
                    "ok": True,
                    "source": url.split("/")[2],
                }
            except Exception as exc:  # pragma: no cover - network-dependent
                last_error = str(exc)
                time.sleep(0.5 * (attempt + 1))
    return {"domain": domain, "file": "", "bytes": 0, "ok": False, "error": last_error}


def main() -> None:
    entries = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))
    domains = sorted({entry["logo_domain"] for entry in entries if entry.get("logo_domain")})
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, object]] = []
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(fetch, domain): domain for domain in domains}
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            state = "ok" if result["ok"] else "FAILED"
            print(f"{state:6} {result['domain']}")
    results.sort(key=lambda item: str(item["domain"]))
    MANIFEST_PATH.write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    failures = [result for result in results if not result["ok"]]
    print(json.dumps({"domains": len(domains), "downloaded": len(results) - len(failures), "failed": failures}, ensure_ascii=False))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
