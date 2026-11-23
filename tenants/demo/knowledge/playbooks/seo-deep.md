# Playbook SEO — deep (Plus)

Estensione Plus: brief content, packaging report SEO e hook CMS/live apply.
Supera il Free con intent mapping, outline e report per Leadership/agency.

## Contesto
Piano **plus** (o override). Enrichment knowledge con più chunk e path brand voice + playbook deep.

## Obiettivo
Passare dall’audit tecnico a un piano content: intent, outline, CTA, priorità impatto, con report confezionato.

## Processo (oltre al base)
1. Retrieval tag `seo`, `content`, `plus` + brand voice.
2. Per URL prioritarie: intent (informational/commercial), outline H2/H3, CTA soft.
3. Packaging report SEO: priorità URL, impatto stimato, next actions.
4. Allineare proposte al tono (`brand-voice.md`).
5. Hook `cms_live_apply_hook` riservato — nessuna modifica reale finché non collegato.
6. Decision rights: `within_policy` solo se Admin abilita e CMS dry-run ok.

## Decision rights (avanzati)
- Chiave: `seo`
- Plus: HITL su publish; brief può restare proposal-only
- Homepage / legal pages: sempre `always_ask`

## Metriche (oltre Free)
- Coverage intent sulle URL prioritarie
- Stima impatto (issue high risolti)
- Lunghezza media title/meta post-proposta vs target
- Chunk knowledge usati nel brief
- Tempo a approvazione changeset

## Prompt HITL
- «Approvi i brief content P0 e il packaging report?»
- «Consenti dry-run CMS sul changeset SEO?»
- «Bloccare apply su URL legali anche in within_policy?»

## Extension hooks
- `content_brief`
- `seo_report_packaging`
- `cms_live_apply_hook`

## Knowledge tags
`seo`, `content`, `plus`, `playbook`
