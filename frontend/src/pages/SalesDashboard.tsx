import { useEffect, useState } from 'react'
import type { SalesSummary, PeriodData, TeamData, PipelineData, GapToTargetItem, KpiQuarterly, OppQualityRow, DateRange, GroupBy } from '../api/sales'
import { fetchAllSales, fetchPipeline, fetchGapToTarget, fetchOppQuality } from '../api/sales'
import { getPresetRange, prevYearRange } from '../utils/date'
import { KpiCards } from '../components/KpiCards'
import { RevenueChart } from '../components/RevenueChart'
import { SalesLeaderboard } from '../components/SalesLeaderboard'
import { SalesTeamLeaderboard } from '../components/SalesTeamLeaderboard'
import { DateRangeFilter } from '../components/DateRangeFilter'
import { PipelineHealth } from '../components/PipelineHealth'
import { OppQualityTable } from '../components/OppQualityTable'
import { TerritoryFilter } from '../components/TerritoryFilter'
import { WeeklyWonChart } from '../components/WeeklyWonChart'
import { TeamTargetChart } from '../components/TeamTargetChart'
import { TopAccountsTable } from '../components/TopAccountsTable'
import type { Territory } from '../components/TerritoryFilter'
import { useAuth } from '../contexts/AuthContext'

type Tab = 'performance' | 'pipeline' | 'quality'

