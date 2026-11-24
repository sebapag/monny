/**
 * Atrium thin API (Supabase Edge Function).
 * Auth-adjacent + tenants/knowledge. Real LangGraph runs go to WORKER_URL
 * (Cloud Run / local uvicorn) when set; otherwise keyword stub fallback.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function workerUrl(): string | null {
  const raw = (Deno.env.get("WORKER_URL") ?? "").trim().replace(/\/$/, "");
  return raw || null;
}

/** Proxy agent routes to the LangGraph worker; returns null if no worker. */
async function proxyWorker(req: Request, path: string): Promise<Response | null> {
  const base = workerUrl();
  if (!base) return null;
  const url = new URL(req.url);
  const target = `${base}${path}${url.search}`;
  const headers = new Headers();
  const auth = req.headers.get("Authorization");
  if (auth) headers.set("Authorization", auth);
  headers.set("Content-Type", "application/json");
  const init: RequestInit = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }
  const res = await fetch(target, init);
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { ...cors, "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
  });
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,OPTIONS",
};

type Profile = {
  id: string;
  email: string;
  display_name: string;
  role: "agent" | "admin";
  tenant_id: string;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function err(detail: string, status = 400): Response {
  return json({ detail }, status);
}

function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

function userClient(req: Request): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
}

async function requireUser(
  req: Request,
): Promise<{ sb: SupabaseClient; profile: Profile } | Response> {
  const sb = userClient(req);
  const { data: authData, error: authErr } = await sb.auth.getUser();
  if (authErr || !authData.user) return err("Autenticazione richiesta", 401);
  const { data: profile, error } = await sb
    .from("profiles")
    .select("id,email,display_name,role,tenant_id")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (error || !profile) return err("Profilo non trovato", 401);
  return { sb, profile: profile as Profile };
}

function requireAdmin(
  gate: { sb: SupabaseClient; profile: Profile },
): Response | null {
  if (gate.profile.role !== "admin") {
    return err("Solo Admin: l'account Agent non può aprire questa area", 403);
  }
  return null;
}

/** Thin planner: keyword skills + optional short Grok plan. */
async function planSkills(goal: string, message: string, skills: Record<string, boolean>): Promise<string[]> {
  const text = `${goal} ${message}`.toLowerCase();
  const planned: string[] = [];
  const add = (key: string, skill: string, words: string[]) => {
    if (skills[key] !== false && words.some((w) => text.includes(w))) planned.push(skill);
  };
  add("shopify", "shopify_read", ["promo", "shopify", "sconto", "prezzo"]);
  add("spend", "spend_google", ["spend", "ads", "budget", "roas", "google", "meta", "cpa"]);
  add("spend", "spend_meta", ["meta", "facebook", "instagram"]);
  add("seo", "seo_audit", ["seo", "title", "meta", "crawl", "sitemap"]);
  add("leads", "lead_warming", ["lead", "nurture", "crm"]);
  add("operations", "ops_stub", ["operazioni", "operations", "logistica"]);
  add("design", "design_stub", ["design", "creativ"]);
  add("it", "it_stub", ["it ", "sistema", "integrazione"]);
  add("controlling", "ctrl_stub", ["controlling", "margine", "p&l"]);

  const apiKey = (Deno.env.get("XAI_API_KEY") ?? "").trim();
  if (apiKey && planned.length === 0) {
    try {
      const model = Deno.env.get("MONNY_LLM_MODEL") ?? "grok-4.20-0309-non-reasoning";
      const base = Deno.env.get("MONNY_LLM_BASE_URL") ?? "https://api.x.ai/v1";
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                'Rispondi solo JSON {"skills":["spend_google"|"spend_meta"|"seo_audit"|"shopify_read"|"lead_warming",...]} piano breve.',
            },
            { role: "user", content: `Goal: ${goal}\nMessaggio: ${message}` },
          ],
        }),
      });
      if (res.ok) {
        const body = await res.json();
        const content = body?.choices?.[0]?.message?.content ?? "";
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]) as { skills?: string[] };
          if (Array.isArray(parsed.skills)) {
            for (const s of parsed.skills) {
              if (typeof s === "string" && !planned.includes(s)) planned.push(s);
            }
          }
        }
      }
    } catch {
      /* stub fallback */
    }
  }

  if (planned.length === 0) {
    if (skills.spend !== false) planned.push("spend_google");
    if (skills.seo !== false) planned.push("seo_audit");
  }
  planned.push("reporting");
  if (!planned.includes("shopify_read") && skills.shopify !== false) {
    // keep portable default light
  }
  return ["shopify_read", ...planned.filter((s) => s !== "shopify_read")];
}

