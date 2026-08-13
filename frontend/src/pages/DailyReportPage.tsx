import { Fragment, useEffect, useState } from 'react'
import type { DailyReport, DailyReportRepRow, ReportMetrics, RepDailyReport } from '../api/sales'
import { fetchDailyReport, fetchRepDailyReport } from '../api/sales'
import { fmtVNDFull } from '../utils/format'

function pctColor(pct: number | null): string {
  if (pct === null) return 'var(--text)'
  if (pct >= 100) return '#16a34a'
  if (pct >= 70)  return '#ca8a04'
  return '#dc2626'
}

function groupByDepartment<T extends { department: string }>(rows: T[]): [string, T[]][] {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const key = r.department || ''
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }
  return Array.from(map.entries())
}

function groupByTeam(rows: DailyReportRepRow[]): [string, DailyReportRepRow[]][] {
  const map = new Map<string, DailyReportRepRow[]>()
  for (const r of rows) {
    const key = r.team || ''
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }
  return Array.from(map.entries())
}

function sumGroup(rows: ReportMetrics[]) {
  const day_count  = rows.reduce((s, t) => s + t.day_count, 0)
  const day_value  = rows.reduce((s, t) => s + t.day_value, 0)
  const week_value = rows.reduce((s, t) => s + t.week_value, 0)
  const accu_q     = rows.reduce((s, t) => s + t.accu_q, 0)
  const target_q   = rows.reduce((s, t) => s + t.target_q, 0)
  const accu_fy    = rows.reduce((s, t) => s + t.accu_fy, 0)
  const target_fy  = rows.reduce((s, t) => s + t.target_fy, 0)
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

function MetricCells({ m, boldPct = false }: { m: ReportMetrics; boldPct?: boolean }) {
  return (
    <>
      <td className="leaderboard__num">{m.day_count}</td>
      <td className="leaderboard__num">{fmtVNDFull(m.day_value)}</td>
      <td className="leaderboard__num">{fmtVNDFull(m.week_value)}</td>
      <td className="leaderboard__num">{fmtVNDFull(m.accu_q)}</td>
      <td className="leaderboard__num">{fmtVNDFull(m.target_q)}</td>
      <td className="leaderboard__num" style={{ fontWeight: boldPct ? 700 : undefined, color: pctColor(m.pct_q) }}>
        {m.pct_q !== null ? `${m.pct_q}%` : '—'}
      </td>
      <td className="leaderboard__num">{fmtVNDFull(m.accu_fy)}</td>
      <td className="leaderboard__num">{fmtVNDFull(m.target_fy)}</td>
      <td className="leaderboard__num" style={{ fontWeight: boldPct ? 700 : undefined, color: pctColor(m.pct_fy) }}>
        {m.pct_fy !== null ? `${m.pct_fy}%` : '—'}
      </td>
    </>
  )
}

function TableHead({ quarter, entityLabel }: { quarter: string; entityLabel: string }) {
  return (
    <thead>
      <tr>
        <th style={{ textAlign: 'right' }}>#</th>
        <th>{entityLabel}</th>
        <th style={{ textAlign: 'right' }}>SL ngày</th>
        <th style={{ textAlign: 'right' }}>Doanh thu ngày</th>
        <th style={{ textAlign: 'right' }}>Doanh thu tuần</th>
        <th style={{ textAlign: 'right' }}>Lũy kế {quarter}</th>
        <th style={{ textAlign: 'right' }}>Target {quarter}</th>
        <th style={{ textAlign: 'right' }}>%{quarter}</th>
        <th style={{ textAlign: 'right' }}>Lũy kế năm</th>
        <th style={{ textAlign: 'right' }}>Target năm</th>
        <th style={{ textAlign: 'right' }}>%Năm</th>
      </tr>
    </thead>
  )
}

function TeamView({ report }: { report: DailyReport }) {
  const grouped = groupByDepartment(report.teams)
  let globalRank = 0

  return (
    <table className="leaderboard">
      <TableHead quarter={report.quarter} entityLabel="Team" />
      <tbody>
        {grouped.map(([dept, teams]) => (
          <Fragment key={dept}>
            <tr className="leaderboard__dept-header">
              <td colSpan={2}>{dept || 'Khác'}</td>
              <MetricCells m={sumGroup(teams)} />
            </tr>
            {teams.map(t => {
              globalRank++
              return (
                <tr key={t.team}>
                  <td className="leaderboard__rank">{globalRank}</td>
                  <td className="leaderboard__name">{t.team}</td>
                  <MetricCells m={t} boldPct />
                </tr>
              )
            })}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}

function RepView({ report }: { report: RepDailyReport }) {
  const grouped = groupByDepartment(report.reps)
  let globalRank = 0

  return (
    <table className="leaderboard">
      <TableHead quarter={report.quarter} entityLabel="Salesperson" />
      <tbody>
        {grouped.map(([dept, deptReps]) => (
          <Fragment key={dept}>
            <tr className="leaderboard__dept-header">
              <td colSpan={2}>{dept || 'Khác'}</td>
              <MetricCells m={sumGroup(deptReps)} />
            </tr>
            {groupByTeam(deptReps).map(([team, teamReps]) => (
              <Fragment key={`${dept}-${team}`}>
                <tr className="leaderboard__team-header">
                  <td colSpan={2}>{team || 'Khác'}</td>
                  <MetricCells m={sumGroup(teamReps)} />
                </tr>
                {teamReps.map(r => {
                  globalRank++
                  return (
                    <tr key={r.id}>
                      <td className="leaderboard__rank">{globalRank}</td>
                      <td className="leaderboard__name">{r.name}</td>
                      <MetricCells m={r} boldPct />
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}

export function DailyReportPage() {
  const [view,         setView]         = useState<'team' | 'rep'>('team')
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()))
  const [teamReport,   setTeamReport]   = useState<DailyReport | null>(null)
  const [repReport,    setRepReport]    = useState<RepDailyReport | null>(null)
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
    const date = toISODate(selectedDate)
    const request = view === 'team'
      ? fetchDailyReport('ALL', date).then(data => { if (!cancelled) setTeamReport(data) })
      : fetchRepDailyReport('ALL', date).then(data => { if (!cancelled) setRepReport(data) })
    request
      .catch(e => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [view, selectedDate])

  const hasData = view === 'team' ? !!teamReport && teamReport.teams.length > 0 : !!repReport && repReport.reps.length > 0

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1 className="dashboard__title">Daily Report</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="tab-group">
            <button className={`tab-btn${view === 'team' ? ' tab-btn--active' : ''}`} onClick={() => setView('team')}>Team</button>
            <button className={`tab-btn${view === 'rep' ? ' tab-btn--active' : ''}`} onClick={() => setView('rep')}>Nhân viên</button>
          </div>
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
        ) : !hasData ? (
          <p className="table-placeholder">Không có dữ liệu.</p>
        ) : (
          <div className="table-wrap">
            {view === 'team' && teamReport ? <TeamView report={teamReport} /> : null}
            {view === 'rep' && repReport ? <RepView report={repReport} /> : null}
          </div>
        )}
      </div>
    </div>
  )
}
