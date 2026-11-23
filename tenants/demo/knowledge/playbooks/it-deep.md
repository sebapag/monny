# Playbook IT — deep (Plus)

Reliability score, runbook incident e packaging report tecnico.

## Contesto
Skill Plus `it_deep_reliability`.

## Obiettivo
Calcolare reliability score, prioritizzare incident e produrre report per Leadership/IT owner, con hook remediation riservato.

## Processo (oltre al base)
1. Retrieval `it`, `integrations`, `plus`, `reliability`.
2. Score per integrazione (sync, errori, latenza stub).
3. Runbook incident P0/P1.
4. Packaging report IT.
5. Hook `remediation_live` riservato (restart sync, rotate hint).

## Decision rights (avanzati)
- Chiave: `it`
- Plus: `within_policy` su re-sync read-only
- Rotate secret / revoke: sempre HITL

## Metriche (oltre Free)
- Reliability score blended
- MTTA / MTTR stub
- Incident aperti per severità
- Coverage runbook

## Prompt HITL
- «Approvi il piano incident P0 e il report reliability?»
- «Consenti re-sync within_policy sulle integrazioni whitelist?»

## Extension hooks
- `reliability_score`
- `incident_runbook`
- `remediation_live`

## Knowledge tags
`it`, `integrations`, `plus`, `reliability`, `playbook`
