"""Download the Solaris Archives community "Wuthering Waves Lore Dataset" (public Notion site,
robots.txt: Allow /) into scripts/raw/notion_entries.json, using the same endpoints the page uses."""
import json, os, sys, time, urllib.request

BASE = "https://wutheringwaves.notion.site/api/v3/"
UA = "WuwaLore/0.1 (fan project; lore graph)"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw", "notion_entries.json")
CONCEPTS_PAGE = "e4739118-3c76-4c2d-b715-bd999f942685"   # "Lore - All Concepts"
ENTRIES = "dab9ccd9-727a-4a9d-adb3-e5084cdc47a4"         # "Lore Entries Dataset" collection


def post(ep, body):
    for attempt in range(5):
        try:
            req = urllib.request.Request(BASE + ep, data=json.dumps(body).encode(), method="POST",
                                         headers={"content-type": "application/json", "user-agent": UA})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except Exception as e:
            print("retry", attempt, e, file=sys.stderr); time.sleep(2 + attempt * 3)
    raise RuntimeError(ep)


unwrap = lambda v: (v or {}).get("value", {}).get("value") or (v or {}).get("value")

if os.path.exists(OUT) and "--force" not in sys.argv:
    print("cached", file=sys.stderr); sys.exit()

page = post("loadCachedPageChunkV2", {"page": {"id": CONCEPTS_PAGE}, "limit": 100, "cursor": {"stack": []}, "verticalColumns": False})
blocks = page["recordMap"]["block"]
space = unwrap(next(iter(blocks.values())))["space_id"]
view = next(unwrap(b)["view_ids"][0] for b in blocks.values()
            if unwrap(b).get("type", "").startswith("collection_view") and unwrap(b).get("collection_id") == ENTRIES)
schema = unwrap(page["recordMap"]["collection"][ENTRIES])["schema"]

names = {k: v["name"] for k, v in schema.items()}
prop_id = {v["name"]: k for k, v in schema.items()}


def query(filter_=None, sort=None):
    loader = {"type": "reducer", "reducers": {"collection_group_results": {"type": "results", "limit": 20000}},
              "searchQuery": "", "userTimeZone": "UTC"}
    if filter_: loader["filter"] = filter_
    if sort: loader["sort"] = sort
    r = post("queryCollection?src=initial_load", {"source": {"type": "collection", "id": ENTRIES, "spaceId": space},
                                                    "collectionView": {"id": view, "spaceId": space}, "loader": loader})
    ids = r["result"]["reducerResults"]["collection_group_results"]["blockIds"]
    return ids, {i: unwrap(b) for i, b in r.get("recordMap", {}).get("block", {}).items()}


# The public query returns full rows for at most 1000 results, so ask for one entry Type at a time
# (the same filter the page offers) and fall back to two opposite sort orders for anything left.
all_ids, rows = query()
types = schema[prop_id["Type"]].get("options", [])
for opt in types:
    ids, got = query({"operator": "and", "filters": [{"property": prop_id["Type"],
                      "filter": {"operator": "enum_contains", "value": {"type": "exact", "value": opt["value"]}}}]})
    rows.update(got)
    print(f"  type {opt['value']!r}: {len(ids)} rows, {len(got)} with data", file=sys.stderr)
    time.sleep(0.5)
for direction in ("ascending", "descending"):
    if len([i for i in all_ids if i in rows]) == len(all_ids): break
    _, got = query(sort=[{"property": "title", "direction": direction}])
    rows.update(got)
missing = [i for i in all_ids if i not in rows]
print(f"{len(all_ids)} entries, {len(missing)} not retrievable", file=sys.stderr)
ids = all_ids

def plain(prop):
    return "".join(seg[0] for seg in prop or [] if isinstance(seg, list) and seg and isinstance(seg[0], str))


entries = []
for i in ids:
    v = rows.get(i)
    if not v or not v.get("properties"): continue
    p = {names.get(k, k): plain(val) for k, val in v["properties"].items()}
    entries.append(dict(id=i, url="https://wutheringwaves.notion.site/" + i.replace("-", ""), **p))
json.dump(dict(schema=sorted(names.values()), entries=entries), open(OUT, "w"), ensure_ascii=False)
print(len(entries), "entries saved", file=sys.stderr)
