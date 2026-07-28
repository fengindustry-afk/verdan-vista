# Work Process — biochar traceability note

Dated 2026-07-27. Covers the "feedstock collection to application" linkage gap
and the 5,965 kg mass-balance error it produced.

## The linkage gap

Batch identity survives from Feedstock Collection through Production and then
dies. Four ID namespaces exist and never meet:

| Stage | ID scheme in `batch_id` |
|---|---|
| Receiving → Drying → Production 0.5 | `ZA-01-11-24` (zone-week-month-year) |
| Production 1.0 | `08012025 CYB` (date + origin) |
| Application | `Qarbotech`, `OINC` — **customer name, not a batch** |
| Carbon Sink | `TIGGT-BT-2505-0001` (company-item-yymm-seq) |

The cause is physical, not clerical. Biochar from every production run is pooled
in one store, so the scoop that fills a lorry has no batch identity left to
record. Asking the sink team to write a `ZA-` code produces guesses, which is
worse than a blank: it is fake provenance that fails audit harder than an honest
gap.

## The fix: delivery document as the join key

Downstream teams never hold a production code. They hold a lorry and a delivery
order. That document is the one identifier both ends of the handover already
write down, so it becomes the join.

- `DO Number` (`do_number`) added to **Warehouse**, **Application**, **Carbon Sink**
- The Warehouse line binds the DO to a batch: `source_batch_id` + `do_number`
- `dispatchIndex()` builds `DO → [{batch, kg}]` from Warehouse lines
- `allocateDrawdown()` charges a draw-down back: explicit `source_batch_id` → DO hop → own `batch_id`
- `drawdownBatches()` is the same resolution without the weights, for membership tests

Implemented in `src/lib/workProcess.ts`, consumed by `src/lib/massBalance.ts`
and `src/lib/feedstock.ts`.

### Mixed loads

A DO spanning several batches is split **pro-rata by the kg each Warehouse line
dispatched**. Once biochar is physically pooled that is the only defensible
division, and Puro accepts mass-balance allocation where it is documented and
not double-counted. Record one Warehouse line per contributing batch, each
carrying its own quantity, all sharing the DO.

The split conserves mass exactly: floating-point remainder is folded into the
last share, so the allocation always re-sums to the shipped weight. A shipment
can be part reconciled and part pooled when only some contributing batches have
production records — the pool then holds only the unattributable share, not the
whole load.

A mixed DO whose Warehouse lines carry **no** quantities is not split. There is
nothing to weigh it by, and an even split would be a guess dressed up as
arithmetic, so it falls back to the entry's own id and stays visibly unlinked.

### Operational requirement

The hop stays inert until the warehouse logs one line per lorry-load carrying
source batch, DO and quantity. As of this note there is **1 Warehouse entry
against 23 Carbon Sink entries**, so nothing resolves yet. This is a process
change for the team, not outstanding code.

## The 5,965 kg error

One record causes all of it — `wpe_application_0001`:

```
batch_id:          "Qarbotech"      customer name, not a batch
quantity_applied:  "8900"
biochar_do:        "2020808/001"    the DO is already recorded
source_batch_id:   (absent)
application_date:  (absent)         <- the actual cause
```

With no date field, the balance falls back to the import timestamp
`2025-01-01`. Cumulative supply at that point was 2,935 kg. 8,900 − 2,935 =
5,965.

It is **not** over-shipment. The books balance overall:

```
supplied  13,962.5 kg   (10,962.5 produced + 3,000 external)
drawn     10,214.75 kg
balance     +3,748 kg
```

A real shipment is parked at a fake early date, before the production that
covered it was logged.

## Open items

1. **Real application date for `wpe_application_0001` and `wpe_application_0002`.**
   Clears the disqualifying error on its own if the true date is late enough.

2. **Confirm 8,900 kg is a genuine delivery.** It is 81% of all biochar ever
   produced (8,900 of 10,962.5 kg), and the source workbook separately lists
   `*Yet to identify 8,998.5`. Those numbers are close enough to suspect the row
   is a plug figure absorbing unallocated stock. Dating a plug correctly hides a
   bookkeeping problem instead of fixing one. **Resolve this before adding
   dispatch lines for DO 2020808/001.**

3. **Qarbotech cannot be one dispatch line.** No single batch produced 8,900 kg;
   the largest single production entry is 78 kg. That DO necessarily spans most
   of production history, so it needs one Warehouse line per contributing batch,
   each with the kg it supplied. The pro-rata split then divides the shipment
   across them. Blocked on item 2 and on someone identifying which runs actually
   filled the order.

4. **375 kg with no production behind it.** Six Carbon Sink entries between
   2023-09-17 and 2024-08-03 draw down before any production record exists.
   Either the 2023/early-2024 runs were never imported, or that biochar came
   from outside the system.

5. **3,000 kg mislabelled as purchased.** `wpe_warehouse_ext_0001` (AU Synergy,
   2024-08-21) is recorded with `product: "External Biochar"`, which excludes it
   from anything CORC-claimable. The team reports this was in fact own
   production, unlinked through miscommunication. Changing `product` to
   `Biochar` and setting `source_batch_id` moves 3,000 kg into claimable
   production. This increases the credit count, so it is the change an auditor
   will scrutinise hardest — document the evidence before making it.
