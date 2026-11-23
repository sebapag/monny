# Playbook Operations — base (Free)

Overview operativa: ordini, giacenze, spedizioni (anteprima).

## Contesto
Operations dà visibilità fulfillment senza mutate ordini/stock su Free.

## Obiettivo
Segnalare ordini aperti, stock sotto soglia e spedizioni in ritardo rispetto all’ETA, con proposte di follow-up HITL.

## Processo
1. Selezionare skill: `ops_orders` | `ops_inventory` | `ops_shipping`.
2. Overview stub (liste / alert).
3. Proposte: escalation magazzino, riordino hint, reminder corriere.
4. Nessuna write su WMS/carrier senza HITL.
5. SLA multi-warehouse e auto-reallocate → Plus.

## Decision rights
- Chiave: `operations`
- Free: `always_ask` su ogni azione operativa

## Metriche
- Ordini aperti
- SKU sotto soglia
- Spedizioni in ritardo
- Età media backlog (stub)

## Prompt HITL
- «Escalare a magazzino gli ordini oltre SLA?»
- «Aprire ticket corriere per {n} ritardi?»

## Knowledge tags
`operations`, `fulfillment`, `playbook`, `free`
