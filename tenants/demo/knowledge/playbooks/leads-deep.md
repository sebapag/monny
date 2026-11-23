# Playbook Lead — deep (Plus)

Nurture avanzato: scoring, branching, packaging report conversion funnel.

## Contesto
Skill Plus `leads_deep_nurture`. Extension hooks fino a CRM live.

## Obiettivo
Sequenze con branching (aperto/non aperto), score lead e report funnel per Leadership.

## Processo (oltre al base)
1. Retrieval `leads`, `crm`, `plus`, `nurture`.
2. Score lead (fit × intent) stub.
3. Branching touch e cooldown.
4. Packaging report funnel (open → reply → opportunity stub).
5. Hook `crm_sequence_live` riservato.

## Decision rights (avanzati)
- Chiave: `leads`
- Plus: `within_policy` solo su template pre-approvati
- Contatti VIP: sempre HITL

## Metriche (oltre Free)
- Score medio audience
- Tasso risposta stimato (stub)
- Drop-off per touch
- Template coverage pre-approvati

## Prompt HITL
- «Approvi nurture P0 con branching e report funnel?»
- «Consenti send within_policy sui template whitelist?»

## Extension hooks
- `lead_scoring`
- `nurture_branching`
- `crm_sequence_live`

## Knowledge tags
`leads`, `crm`, `plus`, `nurture`, `playbook`
