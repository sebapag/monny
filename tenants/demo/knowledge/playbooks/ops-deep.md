# Playbook Operations — deep (Plus)

SLA fulfillment, priorità ripristino stock e packaging report ops.

## Contesto
Skill Plus `ops_deep_sla`. Più metriche e decision rights policy-bound.

## Obiettivo
Gestire eccezioni rispetto a SLA (cut-off, carrier, warehouse) con report per Leadership e hook WMS riservato.

## Processo (oltre al base)
1. Retrieval `operations`, `fulfillment`, `plus`, `sla`.
2. Classificare breach SLA P0/P1.
3. Suggerire re-slotting / split shipment (stub).
4. Packaging report ops (backlog, OTIF stub).
5. Hook `wms_exception_live` riservato.

## Decision rights (avanzati)
- Chiave: `operations`
- Plus: `within_policy` su reminder automatici pre-approvati
- Cancellazioni / rimborsi: sempre HITL

## Metriche (oltre Free)
- OTIF stimato
- Breach SLA per warehouse
- Tempo medio risoluzione eccezione
- Coverage alert P0

## Prompt HITL
- «Approvi il piano eccezioni P0 e il report OTIF?»
- «Abilitare reminder within_policy ai carrier whitelist?»

## Extension hooks
- `sla_matrix`
- `ops_report_packaging`
- `wms_exception_live`

## Knowledge tags
`operations`, `fulfillment`, `plus`, `sla`, `playbook`
