# Playbook Ads / Media — deep (Plus)

Estensione Plus di Spend: retrieval ricco, packaging report ROAS, hook adapter live e decision rights avanzati.
Supera chiaramente il base Free su profondità di processo, metriche e autonomia guidata da policy.

## Contesto
Attivabile solo con piano **plus** (o `plus_override` Admin). Stesso ufficio 3D; capacità skill maggiore.

## Obiettivo
Ottimizzare spend con know-how aziendale completo: priorità azioni, report confezionato per Leadership/agency, hook verso adapter live quando collegati.

## Processo (oltre al base)
1. Retrieval knowledge con tag `spend`, `ads`, `plus`, `optimize` (più chunk del Free).
2. Cross-check Google + Meta: waste overlapping, brand vs prospecting, retargeting caldo.
3. Packaging report ROAS multi-canale con priorità (P0 pause, P1 riduci, P2 osserva).
4. Simulare reallocation entro `max_budget_delta_pct` aggregato, non solo per campagna.
5. Hook `live_adapter_optimize` (extension — stub finché adapter non è live).
6. Decision rights: se Admin imposta `within_policy`, applicare solo azioni in allow-list; `agent_resolves` solo con audit trail.

## Decision rights (avanzati)
- Chiave: `spend`
- Plus può usare `within_policy` / `agent_resolves` se abilitati in Admin
- Brand Search: preferire sempre HITL anche in `within_policy`
- Log audit obbligatorio su ogni apply live

## Metriche (oltre Free)
- ROAS blended Google+Meta
- Waste spend € e % con trend vs periodo precedente
- Incrementalità stimata post-reallocation (stub)
- Tempo medio a decisione HITL
- Coverage playbook (chunk knowledge usati nel run)

## Prompt HITL
- «Approvi il pacchetto P0 (pause) e rinvii P1 a revisione umana?»
- «Consenti apply within_policy sulle sole azioni in allow-list?»
- «Attivare hook live optimize in dry-run e rivedere il diff?»

## Extension hooks
- `deep_roas_packaging`
- `live_adapter_optimize`
- `advanced_decision_rights`

## Knowledge tags
`spend`, `ads`, `plus`, `optimize`, `playbook`

## Fuori scope Free
Questo playbook non è attivabile senza piano Plus (o override Admin).
