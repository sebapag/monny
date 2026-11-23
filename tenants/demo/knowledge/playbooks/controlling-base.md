# Playbook Controlling — base (Free)

Budget vs spend, KPI snapshot, alert costi anomali (anteprima).

## Contesto
Controlling offre controllo di gestione leggero senza scrivere su ERP/Finance.

## Obiettivo
Mostrare scostamenti budget, KPI (ROAS, CPA, conversioni) e costi fuori baseline.

## Processo
1. Skill: `ctrl_budget` | `ctrl_kpi` | `ctrl_costs`.
2. Rollup periodo vs budget Ads/Atrium.
3. Flag anomalie vs baseline.
4. HITL su qualsiasi riallocazione budget proposta.
5. Forecast e scenario planning → Plus.

## Decision rights
- Chiave: `controlling`
- Free: `always_ask` su proposte di riallocazione

## Metriche
- Budget vs spend (€ / %)
- ROAS / CPA snapshot
- Anomalie costo count
- Canali over/under budget

## Prompt HITL
- «Rivedere lo scostamento budget canale {canale}?»
- «Escalare a Leadership l’anomalia costo {id}?»

## Knowledge tags
`controlling`, `budget`, `kpi`, `playbook`, `free`
