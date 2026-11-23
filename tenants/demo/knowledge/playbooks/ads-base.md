# Playbook Ads / Media — base (Free)

Know-how operativo per **Spend pubblicitario** sul piano Free.
Lingua primaria: italiano. Id tecnici (canali, action_type) restano in inglese.

## Contesto
Il reparto Media controlla Google Ads e Meta. Su Free l’agente **diagnostica** e **propone**; non applica ottimizzazioni live né packaging report avanzato.

## Obiettivo
Individuare campagne poco efficaci (ROAS sotto soglia / CPA sopra soglia) e proporre pause o riduzioni budget entro `max_budget_delta_pct`, con conferma Leadership.

## Processo
1. Leggere contesto shop + `spend-guidelines.md` e tono di voce se disponibile.
2. Recuperare spend lookback (`thresholds.lookback_days`).
3. Classificare campagne: healthy vs waste (flag ROAS/CPA).
4. Proporre al massimo azioni conservative (pause creatività waste, taglio ≤ policy).
5. Escalation HITL: ogni apply richiede approvazione (default `always_ask`).

## Decision rights
- Chiave: `spend`
- Free: `always_ask` prima di `pause_campaign` / `reduce_budget`
- Non abilitare `agent_resolves` su Free senza review Admin
- Adapter live di ottimizzazione → Plus (`spend_deep_optimize`)

## Metriche
- Spend totale periodo
- % spend su campagne waste
- Conteggio campagne healthy vs waste
- ROAS / CPA medi per canale (Google, Meta)

## Prompt HITL (Leadership)
- «Confermi la pausa di {n} campagne sotto ROAS minimo?»
- «Approvi la riduzione budget entro il {pct}% di policy?»
- «Vuoi scalare a umano Marketing prima di toccare brand Search?»

## Knowledge tags
`spend`, `ads`, `brand`, `playbook`, `free`

## Fuori scope Free
Packaging report ROAS multi-canale, bid strategy live, reallocation cross-channel automatica → playbook Plus.
