import { useEffect, useState } from 'react'
import type { RepData } from '../api/sales'
import { fmtVNDFull } from '../utils/format'

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
  data: RepData[]
  loading: boolean
}

const PAGE_SIZE = 10

export function SalesLeaderboard({ data, loading }: Props) {
  const [page, setPage] = useState(0)
  const [teamFilter, setTeamFilter] = useState<string>('ALL')

  const teams = Array.from(new Set(data.map(r => r.team).filter(Boolean))).sort()

  const filtered = teamFilter === 'ALL' ? data : data.filter(r => r.team === teamFilter)

  useEffect(() => { setPage(0) }, [data, teamFilter])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageData   = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="card">
      <div className="leaderboard__toolbar">
        <h2 className="card__title" style={{ marginBottom: 0 }}>Xep hang Salesperson</h2>
        <div className="leaderboard__team-filter">
          <button
            className={`date-filter__btn${teamFilter === 'ALL' ? ' date-filter__btn--active' : ''}`}
            onClick={() => setTeamFilter('ALL')}
          >
            Tat ca
          </button>
          {teams.map(team => (
            <button
              key={team}
              className={`date-filter__btn${teamFilter === team ? ' date-filter__btn--active' : ''}`}
              onClick={() => setTeamFilter(team)}
            >
              {team}
            </button>
          ))}
        </div>
      </div>

      {loading && data.length === 0 ? (
        <p className="table-placeholder">Dang tai...</p>
      ) : data.length === 0 ? (
        <p className="table-placeholder">Khong co du lieu</p>
      ) : (
        <>
          <div className="table-wrap">
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
                  const rank = page * PAGE_SIZE + i + 1
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

          {totalPages > 1 && (
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
