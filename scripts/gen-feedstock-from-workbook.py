import openpyxl, json, re, datetime, collections

SRC = r'C:\Users\muhdi\Downloads\e. Work Process Data Collection. xlsx (1) (1).xlsx'
wb = openpyxl.load_workbook(SRC, data_only=True)

def d(v):
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime('%Y-%m-%d')
    return None

def rows(sheet):
    ws = wb[sheet]
    for r in ws.iter_rows(min_row=8, values_only=True):
        bid = r[0]
        if not bid: continue
        bid = str(bid).strip()
        # skip footer notes / repeated headers / stray dates
        if len(bid) > 30 or bid.lower().startswith('batch id') or d(r[0]): continue
        if len(re.sub(r'[^A-Za-z0-9]', '', bid)) < 4: continue  # separators, dashes, stray marks
        yield bid, r

B = collections.defaultdict(lambda: {'stages': set()})

def touch(bid):
    b = B[bid]
    b.setdefault('batch_id', bid)
    return b

# 01 Receiving -> Feedstock Collection
for bid, r in rows('01_Preprocessing_Receiving'):
    b = touch(bid); b['stages'].add(0)
    b['date'] = d(r[1]); b['type'] = r[2]; b['origin'] = r[3]
    b['weight_kg'] = float(r[7]) if r[7] else None
    b['moisture'] = r[8]; b['storage'] = r[6]

# 02 Isolation / 03 Drying -> Pre-Processing
for bid, r in rows('02_Preprocessing_Isolation'):
    b = touch(bid); b['stages'].add(1)
    b.setdefault('date', d(r[2])); b.setdefault('type', r[3])
    b['good_kg'] = (b.get('good_kg') or 0) + (float(r[6]) if r[6] else 0)
for bid, r in rows('03_Preprocessing_Drying'):
    b = touch(bid); b['stages'].add(1)
    b.setdefault('date', d(r[1])); b.setdefault('type', r[2])
    if r[8]: b['dried_kg'] = (b.get('dried_kg') or 0) + float(r[8])

# 04 / 05 Production -> Material Conversion
def prod(sheet, biochar_col, tmax_col, hc_col, date_col=1, type_col=2, in_col=3):
    for bid, r in rows(sheet):
        b = touch(bid); b['stages'].add(2)
        b.setdefault('date', d(r[date_col])); b.setdefault('type', r[type_col])
        if isinstance(r[biochar_col], (int, float)):
            b['biochar_kg'] = (b.get('biochar_kg') or 0) + float(r[biochar_col])
        if isinstance(r[tmax_col], (int, float)):
            b['temp_c'] = max(b.get('temp_c') or 0, float(r[tmax_col]))
        if isinstance(r[hc_col], (int, float)):
            b['hc'] = float(r[hc_col]); b['stages'].add(3)   # H/C sampled -> Sampling
        if b.get('biochar_kg'): b['stages'].add(4)           # stored after production
prod('04_Biochar Production 0.5', 11, 6, 13)
prod('05_Biochar Production 1.0', 12, 7, 14)

# 06 Application
for bid, r in rows('06_Application'):
    b = touch(bid); b['stages'].add(5)
    b.setdefault('date', d(r[2]))
    if isinstance(r[3], (int, float)): b['applied_kg'] = float(r[3])
    b['application_type'] = r[4]

# 07 Carbon Sink
for bid, r in rows('07_Carbon_Sink'):
    b = touch(bid); b['stages'].add(6)
    b.setdefault('date', d(r[3]) or d(r[2]))
    if isinstance(r[4], (int, float)): b['sink_kg'] = float(r[4])
    b['sink_type'] = r[5]; b['sink_location'] = r[6]

STAGES = ["Feedstock Collection", "Feedstock Pre-Processing", "Material Conversion",
          "Sampling", "Storage", "Application", "Carbon Sink"]

def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

out = []
for bid, b in sorted(B.items()):
    stage = STAGES[max(b['stages'])]
    amount = b.get('weight_kg') or b.get('dried_kg') or b.get('good_kg') or b.get('sink_kg') or b.get('applied_kg') or b.get('biochar_kg')
    doc = {
        'Id': f'fs_{slug(bid)}',
        'Title': bid,
        'Type': (b.get('type') or 'Woodchip').strip(),
        'Date': b.get('date') or '',
        'Amount': f'{amount:g}' if amount else '',
        'Status': 'Verified' if 6 in b['stages'] else 'Pending',
        'Supplier': (b.get('origin') or 'Tigasfera Greentech').strip(),
        'CurrentStage': stage,
        'IsWaste': False,
        'IsPending': 6 not in b['stages'],
    }
    if b.get('biochar_kg'): doc['BiocharYieldKg'] = round(b['biochar_kg'], 2)
    if b.get('temp_c'): doc['PyrolysisTempC'] = b['temp_c']
    if b.get('hc'): doc['HCorgRatio'] = b['hc']
    out.append(doc)

lines = ["""-- ============================================================================
-- Custody batches (feedstock_sourcing) rebuilt from the source workbook
--   "e. Work Process Data Collection.xlsx"
--
-- One row per distinct Batch ID found across the 7 stage sheets. CurrentStage is
-- the furthest stage that batch appears in. Generated, do not hand-edit; regen
-- from the workbook instead.
--
-- This replaces the DATA only. No table, column, index, policy or app code is
-- touched, so the Feedstock page and the Workflow > Custody tab keep working
-- exactly as they do now -- they both read this one table via useFeedstock().
--
-- Step 2 deletes every existing row. Run inside the transaction and check the
-- step 4 count before you commit.
-- ============================================================================

begin;

-- 1. What is there now.
select data->>'CurrentStage' as stage, count(*), min(data->>'Title') as sample_title
from feedstock_sourcing group by 1 order by 2 desc;

-- 2. Drop the seeded batches. Table and schema stay; only rows go.
delete from feedstock_sourcing;

-- 3. Insert the workbook batches.
"""]
for doc in out:
    lines.append(
        "insert into feedstock_sourcing (id, data) values ('%s', '%s'::jsonb) "
        "on conflict (id) do update set data = excluded.data;"
        % (doc['Id'], json.dumps(doc).replace("'", "''"))
    )
lines.append("""
-- 4. Sanity check: should return %d rows.
select count(*) from feedstock_sourcing;

commit;
""" % len(out))

open(r'security/seed-feedstock-from-workbook.sql', 'w', encoding='utf-8').write('\n'.join(lines))

print('batches:', len(out))
print(collections.Counter(x['CurrentStage'] for x in out))
for x in out[:3] + out[-3:]: print(json.dumps(x))
