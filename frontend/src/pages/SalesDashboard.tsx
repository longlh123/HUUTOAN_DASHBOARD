import { useEffect, useState } from 'react'
import type { SalesSummary, PeriodData, RepData, TeamData, PipelineData, KpiQuarterly, DateRange, GroupBy } from '../api/sales'
import { fetchAllSales, fetchPipeline } from '../api/sales'
import { getPresetRange, prevYearRange } from '../utils/date'
import { KpiCards } from '../components/KpiCards'
import { RevenueChart } from '../components/RevenueChart'
import { SalesLeaderboard } from '../components/SalesLeaderboard'
import { SalesTeamLeaderboard } from '../components/SalesTeamLeaderboard'
import { DateRangeFilter } from '../components/DateRangeFilter'
import { PipelineHealth } from '../components/PipelineHealth'
import { TerritoryFilter } from '../components/TerritoryFilter'
import type { Territory } from '../components/TerritoryFilter'
import { useAuth } from '../contexts/AuthContext'

export function SalesDashboard() {
  const { user } = useAuth()
  const isAdmin = user?.is_admin ?? true

  const [range,       setRange]       = useState<DateRange>(getPresetRange('year'))
  const [groupBy,     setGroupBy]     = useState<GroupBy>('quarter')
  const [territory,   setTerritory]   = useState<Territory>(
    !isAdmin && user?.territory ? user.territory as Territory : 'ALL'
  )
  const [department,  setDepartment]  = useState<string | undefined>(undefined)
  const [departments, setDepartments] = useState<string[]>([])

  const [summary,        setSummary]        = useState<SalesSummary | null>(null)
  const [prevSummary,    setPrevSummary]    = useState<SalesSummary | null>(null)
  const [periodData,     setPeriodData]     = useState<PeriodData[]>([])
  const [prevPeriodData, setPrevPeriodData] = useState<PeriodData[]>([])
  const [repData,        setRepData]        = useState<RepData[]>([])
  const [teamData,       setTeamData]       = useState<TeamData[]>([])
  const [kpiQuarterly,   setKpiQuarterly]   = useState<KpiQuarterly | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [fetching,       setFetching]       = useState(false)
  const [error,          setError]          = useState<string | null>(null)

  const [pipelineData,     setPipelineData]     = useState<PipelineData | null>(null)
  const [pipelineLoading,  setPipelineLoading]  = useState(true)
  const [pipelineFetching, setPipelineFetching] = useState(false)
  const [pipelineReached,  setPipelineReached]  = useState(false)

  const [activeSection, setActiveSection] = useState<'performance' | 'pipeline'>('performance')

  useEffect(() => {
    if (!isAdmin || teamData.length === 0) return
    setDepartments(prev => {
      if (prev.length > 0) return prev
      return Array.from(new Set(teamData.map(t => t.department).filter(Boolean))).sort()
    })
  }, [isAdmin, teamData])

  useEffect(() => {
    if (summary === null) setLoading(true)
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
        setRepData(curr.by_rep)
        setTeamData(curr.by_team)
        setKpiQuarterly(curr.kpi)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => { setLoading(false); setFetching(false) })
  }, [range, groupBy, territory, department])

  useEffect(() => {
    if (!pipelineReached) return
    if (pipelineData === null) setPipelineLoading(true)
    setPipelineFetching(true)
    fetchPipeline(territory, department)
      .then(setPipelineData)
      .catch(() => {})
      .finally(() => { setPipelineLoading(false); setPipelineFetching(false) })
  }, [territory, department, pipelineReached])

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id as 'performance' | 'pipeline')
            if (entry.target.id === 'pipeline') setPipelineReached(true)
          }
        }
      },
      { rootMargin: '0px 0px -80% 0px' }
    )
    const perf = document.getElementById('performance')
    const pipe = document.getElementById('pipeline')
    if (perf) obs.observe(perf)
    if (pipe) obs.observe(pipe)
    return () => obs.disconnect()
  }, [])

  function scrollTo(id: 'performance' | 'pipeline') {
    setActiveSection(id)
    if (id === 'pipeline') setPipelineReached(true)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <div className="dashboard__title-row">
          <h1 className="dashboard__title">Hieu suat ban hang</h1>
          {fetching && !loading && <span className="dashboard__refreshing">Dang cap nhat...</span>}
        </div>
        <div className="dashboard__filters">
          {isAdmin && departments.length > 0 && (
            <div className="territory-filter">
              <button
                className={`date-filter__btn${department === undefined ? ' date-filter__btn--active' : ''}`}
                onClick={() => setDepartment(undefined)}
              >
                Tat ca
              </button>
              {departments.map(d => (
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
          <DateRangeFilter onChange={(r, g) => { setRange(r); setGroupBy(g) }} />
        </div>
      </div>

      {error && <div className="dashboard__error">{error}</div>}

      <nav className="section-nav">
        <button
          className={`section-nav__link${activeSection === 'performance' ? ' section-nav__link--active' : ''}`}
          onClick={() => scrollTo('performance')}
        >
          Hieu suat
        </button>
        <button
          className={`section-nav__link${activeSection === 'pipeline' ? ' section-nav__link--active' : ''}`}
          onClick={() => scrollTo('pipeline')}
        >
          Pipeline Health
        </button>
      </nav>

      <section id="performance" className="dashboard-section">
        <KpiCards summary={summary} prevSummary={prevSummary} loading={loading} />
        <RevenueChart data={periodData} prevData={prevPeriodData} loading={loading} groupBy={groupBy} quarterlyTargets={kpiQuarterly ?? undefined} />
        <SalesTeamLeaderboard data={teamData} loading={loading} />
        <SalesLeaderboard data={repData} loading={loading} />
      </section>

      <section id="pipeline" className="dashboard-section">
        <div className="section-divider">
          <div className="dashboard__title-row">
            <h2 className="section-divider__title">Pipeline Health</h2>
            {pipelineFetching && !pipelineLoading && <span className="dashboard__refreshing">Dang cap nhat...</span>}
          </div>
          <p className="section-divider__sub">Cac co hoi dang mo — khong loc theo ngay</p>
        </div>
        <PipelineHealth data={pipelineData} loading={pipelineLoading} />
      </section>
    </div>
  )
}
