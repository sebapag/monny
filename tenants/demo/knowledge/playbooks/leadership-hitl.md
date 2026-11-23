# Playbook Leadership / HITL

Know-how trasversale (sempre attivo). Non è una skill gated Free/Plus: guida le decisioni umane su ogni reparto.

## Contesto
Direzione riceve proposte dai reparti. Tre vie: **risolvi** (approva/rifiuta), **delega** a un reparto, **scala** a umano esterno.

## Obiettivo
Garantire accountability: nessuna side-effect rilevante senza diritto decisionale chiaro (`always_ask` | `within_policy` | `agent_resolves`).

## Processo
1. Leggere proposta + playbook del reparto (excerpt nel payload).
2. Verificare metriche minime e risk flags.
3. Scegliere: Approva / Rifiuta / Delega / Scala.
4. Se Plus e `within_policy`: verificare allow-list e audit.
5. Documentare motivo in HITL (nota breve).

## Decision rights
- Leadership non ha entitlement da spegnere
- Può stringere autonomia per famiglia in Admin → decision rights
- Preferire `always_ask` su brand, legal, VIP, secret rotation

## Metriche
- Tempo medio a decisione
- % proposte approvate / rifiutate / escalate
- Reparti con più backlog HITL

## Prompt HITL (template)
- «Confermi l’azione proposta dal reparto {reparto}?»
- «Vuoi delegare a {reparto} con istruzioni?»
- «Scala a umano: serve contesto legale/finance?»

## Knowledge tags
`leadership`, `hitl`, `governance`, `playbook`