function skillLabel(skill: string): string {
  const map: Record<string, string> = {
    shopify_read: "Lettura negozio",
    spend_google: "Spend Google",
    spend_meta: "Spend Meta",
    seo_audit: "Audit SEO",
    lead_warming: "Lead warming",
    ops_stub: "Operations",
    design_stub: "Design",
    it_stub: "IT",
    ctrl_stub: "Controlling",
    reporting: "Report",
    hitl: "Decisione umana",
    planner: "Piano",
  };
  return map[skill] ?? skill;
}

async function startRun(
  sb: SupabaseClient,
  profile: Profile,
  body: { tenant_id?: string; message?: string; goal?: string; thread_id?: string },
) {
  const tenantId = body.tenant_id || profile.tenant_id || "demo";
  const goal = (body.goal || body.message || "").trim() || "Report spend";
  const message = (body.message || goal).trim();
  const threadId = body.thread_id || crypto.randomUUID();

  const { data: tenant } = await sb.from("tenants").select("config").eq("id", tenantId).maybeSingle();
  const skills = (tenant?.config?.subscription?.skills ?? {}) as Record<string, boolean>;
  const planned = await planSkills(goal, message, skills);

  const steps = planned.map((skill, i) => ({
    id: `s${i + 1}`,
    skill,
    label: skillLabel(skill),
    status: i === 0 ? "running" : "pending",
    detail: "",
    started_at: i === 0 ? new Date().toISOString() : null,
    finished_at: null,
  }));

  const now = new Date().toISOString();
  const { data: run, error } = await sb
    .from("agent_runs")
    .insert({
      tenant_id: tenantId,
      thread_id: threadId,
      goal,
      status: "running",
      active_skill: planned[0] ?? null,
      status_line: `Eseguo ${skillLabel(planned[0] ?? "piano")}…`,
      steps,
      reply: null,
      report: null,
      approval_ids: [],
    })
    .select("*")
    .single();
  if (error || !run) throw new Error(error?.message ?? "Creazione run fallita");

  // Complete stub synchronously for market test (no background worker).
  const completedSteps = steps.map((s) => ({
    ...s,
    status: "done",
    started_at: s.started_at ?? now,
    finished_at: now,
    detail: "Completato (stub Edge)",
  }));

  const needsHitl = Boolean(tenant?.config?.policy?.hitl_default ?? true);
  let approvalIds: string[] = [];
  let status = "completed";
  let statusLine = "Completato";
  let reply =
    "Ho preparato un riepilogo. Controlla il report e le decisioni pendenti se presenti.";

  if (needsHitl && planned.some((s) => s.startsWith("spend") || s.startsWith("seo"))) {
    const { data: approval } = await sb
      .from("approvals")
      .insert({
        tenant_id: tenantId,
        thread_id: threadId,
        action_type: planned.some((s) => s.startsWith("seo")) ? "seo_apply" : "spend_adjust",
        summary: `Proposta da rivedere: ${goal.slice(0, 120)}`,
        payload: { goal, planned, source: "edge-stub" },
        status: "pending",
      })
      .select("id")
      .single();
    if (approval?.id) {
      approvalIds = [approval.id];
      status = "awaiting_approval";
      statusLine = "In attesa di decisione";
      reply =
        "Ho bisogno di una tua decisione su una proposta. Aprila dall’alert o dal reparto Leadership.";
      completedSteps.push({
        id: `s${completedSteps.length + 1}`,
        skill: "hitl",
        label: skillLabel("hitl"),
        status: "waiting",
        detail: "In attesa",
        started_at: now,
        finished_at: null,
      });
    }
  }

  const report = {
    markdown: `## Report stub\n\n**Obiettivo:** ${goal}\n\nSkill eseguite: ${planned.map(skillLabel).join(", ")}.\n\n_Market test Edge Function — LangGraph completo TBD._`,
    proposal_count: approvalIds.length,
    proposals: [],
    spend_channels: planned.some((s) => s.startsWith("spend"))
      ? [
          {
            channel: "google",
            totals: {
              campaigns: 3,
              healthy: 2,
              waste: 1,
              spend: 420,
              waste_spend: 80,
              waste_spend_pct: 19,
            },
            campaigns: [],
          },
        ]
      : [],
  };

  await sb.from("artifacts").upsert({
    tenant_id: tenantId,
    name: "latest_report.json",
    payload: report,
    updated_at: now,
  });

  await sb.from("audit_events").insert({
    tenant_id: tenantId,
    event: "run_completed_stub",
    payload: { run_id: run.id, planned, approval_ids: approvalIds },
  });

  const { data: updated } = await sb
    .from("agent_runs")
    .update({
      status,
      status_line: statusLine,
      active_skill: null,
      steps: completedSteps,
      reply,
      report,
      approval_ids: approvalIds,
      updated_at: now,
    })
    .eq("id", run.id)
    .select("*")
    .single();

  return shapeRun(updated ?? { ...run, status, steps: completedSteps, reply, report, approval_ids: approvalIds });
}

