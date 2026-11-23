# Playbook Controlling — deep (Plus)

Forecast, scenario e packaging report finance-light.

## Contesto
Skill Plus `ctrl_deep_forecast`.

## Obiettivo
Proiettare spend/ROAS, confrontare scenari (base/stretch) e confezionare report per Leadership.

## Processo (oltre al base)
1. Retrieval `controlling`, `budget`, `plus`, `forecast`.
2. Forecast semplice (run-rate) stub.
3. Scenario base vs stretch vs cut.
4. Packaging report controlling.
5. Hook `finance_export_live` riservato.

## Decision rights (avanzati)
- Chiave: `controlling`
- Plus: `within_policy` su export report whitelist
- Cambio budget Ads reale: sempre HITL (reparto Spend)

## Metriche (oltre Free)
- Forecast fine mese vs budget
- Delta scenario stretch
- Accuracy forecast periodo precedente (stub)
- Coverage canali nel report

## Prompt HITL
- «Approvi il forecast e lo scenario stretch?»
- «Consenti export report within_policy?»

## Extension hooks
- `spend_forecast`
- `scenario_pack`
- `finance_export_live`

## Knowledge tags
`controlling`, `budget`, `plus`, `forecast`, `playbook`
