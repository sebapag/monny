# Playbook SEO — base (Free)

Know-how operativo per audit SEO sul piano Free.

## Contesto
Il reparto SEO cura title, meta description e H1 sulle `priority_urls` (o sitemap). Free = crawl + audit + proposta changeset; apply solo con HITL.

## Obiettivo
Ridurre issue SEO ad alto impatto sulle pagine prioritarie, allineando copy al tono di voce (`brand-voice.md`) quando presente.

## Processo
1. Crawl delle URL prioritarie (`max_urls_per_run`).
2. Audit: title mancante/lungo/corto, meta debole, H1 assente, fetch fallito.
3. Generare `SeoChangeSet` (before/after) senza publish.
4. HITL: `seo_apply_changeset` solo dopo conferma Leadership (default).
5. Non generare brief content deep né packaging report agency → Plus.

## Decision rights
- Chiave: `seo`
- Free: `always_ask` prima di apply
- `seo.auto_apply` resta off di default

## Metriche
- URL crawlate ok / totale
- Issue per severità (high/medium/low)
- Pagine con proposta di modifica
- % URL prioritarie coperte nel run

## Prompt HITL
- «Approvi il changeset SEO su {n} URL prioritarie?»
- «Vuoi escludere le homepage brand dal batch?»
- «Rivedere i title proposti rispetto al tono di voce?»

## Knowledge tags
`seo`, `site`, `brand`, `playbook`, `free`

## Fuori scope Free
Content brief H2/H3, report packaging SEO, hook CMS live → `seo_deep_content`.
