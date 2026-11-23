# Playbook Commerce / Shopify — deep (Plus)

Merchandising e packaging promo avanzato: collection strategy, stacking rules, report per Leadership.

## Contesto
Skill Plus `shopify_deep_merch`. Proposal-only finché adapter write non è collegato.

## Obiettivo
Costruire un piano merchandising (collezioni, bundle hint, calendario promo) con report e decision rights `within_policy` opzionale.

## Processo (oltre al base)
1. Retrieval `commerce`, `shopify`, `plus`, `merch`.
2. Mappare collezioni prioritarie e overlap sconti.
3. Packaging report promo (impatto stimato GMV stub, rischio margine).
4. Regole anti-stacking (non cumulabile con codice X).
5. Hook `shopify_price_rule_live` riservato.
6. Audit trail per ogni proposta accettata.

## Decision rights (avanzati)
- Chiave: `shopify`
- Plus: `within_policy` solo su sconti ≤ soglia Admin
- Bundle / free gift: sempre HITL

## Metriche (oltre Free)
- GMV stimato promo (stub)
- Margine a rischio %
- Overlap ads ↔ promo
- Coverage collezioni prioritarie

## Prompt HITL
- «Approvi il piano merchandising P0 e rinvii i bundle?»
- «Consenti within_policy sotto soglia sconto {pct}%?»

## Extension hooks
- `merch_calendar`
- `promo_report_packaging`
- `shopify_price_rule_live`

## Knowledge tags
`commerce`, `shopify`, `plus`, `merch`, `playbook`
