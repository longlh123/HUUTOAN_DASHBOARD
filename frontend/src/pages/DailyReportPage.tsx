import { Fragment, useEffect, useState } from 'react'
import type { DailyReport, DailyReportTeamRow } from '../api/sales'
import { fetchDailyReport } from '../api/sales'
import { fmtVNDFull } from '../utils/format'

function pctColor(pct: number | null): string {
  if (pct === null) return 'var(--text)'
  if (pct >= 100) return '#16a34a'
  if (pct >= 70)  return '#ca8a04'
  return '#dc2626'
}

function groupByDepartment(teams: DailyReportTeamRow[]): [string, DailyReportTeamRow[]][] {
  const map = new Map<string, DailyReportTeamRow[]>()
  for (const t of teams) {
    const key = t.department || ''
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(t)
  }
  return Array.from(map.entries())
}

function sumGroup(teams: DailyReportTeamRow[]) {
  const day_count  = teams.reduce((s, t) => s + t.day_count, 0)
  const day_value  = teams.reduce((s, t) => s + t.day_value, 0)
  const week_value = teams.reduce((s, t) => s + t.week_value, 0)
  const accu_q     = teams.reduce((s, t) => s + t.accu_q, 0)
  const target_q   = teams.reduce((s, t) => s + t.target_q, 0)
  const accu_fy    = teams.reduce((s, t) => s + t.accu_fy, 0)
  const target_fy  = teams.reduce((s, t) => s + t.target_fy, 0)
  return {
    day_count, day_value, week_value, accu_q, target_q, accu_fy, target_fy,
    pct_q:  target_q  > 0 ? Math.round((accu_q  / target_q)  * 1000) / 10 : null,
    pct_fy: target_fy > 0 ? Math.round((accu_fy / target_fy) * 1000) / 10 : null,
  }
}

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function addDays(d: Date, delta: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + delta)
  return r
}

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dayLabel(d: Date): string {
  const today     = startOfDay(new Date())
  const diffDays  = Math.round((today.getTime() - startOfDay(d).getTime()) / 86400000)
  const dm        = `${d.getDate()}/${d.getMonth() + 1}`
  if (diffDays === 0) return `Hôm nay, ${dm}`
  if (diffDays === 1) return `Hôm qua, ${dm}`
  return `${dm}/${d.getFullYear()}`
}

export function DailyReportPage() {
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()))
  const [report,       setReport]       = useState<DailyReport | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)

  const isToday = toISODate(selectedDate) === toISODate(startOfDay(new Date()))

  function shiftDay(delta: number) {
    setSelectedDate(d => {
      const next = addDays(d, delta)
      const today = startOfDay(new Date())
      return next > today ? today : next
    })
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchDailyReport('ALL', toISODate(selectedDate))
      .then(data => { if (!cancelled) setReport(data) })
      .catch(e => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedDate])

  const grouped = report ? groupByDepartment(report.teams) : []
  let globalRank = 0

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1 className="dashboard__title">Daily Report</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            border: '1px solid var(--border)', borderRadius: 6,
            padding: '5px 10px', background: 'var(--bg)',
          }}>
            <span style={{ fontSize: 12, color: 'var(--text-h)' }}>{dayLabel(selectedDate)}</span>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 0.7, marginLeft: 2 }}>
              <button
                onClick={() => shiftDay(1)}
                disabled={isToday}
                style={{ border: 'none', background: 'none', cursor: isToday ? 'default' : 'pointer', color: isToday ? 'var(--border)' : 'var(--text)', fontSize: 10, padding: 0 }}
              >▲</button>
              <button
                onClick={() => shiftDay(-1)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 10, padding: 0 }}
              >▼</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="date-filter__btn" onClick={() => shiftDay(-1)}>‹</button>
            <button className="date-filter__btn" onClick={() => setSelectedDate(startOfDay(new Date()))}>Hôm nay</button>
            <button className="date-filter__btn" disabled={isToday} onClick={() => shiftDay(1)}>›</button>
          </div>
        </div>
      </div>

      {error && <div className="dashboard__error">{error}</div>}

      <div className="card">
        {loading ? (
          <p className="table-placeholder">Đang tải...</p>
        ) : !report || report.teams.length === 0 ? (
          <p className="table-placeholder">Không có dữ liệu.</p>
        ) : (
          <div className="table-wrap">
            <table className="leaderboard">
              <thead>
                <tr>
                  <th style={{ textAlign: 'right' }}>#</th>
                  <th>Team</th>
                  <th style={{ textAlign: 'right' }}>SL ngày</th>
                  <th style={{ textAlign: 'right' }}>Doanh thu ngày</th>
                  <th style={{ textAlign: 'right' }}>Doanh thu tuần</th>
                  <th style={{ textAlign: 'right' }}>Lũy kế {report.quarter}</th>
                  <th style={{ textAlign: 'right' }}>Target {report.quarter}</th>
                  <th style={{ textAlign: 'right' }}>%{report.quarter}</th>
                  <th style={{ textAlign: 'right' }}>Lũy kế năm</th>
                  <th style={{ textAlign: 'right' }}>Target năm</th>
                  <th style={{ textAlign: 'right' }}>%Năm</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(([dept, teams]) => {
                  const totals = sumGroup(teams)
                  return (
                  <Fragment key={dept}>
                    <tr className="leaderboard__dept-header">
                      <td colSpan={2}>{dept || 'Khác'}</td>
                      <td className="leaderboard__num">{totals.day_count}</td>
                      <td className="leaderboard__num">{fmtVNDFull(totals.day_value)}</td>
                      <td className="leaderboard__num">{fmtVNDFull(totals.week_value)}</td>
                      <td className="leaderboard__num">{fmtVNDFull(totals.accu_q)}</td>
                      <td className="leaderboard__num">{fmtVNDFull(totals.target_q)}</td>
                      <td className="leaderboard__num" style={{ color: pctColor(totals.pct_q) }}>
                        {totals.pct_q !== null ? `${totals.pct_q}%` : '—'}
                      </td>
                      <td className="leaderboard__num">{fmtVNDFull(totals.accu_fy)}</td>
                      <td className="leaderboard__num">{fmtVNDFull(totals.target_fy)}</td>
                      <td className="leaderboard__num" style={{ color: pctColor(totals.pct_fy) }}>
                        {totals.pct_fy !== null ? `${totals.pct_fy}%` : '—'}
                      </td>
                    </tr>
                    {teams.map(t => {
                      globalRank++
                      return (
                        <tr key={t.team}>
                          <td className="leaderboard__rank">{globalRank}</td>
                          <td className="leaderboard__name">{t.team}</td>
                          <td className="leaderboard__num">{t.day_count}</td>
                          <td className="leaderboard__num">{fmtVNDFull(t.day_value)}</td>
                          <td className="leaderboard__num">{fmtVNDFull(t.week_value)}</td>
                          <td className="leaderboard__num">{fmtVNDFull(t.accu_q)}</td>
                          <td className="leaderboard__num">{fmtVNDFull(t.target_q)}</td>
                          <td className="leaderboard__num" style={{ fontWeight: 700, color: pctColor(t.pct_q) }}>
                            {t.pct_q !== null ? `${t.pct_q}%` : '—'}
                          </td>
                          <td className="leaderboard__num">{fmtVNDFull(t.accu_fy)}</td>
                          <td className="leaderboard__num">{fmtVNDFull(t.target_fy)}</td>
                          <td className="leaderboard__num" style={{ fontWeight: 700, color: pctColor(t.pct_fy) }}>
                            {t.pct_fy !== null ? `${t.pct_fy}%` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
