import { Fragment, useEffect, useState } from 'react'
import type {
  SalesSummary, GapToTargetItem, DailyReport, RepData, PeriodData, PipelineData,
} from '../api/sales'
import {
  fetchSummary, fetchKpiQuarterly, fetchGapToTarget, fetchDailyReport,
  fetchByRep, fetchByPeriod, fetchPipeline,
} from '../api/sales'
import { fmtVND, fmtVNDFull } from '../utils/format'
import { getYearRange, prevYearRange, getLastFullWeekRange, getFullWeekRange, getLastNWeeksRange } from '../utils/date'

function pctLevel(pct: number | null): 'high' | 'mid' | 'low' {
  if (pct === null) return 'low'
  if (pct >= 100) return 'high'
  if (pct >= 70) return 'mid'
  return 'low'
}

function pctColor(pct: number | null): string {
  const level = pctLevel(pct)
  return level === 'high' ? '#16a34a' : level === 'mid' ? '#d97706' : 'var(--accent)'
}

function potentialLevel(potential: string): 'high' | 'mid' | 'low' {
  if (potential === 'High') return 'high'
  if (potential === 'Medium') return 'mid'
  return 'low'
}

function fmtShortDate(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
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

type SectionHeadProps = { num: string; title: string; sub: string; pill: string }

function SectionHead({ num, title, sub, pill }: SectionHeadProps) {
  return (
    <div className="pulse__section-head">
      <div className="pulse__section-head-left">
        <span className="pulse__section-num">{num}</span>
        <div>
          <h2 className="pulse__section-title">{title}</h2>
          <p className="pulse__section-sub">{sub}</p>
        </div>
      </div>
      <span className="pill pill--accent">{pill}</span>
    </div>
  )
}

type YearData = {
  summary:     SalesSummary
  prevSummary: SalesSummary
  target:      number
  quarters:    GapToTargetItem[]
}

type WeekData = {
  report:  DailyReport
  summary: SalesSummary
  reps:    RepData[]
  trend:   PeriodData[]
}

export function WeeklyPulsePage() {
  const [year,     setYearData]     = useState<YearData | null>(null)
  const [week,     setWeekData]     = useState<WeekData | null>(null)
  const [pipeline, setPipeline]     = useState<PipelineData | null>(null)
  const [loading,  setLoading]      = useState(true)
  const [error,    setError]        = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const now       = new Date()
    const yearRange = getYearRange(now.getFullYear())
    const lastWeek  = getLastFullWeekRange()
    const trendRange = getLastNWeeksRange(6)

    Promise.all([
      fetchSummary(yearRange, 'ALL'),
      fetchSummary(prevYearRange(yearRange), 'ALL'),
      fetchKpiQuarterly(now.getFullYear(), 'ALL'),
      fetchGapToTarget(now.getFullYear(), 'ALL'),
      fetchDailyReport('ALL', lastWeek.from),
      fetchSummary(lastWeek, 'ALL'),
      fetchByRep(lastWeek, 'ALL'),
      fetchByPeriod(trendRange, 'week', 'ALL'),
      fetchPipeline('ALL'),
    ]).then(([yearSummary, yearPrevSummary, kpiQuarterly, quarters, report, weekSummary, reps, trend, pipelineData]) => {
      if (cancelled) return
      setYearData({
        summary: yearSummary,
        prevSummary: yearPrevSummary,
        target: kpiQuarterly.q1 + kpiQuarterly.q2 + kpiQuarterly.q3 + kpiQuarterly.q4,
        quarters,
      })
      setWeekData({ report, summary: weekSummary, reps, trend })
      setPipeline(pipelineData)
    }).catch(e => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <div className="dashboard"><p className="table-placeholder">Đang tải...</p></div>
  }
  if (error || !year || !week || !pipeline) {
    return <div className="dashboard"><div className="dashboard__error">{error ?? 'Không có dữ liệu.'}</div></div>
  }

  const yoyPct = year.prevSummary.total_value > 0
    ? Math.round((year.summary.total_value - year.prevSummary.total_value) / year.prevSummary.total_value * 1000) / 10
    : null
  const yearPct = year.target > 0 ? Math.round(year.summary.total_value / year.target * 1000) / 10 : null

  const trendLast  = week.trend[week.trend.length - 1]
  const trendPrev  = week.trend[week.trend.length - 2]
  const weekDeltaPct = trendPrev && trendPrev.value > 0
    ? Math.round((trendLast.value - trendPrev.value) / trendPrev.value * 1000) / 10
    : null
  const sparkPoints = week.trend.map((p, i) => {
    const max = Math.max(...week.trend.map(t => t.value), 1)
    const x = week.trend.length > 1 ? (i / (week.trend.length - 1)) * 200 : 200
    const y = 32 - (p.value / max) * 28
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const lastPoint = sparkPoints.split(' ').pop()!.split(',')

  const teamsWithTarget = week.report.teams.filter(t => t.pct_q !== null)
  const bestTeam  = teamsWithTarget.length ? teamsWithTarget.reduce((a, b) => (b.pct_q! > a.pct_q! ? b : a)) : null
  const worstTeam = teamsWithTarget.length ? teamsWithTarget.reduce((a, b) => (b.pct_q! < a.pct_q! ? b : a)) : null
  const teamTotal = week.report.teams.reduce((acc, t) => ({
    week_count: acc.week_count + t.week_count,
    week_value: acc.week_value + t.week_value,
    accu_q:     acc.accu_q + t.accu_q,
    target_q:   acc.target_q + t.target_q,
  }), { week_count: 0, week_value: 0, accu_q: 0, target_q: 0 })
  const teamTotalPct = teamTotal.target_q > 0 ? Math.round(teamTotal.accu_q / teamTotal.target_q * 1000) / 10 : null

  const speedReps = week.reps.filter(r => r.avg_days_to_close !== null && r.deals > 0)
  const totalDeals = speedReps.reduce((s, r) => s + r.deals, 0)
  const avgSpeed = totalDeals > 0
    ? Math.round(speedReps.reduce((s, r) => s + r.avg_days_to_close! * r.deals, 0) / totalDeals)
    : null
  const topReps = [...week.reps].sort((a, b) => b.total_value - a.total_value).slice(0, 5)

  const nextWeek = getFullWeekRange()
  const upcoming = pipeline.top_win
    .filter(o => o.estimated_close && o.estimated_close >= nextWeek.from && o.estimated_close <= nextWeek.to)
    .sort((a, b) => b.value - a.value)
  const upcomingValue = upcoming.reduce((s, o) => s + o.value, 0)
  const upcomingHigh = upcoming.filter(o => o.potential === 'High')
  const noEstimateHigh = pipeline.top_win.filter(o => o.potential === 'High' && !o.estimated_close)

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1 className="dashboard__title">Nhịp Doanh Số Tuần</h1>
        <p className="pulse__meta">Tổng quan năm → tuần vừa qua → kế hoạch tuần tới — dùng để mở đầu họp giao ban, không cần thao tác filter</p>
      </div>

      {/* ═══ 01 · Tổng quan năm ═══ */}
      <section className="pulse__section">
        <SectionHead
          num="01"
          title={`Tổng quan năm ${new Date().getFullYear()}`}
          sub="Bức tranh chung trước khi đi vào chi tiết tuần"
          pill={`Luỹ kế đến ${fmtShortDate(new Date().toISOString())}`}
        />

        <div className="kpi-grid kpi-grid--3">
          <div className="card kpi-card">
            <p className="kpi-card__label">Doanh thu luỹ kế năm</p>
            {yoyPct !== null && (
              <span className={`kpi-delta kpi-delta--${yoyPct >= 0 ? 'up' : 'down'}`}>
                {yoyPct >= 0 ? '▲' : '▼'} {Math.abs(yoyPct)}% so cùng kỳ năm trước
              </span>
            )}
            <p className="kpi-card__value">{fmtVND(year.summary.total_value)}</p>
            <p className="kpi-card__sub">Target năm {fmtVND(year.target)}</p>
          </div>

          <div className="card kpi-card">
            <p className="kpi-card__label">% Target năm</p>
            <p className="kpi-card__value" style={{ color: pctColor(yearPct) }}>{yearPct ?? '—'}%</p>
            <div className="kpi-progress">
              <div className="kpi-progress__track">
                <div
                  className={`kpi-progress__fill kpi-progress__fill--${pctLevel(yearPct)}`}
                  style={{ width: `${Math.min(yearPct ?? 0, 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="card kpi-card">
            <p className="kpi-card__label">Win rate năm</p>
            <p className="kpi-card__value">{year.summary.win_rate}%</p>
            <p className="kpi-card__sub">{year.summary.total_deals.toLocaleString('vi-VN')} Won / {year.summary.lost_deals.toLocaleString('vi-VN')} Lost</p>
          </div>
        </div>

        <div className="pulse__quarter-strip">
          {year.quarters.map(q => {
            const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3)
            const qNum = parseInt(q.quarter.replace('Q', ''), 10)
            const state = qNum < currentQuarter ? 'done' : qNum === currentQuarter ? 'now' : 'future'
            const pct = q.target > 0 ? Math.round(q.actual / q.target * 1000) / 10 : null
            return (
              <div key={q.quarter} className={`card pulse__quarter-card${state === 'now' ? ' pulse__quarter-card--current' : ''}`}>
                <div className="pulse__quarter-head">
                  <span className="pulse__quarter-label">{q.quarter}</span>
                  <span className={`pulse__quarter-state pulse__quarter-state--${state}`}>
                    {state === 'done' ? 'Đã xong' : state === 'now' ? 'Đang chạy' : 'Chưa tới'}
                  </span>
                </div>
                {state === 'future' ? (
                  <span className="pulse__quarter-pct pulse__quarter-pct--pending">—</span>
                ) : (
                  <span className="pulse__quarter-pct" style={{ color: pctColor(pct) }}>{pct}%</span>
                )}
                <div className="kpi-progress__track">
                  <div className={`kpi-progress__fill kpi-progress__fill--${pctLevel(state === 'future' ? null : pct)}`} style={{ width: `${state === 'future' ? 0 : Math.min(pct ?? 0, 100)}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ═══ 02 · Tuần vừa qua ═══ */}
      <section className="pulse__section">
        <SectionHead
          num="02"
          title="Tuần vừa qua"
          sub="Kết quả thực tế — dùng để mổ xẻ trong cuộc họp"
          pill={`${fmtShortDate(getLastFullWeekRange().from)} → ${fmtShortDate(getLastFullWeekRange().to)}`}
        />

        <div className="kpi-grid">
          <div className="card kpi-card">
            <p className="kpi-card__label">Doanh thu tuần</p>
            {weekDeltaPct !== null && (
              <span className={`kpi-delta kpi-delta--${weekDeltaPct >= 0 ? 'up' : 'down'}`}>
                {weekDeltaPct >= 0 ? '▲' : '▼'} {Math.abs(weekDeltaPct)}% so tuần trước
              </span>
            )}
            <p className="kpi-card__value">{fmtVND(trendLast?.value ?? 0)}</p>
            <svg className="pulse__spark" viewBox="0 0 200 34" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={sparkPoints} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={lastPoint[0]} cy={lastPoint[1]} r="3.2" fill="var(--accent)" />
            </svg>
            <p className="kpi-card__sub">{week.trend.length} tuần gần nhất</p>
          </div>

          <div className="card kpi-card">
            <p className="kpi-card__label">Lũy kế {week.report.quarter} / Target</p>
            <p className="kpi-card__value" style={{ color: pctColor(teamTotalPct) }}>{teamTotalPct ?? '—'}%</p>
            <p className="kpi-card__sub">{fmtVND(teamTotal.accu_q)} / {fmtVND(teamTotal.target_q)}</p>
          </div>

          <div className="card kpi-card">
            <p className="kpi-card__label">Win rate tuần</p>
            <p className="kpi-card__value">{week.summary.win_rate}%</p>
            <p className="kpi-card__sub">{week.summary.total_deals} Won · {week.summary.lost_deals} Lost trong tuần</p>
          </div>

          <div className="card kpi-card">
            <p className="kpi-card__label">Tốc độ chốt trung bình</p>
            <p className="kpi-card__value">{avgSpeed ?? '—'} ngày</p>
            <p className="kpi-card__sub">Từ lúc tạo báo giá đến Won</p>
          </div>
        </div>

        <div className="pulse__main-grid">
          <div className="card pulse__panel">
            <div className="card__header">
              <h3 className="card__title">Theo team</h3>
              <span className="pulse__panel-note">SL &amp; doanh thu tuần · lũy kế so target {week.report.quarter}</span>
            </div>
            <div className="table-wrap">
              <table className="leaderboard">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th style={{ textAlign: 'right' }}>SL tuần</th>
                    <th style={{ textAlign: 'right' }}>Doanh thu tuần</th>
                    <th style={{ textAlign: 'right' }}>Lũy kế quý</th>
                    <th style={{ textAlign: 'right' }}>% Target quý</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="leaderboard__grand-total">
                    <td>Tổng cộng</td>
                    <td className="leaderboard__num">{teamTotal.week_count}</td>
                    <td className="leaderboard__num">{fmtVNDFull(teamTotal.week_value)}</td>
                    <td className="leaderboard__num">{fmtVNDFull(teamTotal.accu_q)}</td>
                    <td className="leaderboard__num">{teamTotalPct ?? '—'}%</td>
                  </tr>
                  {groupByDepartment(week.report.teams).map(([dept, teams]) => (
                    <Fragment key={dept}>
                      <tr className="leaderboard__dept-header">
                        <td colSpan={5}>{dept || 'Khác'}</td>
                      </tr>
                      {teams.map(t => (
                        <tr key={t.team}>
                          <td className="leaderboard__name">{t.team}</td>
                          <td className="leaderboard__num">{t.week_count}</td>
                          <td className="leaderboard__num">{fmtVNDFull(t.week_value)}</td>
                          <td className="leaderboard__num">{fmtVNDFull(t.accu_q)}</td>
                          <td className="leaderboard__num" style={{ fontWeight: 700, color: pctColor(t.pct_q) }}>
                            {t.pct_q ?? '—'}%
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pulse__rail">
            <div className="card pulse__panel">
              <div className="card__header"><h3 className="card__title">Điểm nổi bật</h3></div>
              <div className="pulse__highlight-list">
                {bestTeam && (
                  <div className="pulse__highlight pulse__highlight--good">
                    <div className="pulse__highlight-body">
                      <span className="pulse__highlight-title">{bestTeam.team} dẫn đầu</span>
                      <span className="pulse__highlight-sub">Đạt {bestTeam.pct_q}% target quý</span>
                    </div>
                  </div>
                )}
                {worstTeam && (
                  <div className="pulse__highlight pulse__highlight--behind">
                    <div className="pulse__highlight-body">
                      <span className="pulse__highlight-title">{worstTeam.team} cần chú ý</span>
                      <span className="pulse__highlight-sub">Mới đạt {worstTeam.pct_q}% target quý — thấp nhất công ty</span>
                    </div>
                  </div>
                )}
                <div className="pulse__highlight pulse__highlight--info">
                  <div className="pulse__highlight-body">
                    <span className="pulse__highlight-title">Win rate tuần</span>
                    <span className="pulse__highlight-sub">{week.summary.win_rate}% toàn công ty, tốc độ chốt {avgSpeed ?? '—'} ngày</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="card pulse__panel">
              <div className="card__header"><h3 className="card__title">Top salesperson tuần</h3></div>
              <div className="pulse__mini-board">
                {topReps.map((r, i) => (
                  <div className="pulse__mini-row" key={r.owner_id}>
                    <span className="pulse__mini-rank">{i + 1}</span>
                    <span className="pulse__mini-name">{r.name} <span className="pulse__mini-team">· {r.team}</span></span>
                    <span className="pulse__mini-value">{fmtVNDFull(r.total_value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 03 · Kế hoạch tuần tới ═══ */}
      <section className="pulse__section">
        <SectionHead
          num="03"
          title="Kế hoạch tuần tới"
          sub="Pipeline dự kiến chốt — chuẩn bị trước, không để bị động"
          pill={`${fmtShortDate(nextWeek.from)} → ${fmtShortDate(nextWeek.to)}`}
        />

        <div className="kpi-grid kpi-grid--3">
          <div className="card kpi-card">
            <p className="kpi-card__label">Dự kiến chốt tuần tới</p>
            <p className="kpi-card__value">{fmtVND(upcomingValue)}</p>
            <p className="kpi-card__sub">{upcoming.length} cơ hội có ngày dự kiến trong tuần</p>
          </div>
          <div className="card kpi-card">
            <p className="kpi-card__label">Tiềm năng cao</p>
            <p className="kpi-card__value">{upcomingHigh.length}</p>
            <p className="kpi-card__sub">{fmtVND(upcomingHigh.reduce((s, o) => s + o.value, 0))} · Sale tự đánh giá potential = High</p>
          </div>
          <div className="card kpi-card">
            <p className="kpi-card__label">Cần theo dõi</p>
            <p className="kpi-card__value" style={{ color: 'var(--accent)' }}>{pipeline.aging.length}</p>
            <p className="kpi-card__sub">Cơ hội mở quá 90 ngày, tổng {fmtVND(pipeline.aging.reduce((s, a) => s + a.value, 0))}</p>
          </div>
        </div>

        <div className="pulse__main-grid">
          <div className="card pulse__panel">
            <div className="card__header">
              <h3 className="card__title">Top cơ hội dự kiến chốt</h3>
              <span className="pulse__panel-note">Sắp theo giá trị giảm dần</span>
            </div>
            {upcoming.length === 0 ? (
              <p className="table-placeholder">Chưa có cơ hội nào có ngày dự kiến chốt trong tuần tới.</p>
            ) : (
              <div className="table-wrap">
                <table className="leaderboard">
                  <thead>
                    <tr>
                      <th>Cơ hội</th>
                      <th>Chủ sở hữu</th>
                      <th style={{ textAlign: 'right' }}>Giá trị</th>
                      <th>Tiềm năng</th>
                      <th>Dự kiến chốt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcoming.slice(0, 8).map(o => (
                      <tr key={o.opp_number}>
                        <td className="leaderboard__name">
                          <a className="crm-link" href={o.crm_link} target="_blank" rel="noreferrer">{o.name}</a>
                        </td>
                        <td>{o.owner}</td>
                        <td className="leaderboard__num">{fmtVNDFull(o.value)}</td>
                        <td>
                          <span className={`win-rate win-rate--${potentialLevel(o.potential)}`}>{o.potential || 'Chưa đánh giá'}</span>
                        </td>
                        <td>{o.estimated_close ? fmtShortDate(o.estimated_close) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="pulse__rail">
            <div className="card pulse__panel">
              <div className="card__header"><h3 className="card__title">Cần thúc trước cuộc họp</h3></div>
              <div className="pulse__highlight-list">
                <div className="pulse__highlight pulse__highlight--behind">
                  <div className="pulse__highlight-body">
                    <span className="pulse__highlight-title">{pipeline.aging.length} cơ hội quá hạn 90 ngày</span>
                    <span className="pulse__highlight-sub">Tổng {fmtVND(pipeline.aging.reduce((s, a) => s + a.value, 0))} — dễ mất động lực nếu không có động thái</span>
                  </div>
                </div>
                {noEstimateHigh.length > 0 && (
                  <div className="pulse__highlight pulse__highlight--watch">
                    <div className="pulse__highlight-body">
                      <span className="pulse__highlight-title">{noEstimateHigh.length} cơ hội tiềm năng cao chưa có ngày dự kiến</span>
                      <span className="pulse__highlight-sub">Potential = High nhưng chưa nhập ngày chốt dự kiến trên CRM</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
