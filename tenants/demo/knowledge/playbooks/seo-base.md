# Playbook SEO — base (Free)

Know-how operativo per audit SEO sul piano **free**.

## Obiettivo
Controllare title, meta description e H1 sulle pagine prioritarie del sito.

## Processo
1. Crawl delle `priority_urls` (o sitemap se configurata).
2. Audit issues (title mancante/lungo, meta debole, H1 assente).
3. Proporre changeset SEO; applicare solo con HITL (default).
4. Allineare copy al tono di voce (`brand-voice.md`) quando disponibile.

## Metriche minime
- URL crawlate ok / totale
- Numero issue per severità
- Pagine con proposta di modifica

## Decision rights
- Free: `always_ask` prima di `seo_apply_changeset`.
- Brief content deep e packaging report avanzato → Plus.