function shapeRun(row: Record<string, unknown>) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    thread_id: row.thread_id,
    goal: row.goal,
    status: row.status,
    active_skill: row.active_skill ?? null,
    status_line: row.status_line ?? "",
    steps: row.steps ?? [],
    reply: row.reply ?? null,
    report: row.report ?? null,
    approval_ids: row.approval_ids ?? [],
    error: row.error ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function secretConfigured(ref: string | undefined): boolean {
  if (!ref) return false;
  return Boolean((Deno.env.get(ref) ?? "").trim());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  // Path after /functions/v1/atrium-api
  let path = url.pathname.replace(/^\/functions\/v1\/atrium-api/, "") || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  // Also accept /api prefix from SPA
  if (!path.startsWith("/api") && path !== "/health") {
    if (path === "/" || path === "") path = "/api/health";
  }

  try {
    if (req.method === "GET" && (path === "/health" || path === "/api/health")) {
      const llm = Boolean((Deno.env.get("XAI_API_KEY") ?? "").trim());
      const worker = workerUrl();
      return json({
        ok: true,
        dry_run: true,
        default_tenant: "demo",
        auth: { backend: "supabase", supabase_configured: true },
        stack: "netlify-supabase-worker",
        worker_url: worker ? true : false,
        llm: {
          enabled: llm,
          provider: llm ? "xai" : null,
          model: llm ? Deno.env.get("MONNY_LLM_MODEL") ?? "grok-4.20-0309-non-reasoning" : null,
        },
        planner: worker ? "langgraph-worker" : llm ? "grok-light" : "keyword-stub",
      });
    }

    const gate = await requireUser(req);
    if (gate instanceof Response) return gate;
    const { sb, profile } = gate;

    // ---- auth helpers still useful for SPA that proxies users ----
    if (req.method === "GET" && path === "/api/auth/me") {
      return json({
        email: profile.email,
        display_name: profile.display_name,
        role: profile.role,
        tenant_id: profile.tenant_id,
        user_id: profile.id,
      });
    }

    if (req.method === "GET" && path === "/api/auth/users") {
      const denied = requireAdmin(gate);
      if (denied) return denied;
      const tenantFilter = url.searchParams.get("tenant_id") || profile.tenant_id;
      const admin = adminClient();
      let q = admin.from("profiles").select("id,email,display_name,role,tenant_id").order("email");
      if (tenantFilter) q = q.eq("tenant_id", tenantFilter);
      const { data, error } = await q;
      if (error) return err(error.message, 500);
      return json(
        (data ?? []).map((u) => ({
          email: u.email,
          display_name: u.display_name,
          role: u.role,
          tenant_id: u.tenant_id,
          user_id: u.id,
        })),
      );
    }

    if (req.method === "POST" && path === "/api/auth/users") {
      const denied = requireAdmin(gate);
      if (denied) return denied;
      const body = await req.json();
      const admin = adminClient();
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const role = body.role === "admin" ? "admin" : "agent";
      const tenantId = String(body.tenant_id || profile.tenant_id || "demo");
      const displayName = String(body.display_name || email.split("@")[0]);
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: displayName,
          role,
          tenant_id: tenantId,
          invited_by_admin: "true",
        },
      });
      if (error || !created.user) return err(error?.message ?? "Creazione fallita", 400);
      await admin.from("profiles").upsert({
        id: created.user.id,
        email,
        display_name: displayName,
        role,
        tenant_id: tenantId,
      });
      return json({
        email,
        display_name: displayName,
        role,
        tenant_id: tenantId,
        user_id: created.user.id,
      });
    }

    const userPatch = path.match(/^\/api\/auth\/users\/([^/]+)$/);
    if (req.method === "PATCH" && userPatch) {
      const denied = requireAdmin(gate);
      if (denied) return denied;
      const body = await req.json();
      const admin = adminClient();
      const patch: Record<string, unknown> = { role: body.role === "admin" ? "admin" : "agent" };
      if (body.display_name != null) patch.display_name = body.display_name;
      if (body.tenant_id != null) patch.tenant_id = body.tenant_id;
      const { data, error } = await admin
        .from("profiles")
        .update(patch)
        .eq("id", userPatch[1])
        .select("id,email,display_name,role,tenant_id")
        .single();
      if (error || !data) return err(error?.message ?? "Utente non trovato", 404);
      return json({
        email: data.email,
        display_name: data.display_name,
        role: data.role,
        tenant_id: data.tenant_id,
        user_id: data.id,
      });
    }

    if (req.method === "GET" && path === "/api/tenants") {
      const { data, error } = await sb.from("tenants").select("id,display_name,config");
      if (error) return err(error.message, 500);
      const out = [];
      for (const t of data ?? []) {
        const { count } = await sb
          .from("approvals")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", t.id)
          .eq("status", "pending");
        const cfg = t.config ?? {};
        const refs = [
          cfg?.shopify?.auth?.secret_ref,
          cfg?.ads?.google?.secret_ref,
          cfg?.ads?.meta?.secret_ref,
        ].filter(Boolean) as string[];
        out.push({
          tenant_id: t.id,
          display_name: t.display_name,
          secrets_configured: refs.filter((r) => secretConfigured(r)).length,
          pending_approvals: count ?? 0,
        });
      }
      return json(out);
    }

    const tenantGet = path.match(/^\/api\/tenants\/([^/]+)$/);
    if (req.method === "GET" && tenantGet) {
      const { data, error } = await sb.from("tenants").select("*").eq("id", tenantGet[1]).maybeSingle();
      if (error || !data) return err("Tenant non trovato", 404);
      const cfg = data.config ?? {};
      const refs = [
        cfg?.shopify?.auth?.secret_ref,
        cfg?.ads?.google?.secret_ref,
        cfg?.ads?.meta?.secret_ref,
        cfg?.integrations?.search_console?.secret_ref,
      ].filter(Boolean) as string[];
      return json({
        tenant_id: data.id,
        display_name: data.display_name,
        config: cfg,
        path: `supabase:tenants/${data.id}`,
        secrets: refs.map((secret_ref) => ({
          secret_ref,
          configured: secretConfigured(secret_ref),
        })),
        subscription: cfg.subscription ?? null,
      });
    }

    if (req.method === "PUT" && tenantGet) {
      const denied = requireAdmin(gate);
      if (denied) return denied;
      const body = await req.json();
      const config = body.config;
      if (!config || typeof config !== "object") return err("config richiesta");
      // Market rule: office_view always on (3D for everyone).
      if (!config.subscription) config.subscription = {};
      if (!config.subscription.features) config.subscription.features = {};
      config.subscription.features.office_view = true;
      const { error } = await sb
        .from("tenants")
        .update({
          config,
          display_name: config.display_name || tenantGet[1],
          updated_at: new Date().toISOString(),
        })
        .eq("id", tenantGet[1]);
      if (error) return err(error.message, 500);
      await sb.from("audit_events").insert({
        tenant_id: tenantGet[1],
        event: "tenant_updated",
        payload: { by: profile.email },
      });
      return json({ ok: true, path: `supabase:tenants/${tenantGet[1]}` });
    }

    const auditPath = path.match(/^\/api\/tenants\/([^/]+)\/audit$/);
    if (req.method === "GET" && auditPath) {
      const limit = Number(url.searchParams.get("limit") || 80);
      const { data, error } = await sb
        .from("audit_events")
        .select("ts,tenant_id,event,payload")
        .eq("tenant_id", auditPath[1])
        .order("ts", { ascending: false })
        .limit(limit);
      if (error) return err(error.message, 500);
      return json(data ?? []);
    }

    const artifactsPath = path.match(/^\/api\/tenants\/([^/]+)\/artifacts$/);
    if (req.method === "GET" && artifactsPath) {
      const { data, error } = await sb
        .from("artifacts")
        .select("name,payload,updated_at")
        .eq("tenant_id", artifactsPath[1]);
      if (error) return err(error.message, 500);
      return json({
        tenant_id: artifactsPath[1],
        artifacts: (data ?? []).map((a) => ({
          name: a.name,
          path: `supabase:artifacts/${a.name}`,
          size: JSON.stringify(a.payload ?? {}).length,
          mtime: new Date(a.updated_at).getTime() / 1000,
        })),
      });
    }

    const artifactOne = path.match(/^\/api\/tenants\/([^/]+)\/artifacts\/([^/]+)$/);
    if (req.method === "GET" && artifactOne) {
      const { data, error } = await sb
        .from("artifacts")
        .select("name,payload")
        .eq("tenant_id", artifactOne[1])
        .eq("name", artifactOne[2])
        .maybeSingle();
      if (error || !data) return err("Artifact non trovato", 404);
      return json({ tenant_id: artifactOne[1], name: data.name, payload: data.payload });
    }

    const knowledgePath = path.match(/^\/api\/tenants\/([^/]+)\/knowledge$/);
    if (req.method === "GET" && knowledgePath) {
      const denied = requireAdmin(gate);
      if (denied) return denied;
      const { data, error } = await sb
        .from("knowledge_sources")
        .select("id,title,type,tags,enabled")
        .eq("tenant_id", knowledgePath[1]);
      if (error) return err(error.message, 500);
      return json({
        tenant_id: knowledgePath[1],
        sources: (data ?? []).map((s) => ({
          id: s.id,
          title: s.title,
          type: s.type,
          path: s.id,
          tags: s.tags ?? [],
          enabled: s.enabled,
        })),
        index: { backend: "supabase_stub", embedding: "none" },
        path: `supabase:knowledge/${knowledgePath[1]}`,
      });
    }

    if (req.method === "POST" && path.match(/^\/api\/tenants\/[^/]+\/knowledge\/retrieve$/)) {
      const tenantId = path.split("/")[3];
      const body = await req.json();
      const query = String(body.query ?? "").toLowerCase();
      const { data, error } = await sb
        .from("knowledge_sources")
        .select("id,title,body,tags,enabled")
        .eq("tenant_id", tenantId)
        .eq("enabled", true);
      if (error) return err(error.message, 500);
      const chunks = (data ?? [])
        .map((s) => {
          const hay = `${s.title} ${s.body}`.toLowerCase();
          const score = query ? (hay.includes(query) ? 2 : query.split(/\s+/).filter((w) => hay.includes(w)).length) : 1;
          return {
            source_id: s.id,
            title: s.title,
            excerpt: String(s.body).slice(0, 280),
            tags: s.tags ?? [],
            score,
          };
        })
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, Number(body.limit || 5));
      return json({ tenant_id: tenantId, query, tags: body.tags ?? [], chunks });
    }

    const knowledgeToggle = path.match(/^\/api\/tenants\/([^/]+)\/knowledge\/sources\/([^/]+)$/);
    if (req.method === "PATCH" && knowledgeToggle) {
      const denied = requireAdmin(gate);
      if (denied) return denied;
      const body = await req.json();
      const { data, error } = await sb
        .from("knowledge_sources")
        .update({ enabled: Boolean(body.enabled), updated_at: new Date().toISOString() })
        .eq("tenant_id", knowledgeToggle[1])
        .eq("id", knowledgeToggle[2])
        .select("id,title,type,tags,enabled")
        .single();
      if (error || !data) return err(error?.message ?? "Fonte non trovata", 404);
      return json({
        ok: true,
        source: {
          id: data.id,
          title: data.title,
          type: data.type,
          path: data.id,
          tags: data.tags ?? [],
          enabled: data.enabled,
        },
      });
    }

    // Prefer LangGraph worker when WORKER_URL is configured.
    if (
      (req.method === "GET" && path === "/api/approvals") ||
      (req.method === "POST" && path.match(/^\/api\/approvals\/[^/]+\/decide$/)) ||
      (req.method === "POST" && (path === "/api/runs" || path === "/api/chat")) ||
      (req.method === "GET" && path.match(/^\/api\/runs\/[^/]+$/)) ||
      path.match(/^\/api\/tenants\/[^/]+\/connectors\//) ||
      path.match(/^\/api\/connectors\/shopify\//)
    ) {
      const proxied = await proxyWorker(req, path);
      if (proxied) return proxied;
      if (path.includes("/connectors/shopify")) {
        return err(
          "OAuth Shopify richiede il worker LangGraph (imposta WORKER_URL).",
          503,
        );
      }
    }

    if (req.method === "GET" && path === "/api/approvals") {
      let q = sb.from("approvals").select("*").order("created_at", { ascending: false });
      const tenantId = url.searchParams.get("tenant_id");
      const status = url.searchParams.get("status") || "pending";
      if (tenantId) q = q.eq("tenant_id", tenantId);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) return err(error.message, 500);
      return json(data ?? []);
    }

    const decidePath = path.match(/^\/api\/approvals\/([^/]+)\/decide$/);
    if (req.method === "POST" && decidePath) {
      const body = await req.json();
      const decision = String(body.decision ?? "");
      if (!["approved", "rejected", "delegated", "escalated"].includes(decision)) {
        return err("decision non valida");
      }
      const patch: Record<string, unknown> = {
        status: decision,
        note: body.note ?? null,
        delegate_to: decision === "delegated" ? body.delegate_to ?? null : null,
        decided_at: new Date().toISOString(),
        apply_result: { ok: true, mode: "edge-stub", decision },
      };
      const { data, error } = await sb
        .from("approvals")
        .update(patch)
        .eq("id", decidePath[1])
        .select("*")
        .single();
      if (error || !data) return err(error?.message ?? "Approval non trovata", 404);
      await sb.from("audit_events").insert({
        tenant_id: data.tenant_id,
        event: "approval_decided",
        payload: { id: data.id, decision, by: profile.email },
      });
      return json(data);
    }

    if (req.method === "POST" && path === "/api/runs") {
      const body = await req.json();
      const run = await startRun(sb, profile, body);
      return json(run);
    }

    if (req.method === "POST" && path === "/api/chat") {
      const body = await req.json();
      const run = await startRun(sb, profile, body);
      return json({
        thread_id: run.thread_id,
        reply: run.reply ?? "",
        status: run.status,
        approval_ids: run.approval_ids ?? [],
        report: run.report,
        findings: [],
        run_id: run.id,
      });
    }

    const runGet = path.match(/^\/api\/runs\/([^/]+)$/);
    if (req.method === "GET" && runGet) {
      const { data, error } = await sb.from("agent_runs").select("*").eq("id", runGet[1]).maybeSingle();
      if (error || !data) return err("Run non trovato", 404);
      return json(shapeRun(data));
    }

    return err(`Route non trovata: ${req.method} ${path}`, 404);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(message, 500);
  }
});
