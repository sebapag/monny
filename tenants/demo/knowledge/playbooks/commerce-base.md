# Playbook Commerce / Shopify — base (Free)

Know-how per anteprima promo negozio sul piano Free (fase proposal-only).

## Contesto
Reparto Commerce legge il negozio Shopify e propone promo/discount in anteprima. Nessuna price rule live su Free senza HITL esplicito.

## Obiettivo
Proporre promo coerenti con margini e brand, senza applicare sconti reali finché Leadership non conferma.

## Processo
1. Lettura shop (domain, mode dry-run/live read).
2. Controllare FAQ prodotti / catalogo knowledge (`product-faq.md`) se presente.
3. Proporre promo (entità, sconto %, finestra, esclusione brand).
4. HITL obbligatorio prima di qualsiasi write.
5. Merchandising multi-collezione e A/B price → Plus.

## Decision rights
- Chiave: `shopify`
- Free: `always_ask` su ogni promo
- Non creare price rule automatiche

## Metriche
- Promo proposte nel run
- Sconto % proposto vs tetto interno (hint Admin)
- SKU / collezioni coinvolte (stub)
- Flag conflitto con campagna ads attiva

## Prompt HITL
- «Confermi la promo {nome} al {pct}% fino al {data}?»
- «Escludere i bestseller dal discount?»
- «Allineare la promo al messaggio ads in corso?»

## Knowledge tags
`commerce`, `shopify`, `playbook`, `free`