export function SalesDashboard() {
  const { user } = useAuth()
  const isAdmin = user?.is_admin ?? true

  const [activeTab,    setActiveTab]    = useState<Tab>('performance')
  const [range,        setRange]        = useState<DateRange>(getPresetRange('year'))
  const [groupBy,      setGroupBy]      = useState<GroupBy>('quarter')
  const [territory,    setTerritory]    = useState<Territory>(
    !isAdmin && user?.territory ? user.territory as Territory : 'ALL'
  )
  const [department,   setDepartment]   = useState<string | undefined>(undefined)

  const [summary,        setSummary]        = useState<SalesSummary | null>(null)
  const [prevSummary,    setPrevSummary]    = useState<SalesSummary | null>(null)
  const [periodData,     setPeriodData]     = useState<PeriodData[]>([])
  const [prevPeriodData, setPrevPeriodData] = useState<PeriodData[]>([])
  const [teamData,       setTeamData]       = useState<TeamData[]>([])
  const [kpiQuarterly,   setKpiQuarterly]   = useState<KpiQuarterly | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [fetching,       setFetching]       = useState(false)
  const [error,          setError]          = useState<string | null>(null)

  const [pipelineData,     setPipelineData]     = useState<PipelineData | null>(null)
  const [pipelineLoading,  setPipelineLoading]  = useState(true)
  const [pipelineFetching, setPipelineFetching] = useState(false)
  const [pipelineVisited,  setPipelineVisited]  = useState(false)

  const [gapData,    setGapData]    = useState<GapToTargetItem[]>([])
  const [gapLoading, setGapLoading] = useState(true)

  const [qualityData,     setQualityData]     = useState<OppQualityRow[]>([])
  const [qualityLoading,  setQualityLoading]  = useState(true)
  const [qualityFetching, setQualityFetching] = useState(false)
  const [qualityVisited,  setQualityVisited]  = useState(false)

  const [allDepartments, setAllDepartments] = useState<string[]>([])

  useEffect(() => {
    setFetching(true)
    setError(null)
    Promise.all([
      fetchAllSales(range, groupBy, territory, department),
      fetchAllSales(prevYearRange(range), groupBy, territory, department),
    ])
      .then(([curr, prev]) => {
        setSummary(curr.summary)
        setPrevSummary(prev.summary)
        setPeriodData(curr.by_period)
        setPrevPeriodData(prev.by_period)

        setTeamData(curr.by_team)
        setKpiQuarterly(curr.kpi)

        // Chỉ cập nhật danh sách allDepartments khi fetch không có department filter
        // để tránh mất các department khác khi đang lọc
        if (!department && isAdmin) {
          setAllDepartments(
            Array.from(new Set(curr.by_team.map((t: TeamData) => t.department).filter(Boolean))).sort() as string[]
          )
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => { setLoading(false); setFetching(false) })
  }, [range, groupBy, territory, department])

  useEffect(() => {
    if (!pipelineVisited) return
    setPipelineFetching(true)
    fetchPipeline(territory, department)
      .then(setPipelineData)
      .catch(() => {})
      .finally(() => { setPipelineLoading(false); setPipelineFetching(false) })
  }, [territory, department, pipelineVisited])

  useEffect(() => {
    if (!pipelineVisited) return
    setGapLoading(true)
    const year = parseInt(range.from.slice(0, 4))
    fetchGapToTarget(year, territory, department)
      .then(setGapData)
      .catch(() => {})
      .finally(() => setGapLoading(false))
  }, [territory, department, range, pipelineVisited])

  useEffect(() => {
    if (!qualityVisited) return
    setQualityFetching(true)
    fetchOppQuality(territory, department)
      .then(setQualityData)
      .catch(() => {})
      .finally(() => { setQualityLoading(false); setQualityFetching(false) })
  }, [territory, department, qualityVisited])

  function switchTab(tab: Tab) {
    setActiveTab(tab)
    if (tab === 'pipeline') setPipelineVisited(true)
    if (tab === 'quality')  setQualityVisited(true)
  }

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <nav className="section-nav section-nav--inline">
          <button
            className={`section-nav__link${activeTab === 'performance' ? ' section-nav__link--active' : ''}`}
            onClick={() => switchTab('performance')}
          >
            Sales Performance
          </button>
          <button
            className={`section-nav__link${activeTab === 'pipeline' ? ' section-nav__link--active' : ''}`}
            onClick={() => switchTab('pipeline')}
          >
            Pipeline Health
          </button>
          <button
            className={`section-nav__link${activeTab === 'quality' ? ' section-nav__link--active' : ''}`}
            onClick={() => switchTab('quality')}
          >
            Opportunity Quality
          </button>
        </nav>
        <div className="dashboard__filters">
          {isAdmin && allDepartments.length > 0 && (
            <div className="territory-filter">
              <button
                className={`date-filter__btn${department === undefined ? ' date-filter__btn--active' : ''}`}
                onClick={() => setDepartment(undefined)}
              >
                Tat ca
              </button>
              {allDepartments.map(d => (
                <button
                  key={d}
                  className={`date-filter__btn${department === d ? ' date-filter__btn--active' : ''}`}
                  onClick={() => setDepartment(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          )}
          <TerritoryFilter value={territory} onChange={setTerritory} disabled={!isAdmin} />
        </div>
      </div>

      {error && <div className="dashboard__error">{error}</div>}

      {activeTab === 'performance' && (
        <div className="dashboard-section">
          <div className="dashboard__tab-toolbar">
            <DateRangeFilter onChange={(r, g) => { setRange(r); setGroupBy(g) }} />
            {fetching && !loading && <span className="dashboard__refreshing">Dang cap nhat...</span>}
          </div>
          <KpiCards summary={summary} prevSummary={prevSummary} loading={loading} />
          <RevenueChart data={periodData} prevData={prevPeriodData} loading={loading} groupBy={groupBy} quarterlyTargets={kpiQuarterly ?? undefined} />
          <div className="row-2col">
            <WeeklyWonChart territory={territory} department={department} />
            <TeamTargetChart data={teamData} loading={loading} />
          </div>
          <SalesTeamLeaderboard territory={territory} department={department} range={range} />
          <SalesLeaderboard territory={territory} department={department} range={range} />
          <TopAccountsTable territory={territory} department={department} range={range} />
        </div>
      )}

      {activeTab === 'pipeline' && (
        <div className="dashboard-section">
          <div className="dashboard__tab-toolbar">
            <p className="section-divider__sub">Cac co hoi dang mo — khong loc theo ngay</p>
            {pipelineFetching && !pipelineLoading && <span className="dashboard__refreshing">Dang cap nhat...</span>}
          </div>
          <PipelineHealth data={pipelineData} loading={pipelineLoading} gapData={gapData} gapLoading={gapLoading} />
        </div>
      )}

      {activeTab === 'quality' && (
        <div className="dashboard-section">
          <div className="dashboard__tab-toolbar">
            <p className="section-divider__sub">Do chat luong nhap lieu va quy trinh cham soc — chi tinh Opp chua co hop dong won</p>
            {qualityFetching && !qualityLoading && <span className="dashboard__refreshing">Dang cap nhat...</span>}
          </div>
          <OppQualityTable data={qualityData} loading={qualityLoading} />
        </div>
      )}
    </div>
  )
}
