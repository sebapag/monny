# Playbook IT — base (Free)

Salute integrazioni, accessi da completare, monitoring runtime (anteprima).

## Contesto
IT riduce friction operativa: secret mancanti, sync falliti, errori runtime. Free = checklist e alert, senza mutate infrastruttura.

## Obiettivo
Elencare gap di accesso, salute integrazioni (Shopify, Ads, GSC) e snapshot uptime/errori.

## Processo
1. Skill: `it_integrations` | `it_access` | `it_monitoring`.
2. Checklist secret_ref / last sync (stub).
3. Collegare cue Agent «Accessi da completare».
4. HITL prima di rotazione secret o disable integration.
5. Reliability score e auto-remediation hint → Plus.

## Decision rights
- Chiave: `it`
- Free: `always_ask` su cambio accessi

## Metriche
- Integrazioni healthy / totali
- Secret mancanti
- Errori runtime nel periodo (stub)
- Età ultimo sync ok

## Prompt HITL
- «Completare gli accessi mancanti segnalati?»
- «Aprire ticket su integrazione {nome} unhealthy?»

## Knowledge tags
`it`, `integrations`, `playbook`, `free`
