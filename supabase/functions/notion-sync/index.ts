import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// Life OS → Notion sync. Runs server-side (pg_cron via pg_net), so it needs no
// interactive auth. Reads the day's record from Supabase (service role) and
// writes to Notion via the REST API. Custom auth: caller must send the
// x-sync-key header matching the SYNC_KEY secret (verify_jwt is off).
//
// Query params: ?date=YYYY-MM-DD (default: yesterday, Asia/Manila) · ?dry=1
// (compute + return the payload without writing to Notion).
//
// Required secrets (Supabase → Edge Functions → Secrets): NOTION_TOKEN, SYNC_KEY.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const NOTION_TOKEN = Deno.env.get("NOTION_TOKEN") ?? ""
const SYNC_KEY = Deno.env.get("SYNC_KEY") ?? ""
const JOURNAL_DB = Deno.env.get("NOTION_JOURNAL_DB") ?? "ef726f8f0b3048ccb5e6ef152091b308"
const KB_DB = Deno.env.get("NOTION_KB_DB") ?? "4f841d4287124ab28eeef2b265164eb5"
const NOTION = "https://api.notion.com/v1"
const NV = "2022-06-28"

const CATS: Record<string, string> = {
  work: "Work · engineering", math: "Measure theory / analysis", chin: "Chinese (Migaku/CI)",
  exercise: "Exercise", thesis: "UPD thesis", devops: "Work · DevOps", wqu: "WQU (maintenance)",
}
const COUNTED = ["work", "math", "chin", "exercise", "thesis", "devops", "wqu"]

const manilaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date())
function addDaysIso(iso: string, d: number): string {
  const [y, m, dd] = iso.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, dd)); dt.setUTCDate(dt.getUTCDate() + d)
  return dt.toISOString().slice(0, 10)
}
function weekday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })
}

async function db(path: string, init?: RequestInit) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  })
  if (!r.ok) throw new Error(`db ${path}: ${r.status} ${await r.text()}`)
  return r.status === 204 ? null : await r.json()
}
async function notion(path: string, method: string, body?: unknown) {
  const r = await fetch(`${NOTION}${path}`, {
    method,
    headers: { Authorization: `Bearer ${NOTION_TOKEN}`, "Notion-Version": NV, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`notion ${path}: ${r.status} ${JSON.stringify(j)}`)
  return j
}
const h2 = (t: string) => ({ object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: t } }] } })
const li = (t: string) => ({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: t } }] } })
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } })

Deno.serve(async (req) => {
  if (!SYNC_KEY || req.headers.get("x-sync-key") !== SYNC_KEY) return json({ error: "unauthorized" }, 401)
  const url = new URL(req.url)
  const dry = url.searchParams.get("dry") === "1"
  const day = url.searchParams.get("date") ?? addDaysIso(manilaToday(), -1)

  try {
    const blocks = await db(`block_logs?done_on=eq.${day}&select=title,cat,dur_min,deep`)
    const entries = await db(`log_entries?on_date=eq.${day}&select=id,kind,state,text`)
    const habitLogs = await db(`habit_logs?done_on=eq.${day}&select=habit_id`)
    const notes = await db(`log_entries?kind=eq.note&state=eq.open&on_date=lte.${day}&select=id,text,cat,on_date`)

    const counted = (blocks as any[]).filter((b) => COUNTED.includes(b.cat) && b.title)
    const byCat: Record<string, { titles: Record<string, { count: number; deep: boolean }>; mins: number; deep: number }> = {}
    for (const b of counted) {
      const e = (byCat[b.cat] ??= { titles: {}, mins: 0, deep: 0 })
      e.mins += b.dur_min; if (b.deep) e.deep++
      const t = (e.titles[b.title] ??= { count: 0, deep: false }); t.count++; t.deep = t.deep || b.deep
    }
    const deepSessions = counted.filter((b) => b.deep).length
    const doneTasks = (entries as any[]).filter((e) => e.kind === "task" && e.state === "done")
    const events = (entries as any[]).filter((e) => e.kind === "event")
    const habits = (habitLogs as any[]).length
    const title = `${day} · ${weekday(day)}`

    const children: unknown[] = []
    if (Object.keys(byCat).length) {
      children.push(h2("Accomplished"))
      for (const [cat, e] of Object.entries(byCat)) {
        const titles = Object.entries(e.titles).map(([t, v]) => `${v.deep ? "▲ " : ""}${t}${v.count > 1 ? ` ×${v.count}` : ""}`).join(" · ")
        children.push(li(`${CATS[cat] ?? cat} — ${titles}`))
      }
    }
    if (events.length || doneTasks.length) {
      children.push(h2("Logged"))
      for (const e of events) children.push(li(`○ ${e.text}`))
      for (const e of doneTasks) children.push(li(`✕ ${e.text}`))
    }

    if (dry) return json({ day, title, counts: { blocks: counted.length, deepSessions, doneTasks: doneTasks.length, habits, notesToFile: (notes as any[]).length }, byCat })
    if (!NOTION_TOKEN) return json({ error: "NOTION_TOKEN not set" }, 500)

    let journaled = false
    const q = await notion(`/databases/${JOURNAL_DB}/query`, "POST", { filter: { property: "Day", date: { equals: day } }, page_size: 1 })
    if (q.results.length === 0 && (counted.length || entries.length || habits)) {
      await notion(`/pages`, "POST", {
        parent: { database_id: JOURNAL_DB },
        properties: {
          Name: { title: [{ text: { content: title } }] },
          Day: { date: { start: day } },
          "Tasks done": { number: doneTasks.length },
          "Deep sessions": { number: deepSessions },
          Blocks: { number: counted.length },
          Habits: { number: habits },
        },
        children,
      })
      journaled = true
    }

    let notesFiled = 0
    for (const n of notes as any[]) {
      await notion(`/pages`, "POST", {
        parent: { database_id: KB_DB },
        properties: {
          Name: { title: [{ text: { content: n.text } }] },
          Source: { select: { name: "brain-dump" } },
          Status: { select: { name: "inbox" } },
          Captured: { date: { start: n.on_date } },
        },
      })
      await db(`log_entries?id=eq.${n.id}`, { method: "PATCH", body: JSON.stringify({ state: "dropped" }) })
      notesFiled++
    }

    return json({ ok: true, day, journaled, notesFiled })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
