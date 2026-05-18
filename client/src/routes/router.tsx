import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate, Outlet, useParams } from 'react-router-dom'
import { RouteLoading } from '../components/ui/RouteLoading'
import { AppLayout } from '../layouts/AppLayout'
import { TerminalLayout } from '../layouts/TerminalLayout'
import { AuthLayout } from '../layouts/AuthLayout'
import { AccountPage } from '../pages/account/AccountPage'
import { BillingDocumentsPage } from '../pages/account/BillingDocumentsPage'
import { BillingPage } from '../pages/account/BillingPage'
import { DevicesPage } from '../pages/account/DevicesPage'
import { UsersPage } from '../pages/account/UsersPage'
import { AbsencesPage } from '../pages/absences/AbsencesPage'
import { LoginPage } from '../pages/auth/LoginPage'
import { CalendarPage } from '../pages/calendar/CalendarPage'
import { AnnouncementsPage } from '../pages/communication/AnnouncementsPage'
import { ChatGroupsPage } from '../pages/communication/ChatGroupsPage'
import { ContactsPage } from '../pages/contacts/ContactsPage'
import { RepresentativesPage } from '../pages/organisation/RepresentativesPage'
import { CountersPage } from '../pages/counters/CountersPage'
import { DashboardPage } from '../pages/dashboard/DashboardPage'
import { DocumentsPage } from '../pages/documents/DocumentsPage'
import { StationProvider } from '../context/station-context'
import { WorkAreasProvider } from '../context/work-areas-context'
import { EmployeesProvider } from '../context/employees-context'
import { ScheduleShiftsProvider } from '../context/schedule-shifts-context'
import { AbsencesProvider } from '../context/absences-context'
import { TasksProvider } from '../context/tasks-context'
import { TimeTrackingProvider } from '../context/time-tracking-context'
import { EmployeeProfilePage } from '../pages/employees/EmployeeProfilePage'
import { EmployeesLayout } from '../pages/employees/EmployeesLayout'
import { EmployeesPage } from '../pages/employees/EmployeesPage'
import { HolidaysPage } from '../pages/holidays/HolidaysPage'
import { ListsPage } from '../pages/lists/ListsPage'
import { ModulesPage } from '../pages/modules/ModulesPage'
import { SchedulePage } from '../pages/schedule/SchedulePage'
import { AccessSettingsPage } from '../pages/settings/AccessSettingsPage'
import { EmailSettingsPage } from '../pages/settings/EmailSettingsPage'
import { GeneralSettingsPage } from '../pages/settings/GeneralSettingsPage'
import { AppearanceSettingsPage } from '../pages/settings/AppearanceSettingsPage'
import { MinimumWageSettingsPage } from '../pages/settings/MinimumWageSettingsPage'
import { StationsPage } from '../pages/stations/StationsPage'
import { TasksPage } from '../pages/tasks/TasksPage'
import { VacationBlocksPage } from '../pages/vacationBlocks/VacationBlocksPage'
import { WorkAreasPage } from '../pages/workAreas/WorkAreasPage'
import { StaffTerminalPage } from '../pages/terminal/StaffTerminalPage'
import { TabletLandingPage } from '../pages/terminal/TabletLandingPage'
import { TabletTokenLayout } from '../pages/terminal/TabletTokenLayout'
import { SidebarProvider } from '../store/sidebar-context'
import { RequireAuth } from '../components/auth/RequireAuth'
import { EmployeeAppLayout } from '../layouts/EmployeeAppLayout'
import { EmployeeAccessPage } from '../pages/employee-app/EmployeeAccessPage'
import { EmployeeAppPage } from '../pages/employee-app/EmployeeAppPage'
import { LandingChoicePage } from '../pages/employee-app/LandingChoicePage'
import { MarketingLayout } from '../layouts/MarketingLayout'
import {
  MarketingDemoPage,
  MarketingFeaturesPage,
  MarketingHomePage,
  MarketingLegalPage,
  MarketingPricingPage,
} from '../pages/marketing/MarketingPages'
import { RegisterPage } from '../pages/auth/RegisterPage'
import { SetupPage } from '../pages/setup/SetupPage'
import { TabletPairPage } from '../pages/terminal/TabletPairPage'
import { AppHubPage } from '../pages/app/AppHubPage'
import { SavedLocalAccessPage } from '../pages/app/SavedLocalAccessPage'
import { TimeApprovalsPage } from '../pages/time-approvals/TimeApprovalsPage'
import { TuvReportsPage } from '../pages/tuv/TuvReportsPage'
import { TuvReportEditorPage } from '../pages/tuv/TuvReportEditorPage'
import { TabletTerminalProvider } from '../context/tablet-terminal-context'

