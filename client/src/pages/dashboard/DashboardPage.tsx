import { ActiveAttendanceBar } from '../../components/dashboard/ActiveAttendanceBar'
import { DashboardStats } from './DashboardStats'
import { PendingTimeApprovalsCard } from './PendingTimeApprovalsCard'
import {
  BirthdaysCard,
  PendingAbsencesCard,
  UnfilledShiftsCard,
  WeatherCard,
} from './DashboardSideColumn'
import { QuickActions } from './QuickActions'
import { WeeklySchedule } from './WeeklySchedule'
import { WelcomeBanner } from './WelcomeBanner'
import { TuvReportDashboardReminder } from '../../components/tuv/TuvReportDashboardReminder'

const dashboardCardGrid =
  'grid min-w-0 gap-3 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]'

export function DashboardPage() {
  return (
    <div className="min-w-0 w-full max-w-full space-y-3 overflow-x-hidden pb-6">
      <TuvReportDashboardReminder />

      <section
        className="dashboard-top grid min-w-0 grid-cols-1 gap-4 min-[1401px]:grid-cols-[minmax(260px,0.85fr)_minmax(520px,1.15fr)] min-[1401px]:items-start"
        aria-label="Begrüßung und Kennzahlen"
      >
        <div className="min-w-0 max-w-full">
          <WelcomeBanner />
        </div>
        <div className="min-w-0">
          <DashboardStats />
        </div>
      </section>

      <ActiveAttendanceBar />

      <section className="min-w-0 w-full">
        <WeeklySchedule />
      </section>

      <section className={dashboardCardGrid} aria-label="Aktuelle Freigaben und offene Schichten">
        <PendingTimeApprovalsCard />
        <PendingAbsencesCard />
        <UnfilledShiftsCard />
      </section>

      <section className={dashboardCardGrid} aria-label="Weitere Dashboard-Infos">
        <QuickActions />
        <BirthdaysCard />
        <WeatherCard />
      </section>
    </div>
  )
}
