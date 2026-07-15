// Default planner seed, ported from the legacy mockup. Inserted once for a
// brand-new account (the import script replaces this with your real data).
import type { Cat } from './planner'

export interface SeedBlock {
  cat: Cat
  title: string
  detail: string
  startMin: number
  durMin: number
  anchored: boolean
}

export interface SeedDay {
  name: string
  loc: string
  blocks: SeedBlock[]
}

const blk = (
  cat: Cat,
  title: string,
  detail: string,
  startMin: number,
  durMin: number,
  anchored: boolean,
): SeedBlock => ({ cat, title, detail, startMin, durMin, anchored })

function weekday(name: string): SeedDay {
  return {
    name,
    loc: 'Office',
    blocks: [
      blk('life', 'Wake · move · breakfast', 'Out the door by 6:00. Playlist queued last night.', 300, 60, true),
      blk('chin', 'Commute → Chinese audio', '2h, ears only (cramped jeepney/bus). Focused Chinese listening. Noise-isolating earphones.', 360, 120, true),
      blk('work', 'Engineering deep block', 'Hardest ship-task first. No email, no chat.', 480, 120, true),
      blk('work', 'Collaboration + meetings', 'Reviews, standups, pairing. Email window #1.', 0, 120, false),
      blk('life', 'Lunch', '', 0, 30, false),
      blk('devops', 'DevOps micro-lesson', '25 min retrieval-practice / self-quiz. One concept.', 0, 30, false),
      blk('work', 'Execution + shallow batch', 'Deliverables, admin. Email window #2 at 16:00.', 0, 240, false),
      blk('chin', 'Commute → Chinese immersion', '2.5h, ears only. Relaxed native-content listening. Volume over precision.', 1020, 150, true),
      blk('life', 'Home · dinner · reset', '', 0, 45, false),
      blk('exercise', 'Workout', "Short + sustainable (you're just starting). Bodyweight, run, or gym.", 0, 30, false),
      blk('math', 'Math — focused hour', '1h at a desk: measure theory or real analysis. If wiped, trade with the workout — do one, not neither.', 0, 60, false),
      blk('chin', 'Migaku reviews + mining', "15 min: clear SRS reviews, mine sentences from today's audio.", 0, 15, false),
    ],
  }
}

export function defaultDays(): SeedDay[] {
  const mon = weekday('Monday')
  const tue = weekday('Tuesday')
  const wed = weekday('Wednesday')
  const thu = weekday('Thursday')
  const fri: SeedDay = {
    name: 'Friday',
    loc: 'WFH',
    blocks: [
      blk('life', 'Wake · move · breakfast', 'No commute to rush.', 390, 90, true),
      blk('work', 'Extended engineering block', 'Reclaimed commute → a full 3h. Biggest weekly ship-task.', 480, 180, true),
      blk('work', 'Meetings + execution', '', 0, 60, false),
      blk('life', 'Lunch', '', 0, 60, false),
      blk('wqu', 'WQU batch', "Clear the week's activities/quizzes. 45-min timer. Done = done.", 780, 45, true),
      blk('life', 'Weekly review', 'Inbox → zero · check Stats · plan next week.', 0, 60, false),
      blk('exercise', 'Workout', '', 1080, 40, true),
      blk('math', 'Real analysis — reading', 'Lighter desk session to end the week.', 1155, 90, true),
    ],
  }
  const sat: SeedDay = {
    name: 'Saturday',
    loc: 'Open',
    blocks: [
      blk('exercise', 'Workout — longer', "The week's real session. 45–60 min.", 480, 60, true),
      blk('math', 'Measure theory — problems', '3h at a desk, pen on paper. Prove out the week.', 570, 180, true),
      blk('math', 'Real analysis — problems', 'Second track: a proof set.', 840, 120, true),
      blk('chin', 'Chinese — heavy immersion', 'A full episode of native content, relaxed.', 1140, 90, true),
    ],
  }
  const sun: SeedDay = {
    name: 'Sunday',
    loc: 'Open',
    blocks: [
      blk('exercise', 'Active recovery', 'Walk, stretch, light session.', 510, 45, true),
      blk('math', 'Math review + consolidate', 'Redo missed exercises; one-page notes.', 600, 120, true),
      blk('chin', 'Chinese — mining catch-up', "Clear the week's Migaku backlog.", 840, 90, true),
      blk('life', 'Buffer + rest', 'Unscheduled on purpose. Recovery is part of the system.', 960, 120, false),
    ],
  }
  return [mon, tue, wed, thu, fri, sat, sun]
}

export const defaultHabits: { name: string; cat: Cat; days: number[] }[] = [
  { name: 'Exercise', cat: 'exercise', days: [0, 1, 2, 3, 4, 5, 6] },
  { name: 'Chinese immersion', cat: 'chin', days: [0, 1, 2, 3, 4, 5, 6] },
  { name: 'Math (1h+)', cat: 'math', days: [0, 1, 2, 3, 5, 6] },
  { name: 'DevOps micro-lesson', cat: 'devops', days: [0, 1, 2, 3, 4] },
  { name: 'Migaku reviews', cat: 'chin', days: [0, 1, 2, 3, 4, 5, 6] },
]

export const defaultBuckets: { name: string; cat: Cat; tasks: string[] }[] = [
  { name: 'Work', cat: 'work', tasks: ['Engineering deep block', 'Meetings / collaboration', 'Execution / admin', 'DevOps micro-lesson'] },
  { name: 'Chinese', cat: 'chin', tasks: ['Immersion listening', 'Native content', 'Migaku reviews', 'Sentence mining'] },
  { name: 'Math', cat: 'math', tasks: ['Measure theory — reading', 'Measure theory — problems', 'Real analysis', 'Review / consolidate'] },
  { name: 'WQU', cat: 'wqu', tasks: ['Clear activities', 'Quiz / assessment'] },
  { name: 'Routine', cat: 'life', tasks: ['Sleep', 'Commute', 'Eat / meal', 'Shower / prep', 'Family / reset', 'Exercise'] },
]

export const defaultDesignItems: { name: string; cat: Cat; mins: number }[] = [
  { name: 'Wake · breakfast', cat: 'life', mins: 60 },
  { name: '— open —', cat: 'open', mins: 360 },
  { name: 'Lunch', cat: 'life', mins: 60 },
  { name: '— open —', cat: 'open', mins: 480 },
  { name: 'Sleep', cat: 'life', mins: 480 },
]

export const DEFAULT_WAKE_MIN = 300

export const DEFAULT_NOTES =
  'Thesis: in adviser review — reclaims desk time when feedback lands. Keep a running revision-backlog note meanwhile.'