const PayrollTimePage = lazy(() =>
  import('../pages/reports/PayrollTimePage').then((m) => ({ default: m.PayrollTimePage })),
)
const PayrollSchedulePage = lazy(() =>
  import('../pages/reports/PayrollSchedulePage').then((m) => ({ default: m.PayrollSchedulePage })),
)
const PayrollSummaryPage = lazy(() =>
  import('../pages/reports/PayrollSummaryPage').then((m) => ({ default: m.PayrollSummaryPage })),
)
const PayrollSummaryEmployeeDetailPage = lazy(() =>
  import('../pages/reports/PayrollSummaryEmployeeDetailPage').then((m) => ({
    default: m.PayrollSummaryEmployeeDetailPage,
  })),
)
const TaskReportsPage = lazy(() =>
  import('../pages/reports/TaskReportsPage').then((m) => ({ default: m.TaskReportsPage })),
)
const AbsenceReportsPage = lazy(() =>
  import('../pages/reports/AbsenceReportsPage').then((m) => ({ default: m.AbsenceReportsPage })),
)
const PayrollAuditPage = lazy(() =>
  import('../pages/reports/PayrollAuditPage').then((m) => ({ default: m.PayrollAuditPage })),
)

function LazyReport({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteLoading />}>{children}</Suspense>
}

function MitarbeiterToEmployeesProfile() {
  const { employeeId } = useParams()
  return <Navigate to={`/employees/${employeeId ?? ''}`} replace />
}

function LegacyEmployeeAccessToEmployee() {
  const { token } = useParams()
  const t = (token ?? '').trim()
  if (!t) return <Navigate to="/employee" replace />
  return <Navigate to={`/employee/${encodeURIComponent(t)}`} replace />
}

