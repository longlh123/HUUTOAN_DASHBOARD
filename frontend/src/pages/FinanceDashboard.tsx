import { useEffect, useState } from 'react'
import type { FinanceSummary, FinancePeriodData, PeriodData, DateRange, GroupBy, DebtAging, CostComparison, AdvanceLedger } from '../api/sales'
import { fetchFinanceSummary, fetchFinanceByPeriod, fetchDebtAging, fetchCostComparison, fetchAdvanceLedger } from '../api/sales'
import { getPresetRange, prevYearRange } from '../utils/date'
import { FinanceKpiCards } from '../components/FinanceKpiCards'
import { RevenueChart } from '../components/RevenueChart'
import { DebtDashboard } from '../components/DebtDashboard'
import { CostComparisonTable } from '../components/CostComparisonTable'
import { AdvanceLedgerTable } from '../components/AdvanceLedgerTable'
import { DateRangeFilter } from '../components/DateRangeFilter'
import { TerritoryFilter } from '../components/TerritoryFilter'
import type { Territory } from '../components/TerritoryFilter'
import { useAuth } from '../contexts/AuthContext'

type Tab = 'revenue' | 'debt' | 'cost' | 'advance'

function toPeriodData(data: FinancePeriodData[]): PeriodData[] {
  return data.map(d => ({ period: d.period, value: d.value, deals: d.count }))
}

export function FinanceDashboard() {
  const { user } = useAuth()
  const isAdmin  = user?.is_admin ?? true

  const [activeTab, setActiveTab] = useState<Tab>('revenue')

  const [range,     setRange]     = useState<DateRange>(getPresetRange('year'))
  const [groupBy,   setGroupBy]   = useState<GroupBy>('quarter')
  const [territory, setTerritory] = useState<Territory>(
    !isAdmin && user?.territory ? user.territory as Territory : 'ALL'
  )

  const [summary,        setSummary]        = useState<FinanceSummary | null>(null)
  const [prevSummary,    setPrevSummary]    = useState<FinanceSummary | null>(null)
  const [periodData,     setPeriodData]     = useState<FinancePeriodData[]>([])
  const [prevPeriodData, setPrevPeriodData] = useState<FinancePeriodData[]>([])
  const [loading,        setLoading]        = useState(true)
  const [fetching,       setFetching]       = useState(false)
  const [error,          setError]          = useState<string | null>(null)

  const [debtAging,        setDebtAging]        = useState<DebtAging | null>(null)
  const [debtAgingLoading, setDebtAgingLoading] = useState(true)
  const [debtVisited,      setDebtVisited]      = useState(false)

  const [costComparison,        setCostComparison]        = useState<CostComparison | null>(null)
  const [costComparisonLoading, setCostComparisonLoading] = useState(true)
  const [costVisited,           setCostVisited]           = useState(false)

  const [advanceLedger,        setAdvanceLedger]        = useState<AdvanceLedger | null>(null)
  const [advanceLedgerLoading, setAdvanceLedgerLoading] = useState(true)
  const [advanceVisited,       setAdvanceVisited]       = useState(false)

  useEffect(() => {
    setFetching(true)
    setError(null)
    Promise.all([
      fetchFinanceSummary(range, territory),
      fetchFinanceSummary(prevYearRange(range), territory),
      fetchFinanceByPeriod(range, groupBy, territory),
      fetchFinanceByPeriod(prevYearRange(range), groupBy, territory),
    ])
      .then(([curr, prev, currPeriod, prevPeriod]) => {
        setSummary(curr)
        setPrevSummary(prev)
        setPeriodData(currPeriod)
        setPrevPeriodData(prevPeriod)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => { setLoading(false); setFetching(false) })
  }, [range, groupBy, territory])

  // Công nợ không lọc theo kỳ/territory — luôn là số dư hiện tại, chỉ fetch khi vào tab (data khá nặng)
  useEffect(() => {
    if (!debtVisited) return
    fetchDebtAging()
      .then(setDebtAging)
      .catch(() => {})
      .finally(() => setDebtAgingLoading(false))
  }, [debtVisited])

  // So sánh Standard/Planned cost — cũng không lọc theo kỳ/territory, chỉ fetch khi vào tab (lần đầu có thể chậm)
  useEffect(() => {
    if (!costVisited) return
    fetchCostComparison()
      .then(setCostComparison)
      .catch(() => {})
      .finally(() => setCostComparisonLoading(false))
  }, [costVisited])

  // Tạm ứng TK 1411 — lọc theo kỳ (range) như Doanh thu, không lọc territory
  useEffect(() => {
    if (!advanceVisited) return
    setAdvanceLedgerLoading(true)
    fetchAdvanceLedger(range)
      .then(setAdvanceLedger)
      .catch(() => {})
      .finally(() => setAdvanceLedgerLoading(false))
  }, [advanceVisited, range])

  function switchTab(tab: Tab) {
    setActiveTab(tab)
    if (tab === 'debt') setDebtVisited(true)
    if (tab === 'cost') setCostVisited(true)
    if (tab === 'advance') setAdvanceVisited(true)
  }

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <nav className="section-nav section-nav--inline">
          <button
            className={`section-nav__link${activeTab === 'revenue' ? ' section-nav__link--active' : ''}`}
            onClick={() => switchTab('revenue')}
          >
            Doanh thu
          </button>
          <button
            className={`section-nav__link${activeTab === 'debt' ? ' section-nav__link--active' : ''}`}
            onClick={() => switchTab('debt')}
          >
            Công nợ
          </button>
          <button
            className={`section-nav__link${activeTab === 'cost' ? ' section-nav__link--active' : ''}`}
            onClick={() => switchTab('cost')}
          >
            Chi phí
          </button>
          <button
            className={`section-nav__link${activeTab === 'advance' ? ' section-nav__link--active' : ''}`}
            onClick={() => switchTab('advance')}
          >
            Tạm ứng
          </button>
        </nav>
        {(activeTab === 'revenue' || activeTab === 'advance') && (
          <div className="dashboard__filters">
            {activeTab === 'revenue' && <TerritoryFilter value={territory} onChange={setTerritory} disabled={!isAdmin} />}
            <DateRangeFilter onChange={(r, g) => { setRange(r); setGroupBy(g) }} />
          </div>
        )}
      </div>

      {error && <div className="dashboard__error">{error}</div>}

      {activeTab === 'revenue' && (
        <div className="dashboard-section">
          {fetching && !loading && <span className="dashboard__refreshing">Đang cập nhật...</span>}
          <FinanceKpiCards summary={summary} prevSummary={prevSummary} loading={loading} />
          <RevenueChart
            data={toPeriodData(periodData)}
            prevData={toPeriodData(prevPeriodData)}
            loading={loading}
            groupBy={groupBy}
            title="Doanh thu theo kỳ (Invoice)"
          />
        </div>
      )}

      {activeTab === 'debt' && (
        <div className="dashboard-section">
          <DebtDashboard data={debtAging} loading={debtAgingLoading} />
        </div>
      )}

      {activeTab === 'cost' && (
        <div className="dashboard-section">
          <CostComparisonTable data={costComparison} loading={costComparisonLoading} />
        </div>
      )}

      {activeTab === 'advance' && (
        <div className="dashboard-section">
          <AdvanceLedgerTable data={advanceLedger} loading={advanceLedgerLoading} />
        </div>
      )}
    </div>
  )
}
