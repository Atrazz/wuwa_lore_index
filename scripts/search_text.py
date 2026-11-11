"""Collect bounded, resumable searches through Yakitahome's visible browser UI.

Requires Python Playwright and an installed Chromium. For example:
  python scripts/search_text.py --browser /path/to/chrome
Cached results are private build inputs; import_text_search.py selects lore passages.
No internal search APIs, cookies, or authentication are used.
"""
import argparse
import datetime
import json
from pathlib import Path
import re
import time

ROOT = Path(__file__).resolve().parent.parent
URL = "https://mc.yakitahome.com/search"
EXTRACT = """rows => rows.map(row => {
  const cells = [...row.querySelectorAll('td.col-lang')];
  const headings = [...document.querySelectorAll('#resultsHeadRow th.col-lang')].map(el=>el.textContent.trim());
  const en = headings.indexOf('English');
  const zh = headings.indexOf('简体中文');
  const ref = row.querySelector('button.context-link');
  const slot = row.querySelector('[data-story-text-key]');
  const story = row.querySelector('[data-story-id]');
  return {text: cells[en]?.querySelector('.result-body-text')?.getAttribute('data-raw') || '',
    zh: cells[zh]?.querySelector('.result-body-text')?.getAttribute('data-raw') || '',
    tags: [...(cells[0]?.querySelectorAll('.ctx-meta-tag:not(button)') || [])].map(x=>x.textContent.trim()),
    textKey: slot?.dataset.storyTextKey || '', file: ref?.dataset.f || '',
    anchor: ref?.dataset.id || '', story: story?.dataset.storyId || ''};
})"""


def collect(args):
    from playwright.sync_api import sync_playwright
    path = ROOT / "scripts/raw/text_searcher.json"
    data = json.loads(path.read_text()) if path.exists() else {"source": URL, "searches": []}
    catalog = json.loads((ROOT / "src/data/lore.json").read_text())
    queries = []
    for n in sorted(catalog["nodes"], key=lambda n: n["id"]):
        if n["kind"] not in ("character", "unique_npc", "npc", "place") or n.get("textSearcherNPC"):
            continue
        if args.only and n["id"] not in args.only:
            continue
        term = (n.get('zh') or n['id']) if args.language == 'zh' else n['id']
        queries.append((n["id"], term, ""))
        if n["kind"] in ("character", "unique_npc", "npc"):
            queries.append((n["id"], term, "生态"))
    done = {(q["query"], q["chapterFilter"], q.get('language', 'en')) for q in data["searches"] if not q.get("error") and (q.get("total") or q.get("header")) and (not args.title_context or q.get('titleContextsChecked'))}
    with sync_playwright() as p:
        options = {"headless": True}
        if args.browser:
            options["executable_path"] = args.browser
        browser = p.chromium.launch(**options)
        page = browser.new_page()
        page.goto(URL, wait_until="networkidle", timeout=60000)
        frame = next(f for f in page.frames if "embedded=1" in f.url)
        if frame.locator("#announcementConfirmBtn").is_visible():
            frame.locator("#announcementConfirmBtn").click()
        frame.locator("#searchLang").select_option(label="简体中文" if args.language == 'zh' else "English")
        frame.locator("#displayLangToggle").click()
        frame.get_by_role("button", name="English", exact=True).click()
        frame.locator("#displayLangToggle").click()
        data["retrieved"] = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
        data["version"] = frame.locator("body").inner_text().split("数据版本：", 1)[-1].splitlines()[0].strip()
        for i, (query, term, chapter) in enumerate(queries, 1):
            if (query, chapter, args.language) in done and not args.refresh:
                continue
            record = {"query": query, "searchTerm": term, "language": args.language, "chapterFilter": chapter}
            try:
                frame.locator("#searchInput").fill(term)
                frame.locator("#stateKeyInput").fill(chapter)
                frame.locator("#searchBtn").click()
                # Wait for the site's actual search state, including zero-result searches.
                frame.wait_for_function("() => diffLoadState.search.query === document.getElementById('searchInput').value.trim() && diffLoadState.search.stateKeyQuery === document.getElementById('stateKeyInput').value.trim() && !diffLoadState.search.loading && lastResultMode === 'search'", timeout=45000)
                header = frame.locator("#resultsHeader").inner_text()
                if not re.search(r"找到\s*\d+\s*条结果", header):
                    raise RuntimeError(f"Website did not return results: {header}")
                record["header"] = header
                rows = frame.locator("#resultsBody tr").evaluate_all(EXTRACT)
                total = frame.evaluate("diffLoadState.search.total")
                while len(rows) < min(total, args.limit):
                    previous = len(rows)
                    frame.locator("#resultsBody tr").last.scroll_into_view_if_needed()
                    # Normal scrolling triggers the same pagination as a reader.
                    frame.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    try:
                        frame.wait_for_function("n => document.querySelectorAll('#resultsBody tr').length > n && !diffLoadState.search.loading", arg=previous, timeout=15000)
                    except Exception:
                        break
                    rows = frame.locator("#resultsBody tr").evaluate_all(EXTRACT)
                record.update(total=total, rows=rows[:args.limit], truncated=total > min(len(rows), args.limit))
                if args.title_context:
                    record['contextRows'] = []
                    for row in record['rows']:
                        if not re.fullmatch(r'LoadingTipsText_\w+_Title', row['textKey']):
                            continue
                        ref = frame.locator(f'#resultsBody button.context-link[data-id="{row["anchor"]}"]')
                        ref.click()
                        frame.wait_for_function('key => currentContext?.lastData?.current?.id === key', arg=row['textKey'], timeout=30000)
                        context = frame.evaluate('currentContext.lastData')
                        wanted = row['textKey'].removesuffix('_Title') + '_TipsText'
                        for entry in context.get('before', []) + context.get('after', []):
                            if entry['id'] != wanted:
                                continue
                            record['contextRows'].append(dict(text=entry['c'].get('en', ''), zh=entry['c'].get('zh-Hans', ''),
                                tags=[entry.get('versionTag', {}).get('firstSeen', '')], textKey=entry['id'],
                                file=str(entry['f']), anchor=str(entry.get('anchorId', entry['p'])), story='',
                                title=row['text'], titleKey=row['textKey'], contextFor=query))
                        frame.locator('#contextClose').click()
                    record['titleContextsChecked'] = True
                print(f"{i}/{len(queries)} {query} [{chapter or 'all'}]: {len(record['rows'])}/{total}", flush=True)
            except Exception as e:
                record["error"] = str(e)[:200]
                print(f"{query}: {record['error']}", flush=True)
            data["searches"] = [s for s in data["searches"] if (s["query"], s["chapterFilter"], s.get('language', 'en')) != (query, chapter, args.language)]
            data["searches"].append(record)
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(".tmp")
            temporary.write_text(json.dumps(data, ensure_ascii=False))
            temporary.replace(path)
            time.sleep(2 if not record.get("error") else 20)
        browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--browser", help="Installed Chromium executable")
    parser.add_argument("--limit", type=int, default=100, help="Maximum rows per search (coverage is recorded)")
    parser.add_argument("--only", nargs="+", help="Search only these existing entry names")
    parser.add_argument("--language", choices=['en', 'zh'], default='en', help="Search by English or the entry's Chinese name")
    parser.add_argument("--title-context", action='store_true', help="Also open loading-tip headings and retain their matching body text")
    parser.add_argument("--refresh", action="store_true")
    collect(parser.parse_args())
