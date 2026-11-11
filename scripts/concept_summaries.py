"""Source-based descriptions for concepts without a wiki introduction."""
import re

from text_evidence import name_pattern, plain


def summary_candidates(node):
    pattern = name_pattern(node['id'])
    candidates = []
    for record in node.get('textEvidence', []):
        parts = re.split(r'(?<=[.!?])\s+|\n\s*\n', plain(record['text']))
        matches = [(i, s) for i, s in enumerate(parts) if pattern.search(s) and s.strip() not in {'[…]', '…'}]
        if not matches and record.get('contextFor') == node['id']:
            matches = [(i, s) for i, s in enumerate(parts) if len(s.split()) >= 7 and s.strip() != '[…]']
        for index, sentence in matches:
            if len(sentence.split()) < 5:
                continue
            sentence = sentence.strip()
            match = pattern.search(sentence)
            after = sentence[match.end():] if match else ''
            defining = bool(re.match(r'\s*[,—-]?\s+(?:is|are|was|were|refers? to|means?|allows?|enables?|serves?|represents?|consists?|uses?|can|has|have)\b', after, re.I))
            term_entry = bool(re.match(r'Term\d+_Desc$', record['textKey']))
            direct_title = record.get('contextFor') == node['id'] or record.get('title', '').casefold() == node['id'].casefold()
            rank = (sentence.endswith('?'), not term_entry, not direct_title, not defining,
                    record['kind'] in {'World dialogue', 'Dialogue', 'Voice line'}, len(sentence) > 500,
                    len(record.get('entities', [])), abs(len(sentence) - 220), record['id'], index)
            candidates.append((rank, record, sentence))
    return sorted(candidates, key=lambda c: c[0])


def citation(record):
    return {key: record.get(key, '') for key in ('id', 'source', 'url', 'textKey', 'title', 'speaker', 'kind')}


def add_concept_summaries(nodes, reviewed=None):
    reviewed = reviewed or {}
    used = set()
    for node in nodes:
        records = node.get('textEvidence', [])
        by_key = {r['textKey']: r for r in records}
        # Descriptions already reviewed for new places also keep their attribution.
        if node.get('summarySource') == 'Game text' and node.get('sourceTextKeys'):
            source = next((by_key[k] for k in node['sourceTextKeys'] if k in by_key), None)
            if source:
                node['summaryCitation'] = citation(source)
        if node['id'] in reviewed and node.get('summary'):
            used.add(node['id'])
        if (node['kind'] != 'concept' and node['id'] not in reviewed) or node.get('summary') or not records:
            continue
        if node['id'] in reviewed:
            review = reviewed[node['id']]
            if not review['textKeys'] or not set(review['textKeys']) <= set(by_key):
                raise ValueError(f"Missing source for concept summary: {node['id']}")
            node.update(summary=review['summary'], summaryMode='reviewed', summarySource='Game text',
                        summaryCitation=citation(by_key[review['textKeys'][0]]), summaryTextKeys=review['textKeys'])
            used.add(node['id'])
            continue
        candidates = summary_candidates(node)
        if candidates:
            _, record, text = candidates[0]
        else:
            # A Chinese match or a title can identify an entry without its English
            # name appearing verbatim. Retain the attributed context in that case.
            record = min(records, key=lambda r: (len(r.get('entities', [])), len(r['text']), r['id']))
            text = re.sub(r'\s+', ' ', record['text']).strip('… ')
        if len(text) > 520:
            text = text[:510].rsplit(' ', 1)[0].rstrip(',;:') + '…'
        who = record.get('speaker')
        attribution = f'{who} says' if who and record['kind'] in {'World dialogue', 'Dialogue', 'Voice line'} else f"The {record['kind'].lower()} states"
        node.update(summary=f'{attribution}: “{text}”', summaryMode='excerpt', summarySource='Game text',
                    summaryCitation=citation(record), summaryTextKeys=[record['textKey']])
    if set(reviewed) - used:
        raise ValueError(f"Concept summary has no eligible entry: {sorted(set(reviewed) - used)}")