export const router = createBrowserRouter([
  {
    element: <MarketingLayout />,
    children: [
      { index: true, element: <MarketingHomePage /> },
      { path: 'funktionen', element: <MarketingFeaturesPage /> },
      { path: 'preise', element: <MarketingPricingPage /> },
      { path: 'demo', element: <MarketingDemoPage /> },
      { path: 'datenschutz', element: <MarketingLegalPage kind="privacy" /> },
      { path: 'impressum', element: <MarketingLegalPage kind="imprint" /> },
      { path: 'agb', element: <MarketingLegalPage kind="terms" /> },
    ],
  },
  { path: '/registrieren', element: <RegisterPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/setup', element: <SetupPage /> },
  {
    path: '/login',
    element: <AuthLayout />,
    children: [{ index: true, element: <LoginPage /> }],
  },
  {
    path: '/app',
    element: <AppHubPage />,
  },
  {
    path: '/app/zugaenge',
    element: <SavedLocalAccessPage />,
  },
  {
    path: '/employee-access/:token',
    element: <LegacyEmployeeAccessToEmployee />,
  },
  {
    path: '/employee-app',
    element: <Navigate to="/employee" replace />,
  },
  {
    path: '/employee',
    element: <EmployeeAppLayout />,
    children: [{ index: true, element: <EmployeeAppPage /> }],
  },
  {
    path: '/employee/:token',
    element: <EmployeeAppLayout />,
    children: [{ index: true, element: <EmployeeAccessPage /> }],
  },
  {
    path: '/tablet',
    element: <TabletLandingPage />,
  },
  { path: '/tablet/pair', element: <TabletPairPage /> },
  {
    path: '/tablet/dev',
    element: (
      <StationProvider>
        <TabletTerminalProvider>
          <TerminalLayout />
        </TabletTerminalProvider>
      </StationProvider>
    ),
    children: [{ index: true, element: <StaffTerminalPage /> }],
  },
  {
    path: '/tablet/:tabletToken',
    element: <TabletTokenLayout />,
    children: [{ index: true, element: <StaffTerminalPage /> }],
  },
  {
    path: '/station-terminal',
    element: <Navigate to={import.meta.env.PROD ? '/tablet' : '/tablet/dev'} replace />,
  },
  {
    path: '/mitarbeiter-terminal',
    element: <Navigate to={import.meta.env.PROD ? '/tablet' : '/tablet/dev'} replace />,
  },
  {
    path: '/staff-terminal',
    element: <Navigate to={import.meta.env.PROD ? '/tablet' : '/tablet/dev'} replace />,
  },
  { path: '/start', element: <LandingChoicePage /> },
  {
    element: (
      <RequireAuth>
        <SidebarProvider>
          <WorkAreasProvider>
            <EmployeesProvider>
              <ScheduleShiftsProvider>
                <AbsencesProvider>
                  <TimeTrackingProvider>
                    <Outlet />
                  </TimeTrackingProvider>
                </AbsencesProvider>
              </ScheduleShiftsProvider>
            </EmployeesProvider>
          </WorkAreasProvider>
        </SidebarProvider>
      </RequireAuth>
    ),
    children: [
      {
        element: <AppLayout />,
        children: [
      {
        path: 'dashboard',
        element: <DashboardPage />,
        handle: { title: 'Dashboard' },
      },
      {
        path: 'communication/chat-groups',
        element: <ChatGroupsPage />,
        handle: { title: 'Chat-Gruppen' },
      },
      {
        path: 'communication/announcements',
        element: <AnnouncementsPage />,
        handle: { title: 'Mitteilungen' },
      },
      {
        path: 'schedule',
        element: <SchedulePage />,
        handle: { title: 'Schichtplan' },
      },
      {
        path: 'schichtplan',
        element: <SchedulePage />,
        handle: { title: 'Schichtplan' },
      },
      {
        path: 'absences',
        element: <AbsencesPage />,
        handle: { title: 'Abwesenheiten' },
      },
      {
        path: 'abwesenheiten',
        element: <Navigate to="/absences" replace />,
        handle: { title: 'Abwesenheiten' },
      },
      {
        path: 'tasks',
        element: (
          <TasksProvider>
            <TasksPage />
          </TasksProvider>
        ),
        handle: { title: 'Aufgaben' },
      },
      {
        path: 'aufgaben',
        element: <Navigate to="/tasks" replace />,
        handle: { title: 'Aufgaben' },
      },
      {
        path: 'lists',
        element: <ListsPage />,
        handle: { title: 'Listen' },
      },
      {
        path: 'documents',
        element: <DocumentsPage />,
        handle: { title: 'Dokumente' },
      },
      {
        path: 'calendar',
        element: <CalendarPage />,
        handle: { title: 'Terminkalender' },
      },
      {
        path: 'contacts',
        element: <ContactsPage />,
        handle: { title: 'Kontakte' },
      },
      {
        path: 'organisation/representatives',
        element: <RepresentativesPage />,
        handle: { title: 'Vertreter & Telefonnummern' },
      },
      {
        path: 'counters',
        element: <CountersPage />,
        handle: { title: 'Zählerstände' },
      },
      {
        path: 'employees',
        element: <EmployeesLayout />,
        handle: { title: 'Mitarbeiter' },
        children: [
          { index: true, element: <EmployeesPage /> },
          {
            path: ':employeeId',
            element: <EmployeeProfilePage />,
            handle: { title: 'Mitarbeiterprofil' },
          },
        ],
      },
      {
        path: 'mitarbeiter',
        element: <Navigate to="/employees" replace />,
        handle: { title: 'Mitarbeiter' },
      },
      {
        path: 'mitarbeiter/:employeeId',
        element: <MitarbeiterToEmployeesProfile />,
        handle: { title: 'Mitarbeiterprofil' },
      },
      {
        path: 'work-areas',
        element: <WorkAreasPage />,
        handle: { title: 'Arbeitsbereiche' },
      },
      {
        path: 'vacation-blocks',
        element: <VacationBlocksPage />,
        handle: { title: 'Urlaubssperren' },
      },
      {
        path: 'holidays',
        element: <HolidaysPage />,
        handle: { title: 'Feiertage' },
      },
      {
        path: 'tuv-berichte',
        element: <TuvReportsPage />,
        handle: { title: 'Monatlicher TÜV-Bericht' },
      },
      {
        path: 'tuv-berichte/:reportId',
        element: <TuvReportEditorPage />,
        handle: { title: 'TÜV-Bericht bearbeiten' },
      },
      {
        path: 'monthly-tuv-reports',
        element: <Navigate to="/tuv-berichte" replace />,
      },
      {
        path: 'reports/payroll-time',
        element: (
          <LazyReport>
            <PayrollTimePage />
          </LazyReport>
        ),
        handle: { title: 'Lohnabrechnung (Zeiterfassung)' },
      },
      {
        path: 'reports/payroll-time-tracking',
        element: (
          <LazyReport>
            <PayrollTimePage />
          </LazyReport>
        ),
        handle: { title: 'Lohnabrechnung (Zeiterfassung)' },
      },
      {
        path: 'reports/payroll-schedule',
        element: (
          <LazyReport>
            <PayrollSchedulePage />
          </LazyReport>
        ),
        handle: { title: 'Lohnabrechnung (Schichtplan)' },
      },
      {
        path: 'reports/payroll-summary',
        element: (
          <LazyReport>
            <PayrollSummaryPage />
          </LazyReport>
        ),
        handle: { title: 'Lohnabrechnung Zusammenfassung' },
      },
      {
        path: 'reports/payroll-audit',
        element: (
          <LazyReport>
            <PayrollAuditPage />
          </LazyReport>
        ),
        handle: { title: 'Lohnprüfung' },
      },
      {
        path: 'reports/payroll-summary/employee/:employeeId',
        element: (
          <LazyReport>
            <PayrollSummaryEmployeeDetailPage />
          </LazyReport>
        ),
        handle: { title: 'Lohnabrechnung · Mitarbeiter-Detail' },
      },
      {
        path: 'reports/tasks',
        element: (
          <LazyReport>
            <TaskReportsPage />
          </LazyReport>
        ),
        handle: { title: 'Auswertung Aufgaben' },
      },
      {
        path: 'reports/absences',
        element: (
          <LazyReport>
            <AbsenceReportsPage />
          </LazyReport>
        ),
        handle: { title: 'Auswertung Abwesenheiten' },
      },
      {
        path: 'auswertungen/abwesenheiten',
        element: <Navigate to="/reports/absences" replace />,
        handle: { title: 'Auswertung Abwesenheiten' },
      },
      {
        path: 'settings/general',
        element: <GeneralSettingsPage />,
        handle: { title: 'Einstellungen · Allgemein' },
      },
      {
        path: 'settings/email',
        element: <EmailSettingsPage />,
        handle: { title: 'E-Mail-Benachrichtigungen' },
      },
      {
        path: 'settings/appearance',
        element: <AppearanceSettingsPage />,
        handle: { title: 'Ansicht / Darstellung' },
      },
      {
        path: 'settings/minimum-wage',
        element: <MinimumWageSettingsPage />,
        handle: { title: 'Einstellungen · Mindestlohn' },
      },
      {
        path: 'settings/access',
        element: <AccessSettingsPage />,
        handle: { title: 'Zugriffsberechtigungen' },
      },
      {
        path: 'einstellungen/zugriffsberechtigungen',
        element: <Navigate to="/settings/access" replace />,
      },
      {
        path: 'account',
        element: <AccountPage />,
        handle: { title: 'Mein Konto' },
      },
      {
        path: 'account/devices',
        element: <DevicesPage />,
        handle: { title: 'Geräte & Apps' },
      },
      {
        path: 'account/users',
        element: <UsersPage />,
        handle: { title: 'Benutzer verwalten' },
      },
      {
        path: 'account/billing',
        element: <BillingPage />,
        handle: { title: 'Rechnungen' },
      },
      {
        path: 'account/billing-documents',
        element: <BillingDocumentsPage />,
        handle: { title: 'Abrechnungsunterlagen' },
      },
      {
        path: 'stations',
        element: <StationsPage />,
        handle: { title: 'Stationen verwalten' },
      },
      {
        path: 'modules',
        element: <ModulesPage />,
        handle: { title: 'Module verwalten' },
      },
      {
        path: 'einstellungen',
        element: <Navigate to="/settings/general" replace />,
        handle: { title: 'Einstellungen' },
      },
      {
        path: 'zeiterfassung/freigaben',
        element: <TimeApprovalsPage />,
        handle: { title: 'Zeitfreigaben' },
      },
      {
        path: 'time-tracking/approvals',
        element: <Navigate to="/zeiterfassung/freigaben" replace />,
        handle: { title: 'Zeitfreigaben' },
      },
      {
        path: 'zeiterfassung',
        element: <Navigate to="/reports/payroll-time" replace />,
        handle: { title: 'Zeiterfassung' },
      },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
