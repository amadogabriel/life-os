/**
 * One-time migration: copy the legacy `planners` jsonb blob into the
 * normalized tables, preserving block/habit completion history.
 *
 *   1. Run supabase/migrations/0001_normalized_schema.sql in your project.
 *   2. Fill VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
 *      LEGACY_IMPORT_EMAIL and LEGACY_IMPORT_PASSWORD in .env.
 *   3. npm run import-legacy
 *
 * The script signs in as you (RLS applies), REPLACES any rows already in the
 * normalized tables for your user, and leaves the legacy `planners` row
 * untouched as a backup.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// minimal .env loader — no dependency needed
try {
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {
  /* no .env file — rely on the environment */
}

interface LegacyBlock {
  id: string
  cat: string
  title: string
  desc?: string
  start: number
  dur: number
  anchor?: boolean
}
interface LegacyState {
  notes?: string
  days: { name: string; loc?: string; blocks: LegacyBlock[] }[]
  habits?: { id: string; name: string; cat: string; days: number[] }[]
  blockLog?: Record<string, Record<string, true>>
  habitLog?: Record<string, Record<string, true>>
  buckets?: { id: string; name: string; cat: string; tasks: { id: string; name: string }[] }[]
  design?: { wake: number; items: { id: string; name: string; cat: string; mins?: number; hours?: number }[] }
}

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
const email = process.env.LEGACY_IMPORT_EMAIL
const password = process.env.LEGACY_IMPORT_PASSWORD
if (!url || !key || !email || !password) {
  console.error(
    'Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, LEGACY_IMPORT_EMAIL, LEGACY_IMPORT_PASSWORD in .env',
  )
  process.exit(1)
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

async function main() {
  const sb = createClient(url!, key!)
  const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email: email!, password: password! })
  if (authErr) throw new Error('Sign-in failed: ' + authErr.message)
  const userId = auth.user.id
  console.log('Signed in as', auth.user.email)

  const { data: row, error } = await sb.from('planners').select('data').eq('user_id', userId).maybeSingle()
  if (error) throw new Error('Could not read legacy planners table: ' + error.message)
  if (!row?.data) throw new Error('No legacy planner blob found for this user — nothing to import.')
  const legacy = row.data as LegacyState
  console.log('Legacy blob loaded:', legacy.days.length, 'days,', legacy.habits?.length ?? 0, 'habits')

  // wipe any existing normalized rows so the import is idempotent
  for (const table of ['block_logs', 'habit_logs', 'bucket_tasks', 'design_items', 'blocks', 'habits', 'buckets', 'days', 'profiles']) {
    const { error: delErr } = await sb.from(table).delete().eq('user_id', userId)
    if (delErr) throw new Error(`Clearing ${table} failed: ` + delErr.message)
  }

  // days
  const dayRows = legacy.days.map((d, dow) => ({ user_id: userId, dow, name: d.name, loc: d.loc ?? '' }))
  let res = await sb.from('days').insert(dayRows)
  if (res.error) throw new Error('days insert failed: ' + res.error.message)

  // blocks — keep a map old id → new id so completion history survives
  const blockIdMap = new Map<string, string>()
  for (const [dow, day] of legacy.days.entries()) {
    if (!day.blocks.length) continue
    const rows = day.blocks.map((b, position) => ({
      user_id: userId,
      dow,
      position,
      cat: b.cat,
      title: b.title,
      detail: b.desc ?? '',
      start_min: clamp(b.start ?? 0, 0, 1439),
      dur_min: clamp(b.dur ?? 30, 5, 1440),
      anchored: !!b.anchor,
    }))
    const { data: inserted, error: blkErr } = await sb.from('blocks').insert(rows).select('id, position')
    if (blkErr) throw new Error('blocks insert failed: ' + blkErr.message)
    for (const ins of inserted!) blockIdMap.set(day.blocks[ins.position].id, ins.id)
  }

  // habits
  const habitIdMap = new Map<string, string>()
  for (const [position, h] of (legacy.habits ?? []).entries()) {
    const { data: ins, error: habErr } = await sb
      .from('habits')
      .insert({ user_id: userId, name: h.name, cat: h.cat, days: h.days, position })
      .select('id')
      .single()
    if (habErr) throw new Error('habits insert failed: ' + habErr.message)
    habitIdMap.set(h.id, ins.id)
  }

  // completion logs (skip entries whose block/habit no longer exists)
  const blockLogRows: { user_id: string; block_id: string; done_on: string }[] = []
  for (const [date, ids] of Object.entries(legacy.blockLog ?? {})) {
    for (const oldId of Object.keys(ids)) {
      const newId = blockIdMap.get(oldId)
      if (newId) blockLogRows.push({ user_id: userId, block_id: newId, done_on: date })
    }
  }
  if (blockLogRows.length) {
    res = await sb.from('block_logs').insert(blockLogRows)
    if (res.error) throw new Error('block_logs insert failed: ' + res.error.message)
  }
  const habitLogRows: { user_id: string; habit_id: string; done_on: string }[] = []
  for (const [date, ids] of Object.entries(legacy.habitLog ?? {})) {
    for (const oldId of Object.keys(ids)) {
      const newId = habitIdMap.get(oldId)
      if (newId) habitLogRows.push({ user_id: userId, habit_id: newId, done_on: date })
    }
  }
  if (habitLogRows.length) {
    res = await sb.from('habit_logs').insert(habitLogRows)
    if (res.error) throw new Error('habit_logs insert failed: ' + res.error.message)
  }

  // buckets + tasks
  for (const [position, bk] of (legacy.buckets ?? []).entries()) {
    const { data: ins, error: bkErr } = await sb
      .from('buckets')
      .insert({ user_id: userId, name: bk.name, cat: bk.cat, position })
      .select('id')
      .single()
    if (bkErr) throw new Error('buckets insert failed: ' + bkErr.message)
    if (bk.tasks.length) {
      res = await sb
        .from('bucket_tasks')
        .insert(bk.tasks.map((t, i) => ({ user_id: userId, bucket_id: ins.id, name: t.name, position: i })))
      if (res.error) throw new Error('bucket_tasks insert failed: ' + res.error.message)
    }
  }

  // design day
  const design = legacy.design
  if (design?.items?.length) {
    res = await sb.from('design_items').insert(
      design.items.map((it, position) => ({
        user_id: userId,
        position,
        name: it.name,
        cat: it.cat,
        mins: clamp(it.mins ?? (it.hours ? it.hours * 60 : 60), 30, 960),
      })),
    )
    if (res.error) throw new Error('design_items insert failed: ' + res.error.message)
  }

  res = await sb.from('profiles').insert({
    user_id: userId,
    notes: legacy.notes ?? '',
    design_wake_min: clamp(design?.wake ?? 300, 0, 1439),
  })
  if (res.error) throw new Error('profiles insert failed: ' + res.error.message)

  console.log(
    `Imported: ${blockIdMap.size} blocks, ${habitIdMap.size} habits, ` +
      `${blockLogRows.length} block logs, ${habitLogRows.length} habit logs.`,
  )
  console.log('The legacy `planners` row was left in place as a backup.')
}

main().catch((e) => {
  console.error(e.message ?? e)
  process.exit(1)
})
