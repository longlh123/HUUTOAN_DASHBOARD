import { useEffect, useState } from 'react'
import type { RepData, DateRange } from '../api/sales'
import { fetchByRep } from '../api/sales'
import { fmtVNDFull } from '../utils/format'
import { getQuarterRange, getYearRange } from '../utils/date'

function kpiPct(value: number, kpi: number | null): number | null {
  if (!kpi || kpi <= 0) return null
  return Math.min(Math.round((value / kpi) * 100), 999)
}

function kpiLevel(pct: number): 'high' | 'mid' | 'low' {
  if (pct >= 80) return 'high'
  if (pct >= 50) return 'mid'
  return 'low'
}

type Props = {
  territory:   string
  department?: string
  range:       DateRange
}

const PAGE_SIZE = 10

export function SalesLeaderboard({ territory, department, range }: Props) {
  const [quarter,  setQuarter]  = useState<0 | 1 | 2 | 3 | 4>(0)
  const [data,     setData]     = useState<RepData[]>([])
  const [loading,  setLoading]  = useState(true)
  const [fetching, setFetching] = useState(false)
  const [page,     setPage]     = useState(0)
  const [teamFilter, setTeamFilter] = useState<string>('ALL')

  useEffect(() => {
    setFetching(true)
    const year       = parseInt(range.from.slice(0, 4))
    const fetchRange = quarter === 0 ? getYearRange(year) : getQuarterRange(year, quarter)
    fetchByRep(fetchRange, territory, department)
      .then(d => { setData(d); setPage(0) })
      .catch(() => {})
      .finally(() => { setLoading(false); setFetching(false) })
  }, [territory, department, range, quarter])

  const teams    = Array.from(new Set(data.map(r => r.team).filter(Boolean))).sort()
  const filtered = teamFilter === 'ALL' ? data : data.filter(r => r.team === teamFilter)

  const attainment = (() => {
    const withKpi = filtered.filter(r => r.kpi && r.kpi > 0)
    if (withKpi.length === 0) return null
    const on   = withKpi.filter(r => r.total_value / r.kpi! >= 1).length
    const risk = withKpi.filter(r => { const p = r.total_value / r.kpi!; return p >= 0.5 && p < 1 }).length
    const behind = withKpi.filter(r => r.total_value / r.kpi! < 0.5).length
    return { on, risk, behind, total: withKpi.length }
  })()

  const paginate    = !department
  const totalPages  = Math.ceil(filtered.length / PAGE_SIZE)
  const pageData    = paginate ? filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : filtered

  return (
    <div className="card">
      <div className="leaderboard__toolbar">
        <h2 className="card__title" style={{ marginBottom: 0 }}>Xep hang Salesperson</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {fetching && !loading && <span className="dashboard__refreshing">Dang cap nhat...</span>}
          <select
            className="leaderboard__team-select"
            value={teamFilter}
            onChange={e => { setTeamFilter(e.target.value); setPage(0) }}
          >
            <option value="ALL">Tat ca team</option>
            {teams.map(team => (
              <option key={team} value={team}>{team}</option>
            ))}
          </select>
          <div className="date-filter">
            <div className="date-filter__presets">
              {([0, 1, 2, 3, 4] as const).map(q => (
                <button
                  key={q}
                  className={`date-filter__btn${quarter === q ? ' date-filter__btn--active' : ''}`}
                  onClick={() => { setQuarter(q); setPage(0) }}
                >
                  {q === 0 ? 'Tat ca' : `Q${q}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loading && data.length === 0 ? (
        <p className="table-placeholder">Dang tai...</p>
      ) : data.length === 0 ? (
        <p className="table-placeholder">Khong co du lieu</p>
      ) : (
        <>
          {attainment && (
            <div className="attainment-strip">
              <div className="attainment-strip__item attainment-strip__item--on">
                <span className="attainment-strip__count">{attainment.on}</span>
                <span className="attainment-strip__label">Dat &ge; 100%</span>
              </div>
              <div className="attainment-strip__item attainment-strip__item--risk">
                <span className="attainment-strip__count">{attainment.risk}</span>
                <span className="attainment-strip__label">50 – 99%</span>
              </div>
              <div className="attainment-strip__item attainment-strip__item--behind">
                <span className="attainment-strip__count">{attainment.behind}</span>
                <span className="attainment-strip__label">Duoi 50%</span>
              </div>
              <span className="attainment-strip__sub">/ {attainment.total} nguoi co KPI</span>
            </div>
          )}
          <div className={`table-wrap${fetching && !loading ? ' chart-wrap--loading' : ''}`}>
            <table className="leaderboard">
              <thead>
                <tr>
                  <th style={{ textAlign: 'right' }}>#</th>
                  <th>Salesperson</th>
                  {teamFilter === 'ALL' && <th className="hide-sm">Team</th>}
                  <th style={{ textAlign: 'right' }}>Tong gia tri</th>
                  <th className="hide-sm" style={{ textAlign: 'right' }}>Won</th>
                  <th className="hide-sm" style={{ textAlign: 'right' }}>Lost</th>
                  <th style={{ textAlign: 'right' }}>Win Rate</th>
                  <th className="hide-sm" style={{ textAlign: 'right' }}>Toc do chot</th>
                  <th className="hide-sm" style={{ textAlign: 'right' }}>Gia tri TB</th>
                  <th className="hide-sm">% KPI</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((rep, i) => {
                  const rank = paginate ? page * PAGE_SIZE + i + 1 : i + 1
                  return (
                    <tr key={rep.owner_id}>
                      <td className="leaderboard__rank">{rank}</td>
                      <td className="leaderboard__name">{rep.name}</td>
                      {teamFilter === 'ALL' && <td className="hide-sm leaderboard__name">{rep.team}</td>}
                      <td className="leaderboard__value">{fmtVNDFull(rep.total_value)}</td>
                      <td className="hide-sm leaderboard__num">{rep.deals}</td>
                      <td className="hide-sm leaderboard__num">{rep.lost_deals}</td>
                      <td className="leaderboard__num">
                        <span className={`win-rate win-rate--${rateLevel(rep.win_rate)}`}>
                          {rep.win_rate}%
                        </span>
                      </td>
                      <td className="hide-sm leaderboard__num">
                        {rep.avg_days_to_close != null
                          ? <span className={`speed-badge speed-badge--${speedLevel(rep.avg_days_to_close)}`}>{rep.avg_days_to_close} ngay</span>
                          : '—'}
                      </td>
                      <td className="hide-sm leaderboard__value">{fmtVNDFull(rep.avg_deal_size)}</td>
                      <td className="hide-sm leaderboard__kpi-bar">
                        {(() => {
                          const pct = kpiPct(rep.total_value, rep.kpi)
                          if (pct === null) return '—'
                          return (
                            <div className="kpi-progress">
                              <div className="kpi-progress__track">
                                <div
                                  className={`kpi-progress__fill kpi-progress__fill--${kpiLevel(pct)}`}
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                              </div>
                              <span className={`kpi-progress__label kpi-progress__label--${kpiLevel(pct)}`}>
                                {pct}%
                              </span>
                            </div>
                          )
                        })()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {paginate && totalPages > 1 && (
            <div className="pagination">
              <button
                className="pagination__btn"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
              >
                ← Truoc
              </button>
              <span className="pagination__info">{page + 1} / {totalPages}</span>
              <button
                className="pagination__btn"
                disabled={page === totalPages - 1}
                onClick={() => setPage(p => p + 1)}
              >
                Sau →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function rateLevel(rate: number): 'high' | 'mid' | 'low' {
  if (rate >= 70) return 'high'
  if (rate >= 40) return 'mid'
  return 'low'
}

function speedLevel(days: number): 'fast' | 'mid' | 'slow' {
  if (days <= 30)  return 'fast'
  if (days <= 90)  return 'mid'
  return 'slow'
}
