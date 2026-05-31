import { useEffect, useState } from 'react'
import type { TeamData, DateRange } from '../api/sales'
import { fetchByTeam } from '../api/sales'
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

export function SalesTeamLeaderboard({ territory, department, range }: Props) {
  const [quarter,  setQuarter]  = useState<0 | 1 | 2 | 3 | 4>(0)
  const [data,     setData]     = useState<TeamData[]>([])
  const [loading,  setLoading]  = useState(true)
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    setFetching(true)
    const year      = parseInt(range.from.slice(0, 4))
    const fetchRange = quarter === 0 ? getYearRange(year) : getQuarterRange(year, quarter)
    fetchByTeam(fetchRange, territory, department)
      .then(setData)
      .catch(() => {})
      .finally(() => { setLoading(false); setFetching(false) })
  }, [territory, department, range, quarter])

  const grouped = groupByDepartment(data)
  let globalRank = 0

  return (
    <div className="card">
      <div className="chart-header">
        <h2 className="card__title">Xep hang theo Team</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {fetching && !loading && <span className="dashboard__refreshing">Dang cap nhat...</span>}
          <div className="date-filter">
            <div className="date-filter__presets">
              {([0, 1, 2, 3, 4] as const).map(q => (
                <button
                  key={q}
                  className={`date-filter__btn${quarter === q ? ' date-filter__btn--active' : ''}`}
                  onClick={() => setQuarter(q)}
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
        <div className={`table-wrap${fetching && !loading ? ' chart-wrap--loading' : ''}`}>
          <table className="leaderboard">
            <thead>
              <tr>
                <th style={{ textAlign: 'right' }}>#</th>
                <th>Team</th>
                <th style={{ textAlign: 'right' }}>Tong gia tri</th>
                <th className="hide-sm" style={{ textAlign: 'right' }}>Won</th>
                <th className="hide-sm" style={{ textAlign: 'right' }}>Lost</th>
                <th style={{ textAlign: 'right' }}>Win Rate</th>
                <th className="hide-sm" style={{ textAlign: 'right' }}>Gia Tri TB</th>
                <th className="hide-sm" style={{ textAlign: 'right' }}>Toc do chot</th>
                <th className="hide-sm">% KPI</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([dept, teams]) => (
                <>
                  <tr key={`dept-${dept}`} className="leaderboard__dept-header">
                    <td colSpan={9}>{dept || 'Khac'}</td>
                  </tr>
                  {teams.map((team) => {
                    globalRank++
                    return (
                      <tr key={team.team_id}>
                        <td className="leaderboard__rank">{globalRank}</td>
                        <td className="leaderboard__name">{team.name}</td>
                        <td className="leaderboard__value">{fmtVNDFull(team.total_value)}</td>
                        <td className="hide-sm leaderboard__num">{team.deals}</td>
                        <td className="hide-sm leaderboard__num">{team.lost_deals}</td>
                        <td className="leaderboard__num">
                          <span className={`win-rate win-rate--${rateLevel(team.win_rate)}`}>
                            {team.win_rate}%
                          </span>
                        </td>
                        <td className="hide-sm leaderboard__value">{fmtVNDFull(team.avg_deal_size)}</td>
                        <td className="hide-sm leaderboard__num">
                          {team.avg_days_to_close != null
                            ? <span className={`speed-badge speed-badge--${speedLevel(team.avg_days_to_close)}`}>{team.avg_days_to_close} ngay</span>
                            : '—'}
                        </td>
                        <td className="hide-sm leaderboard__kpi-bar">
                          {(() => {
                            const pct = kpiPct(team.total_value, team.kpi)
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
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function groupByDepartment(data: TeamData[]): [string, TeamData[]][] {
  const map = new Map<string, TeamData[]>()
  for (const team of data) {
    const key = team.department || ''
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(team)
  }
  return Array.from(map.entries())
}

function rateLevel(rate: number): 'high' | 'mid' | 'low' {
  if (rate >= 70) return 'high'
  if (rate >= 40) return 'mid'
  return 'low'
}

function speedLevel(days: number): 'fast' | 'mid' | 'slow' {
  if (days <= 30) return 'fast'
  if (days <= 90) return 'mid'
  return 'slow'
}
