import { useState } from 'react'
import { useSession } from './lib/useSession'
import { usePlanner, usePlannerActions, type PlannerData, type PlannerActions } from './lib/queries/planner'
import { SignIn } from './features/auth/SignIn'
import { TodayView } from './features/today/TodayView'
import { WeekView } from './features/week/WeekView'
import { HabitsView } from './features/habits/HabitsView'
import { StatsView } from './features/stats/StatsView'
import { ReportView } from './features/report/ReportView'
import { DesignView } from './features/design/DesignView'
import { AccountView } from './features/account/AccountView'

const TABS = ['Today', 'Week', 'Habits', 'Stats', 'Report', 'Design', 'Account'] as const
type Tab = (typeof TABS)[number]

export interface ViewProps {
  data: PlannerData
  actions: PlannerActions
  today: Date
}

export default function App() {
  const { session, loading } = useSession()
  if (loading) return null
  if (!session) return <SignIn />
  return <Planner userId={session.user.id} email={session.user.email ?? ''} />
}

function Planner({ userId, email }: { userId: string; email: string }) {
  const [tab, setTab] = useState<Tab>('Today')
  const { data, isPending, isError, error, isFetching } = usePlanner(userId)
  const actions = usePlannerActions(userId)
  const today = new Date()

  if (isPending)
    return (
      <div className="grid min-h-screen place-items-center text-sm" style={{ color: 'var(--ink-faint)' }}>
        Loading your planner…
      </div>
    )
  if (isError)
    return (
      <div className="grid min-h-screen place-items-center p-6 text-sm" style={{ color: 'var(--danger)' }}>
        Couldn't load the planner: {error.message}
      </div>
    )

  const viewProps: ViewProps = { data, actions, today }

  return (
    <div className="mx-auto max-w-[1120px] px-[22px] pb-[100px]">
      <header className="pt-10">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="ml-auto text-[11px] tracking-[0.03em]"
            style={{ fontFamily: 'var(--mono)', color: 'var(--ink-faint)' }}
          >
            {isFetching ? 'syncing…' : 'synced'}
          </span>
        </div>
        <div className="mt-2 flex gap-0.5 overflow-x-auto border-b" style={{ borderColor: 'var(--line)' }}>
          {TABS.map((t) => (
            <button key={t} className={'tab' + (t === tab ? ' active' : '')} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
      </header>
      <main className="pt-[26px]">
        {tab === 'Today' && <TodayView {...viewProps} />}
        {tab === 'Week' && <WeekView {...viewProps} />}
        {tab === 'Habits' && <HabitsView {...viewProps} />}
        {tab === 'Stats' && <StatsView {...viewProps} />}
        {tab === 'Report' && <ReportView {...viewProps} />}
        {tab === 'Design' && <DesignView {...viewProps} />}
        {tab === 'Account' && <AccountView data={data} email={email} />}
      </main>
    </div>
  )
}
