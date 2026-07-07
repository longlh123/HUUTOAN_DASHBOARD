import { useState } from 'react'
import type { PipelineData, PotentialData, GapToTargetItem } from '../api/sales'
import { fmtVND, fmtVNDFull } from '../utils/format'

type Props = {
  data:       PipelineData | null
  loading:    boolean
  gapData:    GapToTargetItem[]
  gapLoading: boolean
}

const PAGE_SIZE = 10
const currentYear    = new Date().getFullYear()
const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3)
const nextQ1     = (currentQuarter % 4) + 1
const nextQ1Year = currentQuarter === 4 ? currentYear + 1 : currentYear
const nextQ2     = (nextQ1 % 4) + 1

function potentialColor(label: string): string {
  switch (label.toLowerCase()) {
    case 'high':   return '#16a34a'
    case 'medium': return '#d97706'
    case 'low':    return '#6b7280'
    default:       return '#9ca3af'
  }
}

function PotentialBreakdown({ items, total }: { items: PotentialData[]; total: number }) {
  if (!items || items.length === 0) return null
  const totalValue = items.reduce((s, i) => s + i.value, 0)
  return (
    <div className="gap-target">
      <div className="potential-breakdown__track">
        {items.map(item => (
          <div
            key={item.label}
            className="potential-breakdown__segment"
            style={{ width: `${item.pct}%`, backgroundColor: potentialColor(item.label) }}
            title={`${item.label}: ${item.count} co hoi (${item.pct}%)`}
          />
        ))}
      </div>
      <div className="gap-target__labels">
        <span className="gap-target__label-actual">{fmtVND(totalValue)}</span>
        <span className="gap-target__label-meta">{total} co hoi · tong gia tri</span>
      </div>
      <div className="gap-target__forecast">
        <p className="gap-target__forecast-title">Phan bo theo muc do:</p>
        {items.map(item => (
          <div key={item.label} className="gap-target__forecast-row">
            <span className="potential-breakdown__dot" style={{ backgroundColor: potentialColor(item.label) }} />
            <span className="gap-target__forecast-label">{item.label}</span>
            <span className="gap-target__forecast-add">{item.count}/{total}</span>
            <span className="gap-target__forecast-projected">{fmtVND(item.value)}</span>
            <span className="gap-target__forecast-pct gap-target__forecast-pct--hit">
              {item.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}


function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`
}

function isUrgent(iso: string | null, days: number): boolean {
  if (!iso) return false
  const diff = (new Date(iso).getTime() - Date.now()) / 86_400_000
  return diff >= 0 && diff <= days
}

function oppQuarterYear(iso: string | null): { quarter: number; year: number } | null {
  if (!iso) return null
  const d = new Date(iso)
  return { quarter: Math.ceil((d.getMonth() + 1) / 3), year: d.getFullYear() }
}

type SortCol = 'potential' | 'value' | 'close_date'
type SortDir = 'asc' | 'desc'

const POTENTIAL_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 }
const DEFAULT_DIR: Record<SortCol, SortDir>  = { potential: 'desc', value: 'desc', close_date: 'asc' }

function sortIcon(col: SortCol, active: SortCol, dir: SortDir): string {
  if (col !== active) return ' ↕'
  return dir === 'asc' ? ' ↑' : ' ↓'
}

export function PipelineHealth({ data, loading, gapData, gapLoading }: Props) {
  const [topWinPage, setTopWinPage]     = useState(0)
  const [topWinFilter, setTopWinFilterRaw] = useState<'ALL' | 'PREV' | 'CURRENT' | 'NEXT'>('CURRENT')
  const [sortCol, setSortCol]           = useState<SortCol>('value')
  const [sortDir, setSortDir]           = useState<SortDir>('desc')

  function setTopWinFilter(f: 'ALL' | 'PREV' | 'CURRENT' | 'NEXT') {
    setTopWinFilterRaw(f)
    setTopWinPage(0)
  }

  function handleSort(col: SortCol) {
    if (col === sortCol) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir(DEFAULT_DIR[col])
    }
    setTopWinPage(0)
  }

  if (loading && !data) {
    return <p className="table-placeholder">Dang tai...</p>
  }
  if (!data) return null

  const currentGap  = gapData.find(d => d.quarter === `Q${currentQuarter}`)
  const attainment  = currentGap && currentGap.target > 0
    ? Math.min(100, Math.round(currentGap.actual / currentGap.target * 100))
    : 0

  const coverage = currentGap && currentGap.gap > 0
    ? data.pipeline_value / currentGap.gap
    : null

  function coverageColor(c: number): string {
    return c >= 3 ? '#16a34a' : c >= 1.5 ? '#d97706' : '#dc2626'
  }
  function coverageLabel(c: number): string {
    return c >= 3 ? 'Đủ pipeline' : c >= 1.5 ? 'Cần thêm' : 'Thiếu pipeline'
  }

  const prevQ    = currentQuarter === 1 ? 4 : currentQuarter - 1
  const prevYear = currentQuarter === 1 ? currentYear - 1 : currentYear
  const resolved = topWinFilter === 'ALL' ? null
    : topWinFilter === 'PREV'    ? { quarter: prevQ,         year: prevYear }
    : topWinFilter === 'CURRENT' ? { quarter: currentQuarter, year: currentYear }
    : { quarter: nextQ1, year: nextQ1Year }

  const allTopWin      = data.top_win ?? []
  const filteredTopWin = (resolved === null
    ? allTopWin
    : allTopWin.filter(o => {
        const oq = oppQuarterYear(o.estimated_close)
        return oq !== null && oq.quarter === resolved.quarter && oq.year === resolved.year
      })
  ).slice().sort((a, b) => {
    let cmp = 0
    if (sortCol === 'potential') {
      cmp = (POTENTIAL_RANK[a.potential?.toLowerCase() ?? ''] ?? 0)
          - (POTENTIAL_RANK[b.potential?.toLowerCase() ?? ''] ?? 0)
    } else if (sortCol === 'value') {
      cmp = a.value - b.value
    } else {
      const ta = a.estimated_close ? new Date(a.estimated_close).getTime() : Infinity
      const tb = b.estimated_close ? new Date(b.estimated_close).getTime() : Infinity
      cmp = ta - tb
    }
    return sortDir === 'asc' ? cmp : -cmp
  })
  const topWinTotal = filteredTopWin.length
  const topWinPages = Math.ceil(topWinTotal / PAGE_SIZE)
  const topWinSlice = filteredTopWin.slice(topWinPage * PAGE_SIZE, (topWinPage + 1) * PAGE_SIZE)

  return (
    <div className="pipeline-health">
      <div className="kpi-grid">
        <div className="card">
          <div className="kpi-card__label">Pipeline Value</div>
          <div className="kpi-card__value">{fmtVND(data.pipeline_value)}</div>
          <div className="kpi-card__sub">
            {data.opportunity_count} co hoi dang co bao gia
          </div>
        </div>
        <div className="card">
          <div className="kpi-card__label">Du bao quy hien tai</div>
          <div className="kpi-card__value">{fmtVND(data.forecast_current_quarter)}</div>
          <div className="kpi-card__sub">
            {data.forecast_current_quarter_count} co hoi con lai trong Q{currentQuarter}
          </div>
        </div>
        <div className="card">
          <div className="kpi-card__label">Du bao quy tiep theo</div>
          <div className="kpi-card__value">{fmtVND(data.forecast_next_quarter)}</div>
          <div className="kpi-card__sub">
            {data.forecast_next_quarter_count} co hoi trong Q{nextQ1}
          </div>
        </div>
        <div className="card">
          <div className="kpi-card__label">Weighted Pipeline</div>
          <div className="kpi-card__value">{fmtVND(data.weighted_pipeline)}</div>
          <div className="kpi-card__sub">theo xac suat chot</div>
        </div>
      </div>

      <div className="pipeline-middle">
        <div className="card pipeline-middle__potential">
          <h2 className="card__title">Phan loai co hoi ({data.opportunity_count})</h2>
          <PotentialBreakdown items={data.by_potential ?? []} total={data.opportunity_count} />
        </div>

        <div className="card pipeline-middle__gap">
          <h2 className="card__title">Gap to Target Q{currentQuarter}</h2>
          {gapLoading && !currentGap ? (
            <p className="table-placeholder">Dang tai...</p>
          ) : !currentGap || currentGap.target === 0 ? (
            <p className="table-placeholder">Chua co du lieu KPI cho Q{currentQuarter}</p>
          ) : (
            <div className="gap-target">
              <div className="gap-target__bar-wrap">
                <div
                  className="gap-target__bar-actual"
                  style={{ width: `${attainment}%` }}
                  title={`Dat duoc: ${fmtVND(currentGap.actual)}`}
                />
                {currentGap.gap > 0 && (
                  <div
                    className="gap-target__bar-gap"
                    style={{ width: `${100 - attainment}%` }}
                    title={`Con lai: ${fmtVND(currentGap.gap)}`}
                  />
                )}
              </div>
              <div className="gap-target__labels">
                <span className="gap-target__label-actual">{fmtVND(currentGap.actual)}</span>
                <span className="gap-target__label-meta">
                  Muc tieu: {fmtVND(currentGap.target)}
                  {currentGap.gap === 0
                    ? ' · Vuot target'
                    : ` · Con lai: ${fmtVND(currentGap.gap)}`}
                </span>
              </div>

              {coverage !== null && (
                <div className="gap-target__coverage">
                  <span className="gap-target__coverage-label">Pipeline Coverage</span>
                  <span
                    className="gap-target__coverage-ratio"
                    style={{ color: coverageColor(coverage) }}
                  >
                    {coverage.toFixed(1)}x
                  </span>
                  <span
                    className="gap-target__coverage-badge"
                    style={{ color: coverageColor(coverage), borderColor: coverageColor(coverage) }}
                  >
                    {coverageLabel(coverage)}
                  </span>
                </div>
              )}
              {currentGap.gap === 0 && (
                <div className="gap-target__coverage">
                  <span className="gap-target__coverage-label">Pipeline Coverage</span>
                  <span className="gap-target__coverage-ratio" style={{ color: '#16a34a' }}>∞</span>
                  <span className="gap-target__coverage-badge" style={{ color: '#16a34a', borderColor: '#16a34a' }}>
                    Da vuot target
                  </span>
                </div>
              )}

              <div className="gap-target__forecast">
                <p className="gap-target__forecast-title">Kha nang dat target Q{currentQuarter} tu pipeline:</p>
                {[
                  { label: 'Quy hien tai', forecast: data.forecast_current_quarter,                              note: `Q${currentQuarter}` },
                  { label: '+ 1 quy toi',  forecast: data.forecast_current_quarter + data.forecast_next_quarter, note: `Q${currentQuarter}–Q${nextQ1}` },
                  { label: '+ 2 quy toi',  forecast: data.forecast_current_quarter + data.forecast_next_2q,      note: `Q${currentQuarter}–Q${nextQ2}` },
                ].map(({ label, forecast, note }) => {
                  const projected    = currentGap.actual + forecast
                  const projectedPct = currentGap.target > 0
                    ? Math.min(999, Math.round(projected / currentGap.target * 100))
                    : 0
                  const willHit = projected >= currentGap.target
                  return (
                    <div key={label} className="gap-target__forecast-row">
                      <span className="gap-target__forecast-label">{label}</span>
                      <span className="gap-target__forecast-add">+{fmtVND(forecast)}</span>
                      <span className="gap-target__forecast-projected">
                        {fmtVND(projected)}
                      </span>
                      <span className={`gap-target__forecast-pct gap-target__forecast-pct--${willHit ? 'hit' : 'miss'}`}>
                        {willHit ? '✓' : '✗'} {projectedPct}%
                      </span>
                      {note && <span className="gap-target__forecast-note">{note}</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {allTopWin.length > 0 && (
        <div className="card">
          <div className="card__header">
            <h2 className="card__title">Co hoi nen tap trung ({topWinTotal})</h2>
            <select
              className="leaderboard__filter"
              value={topWinFilter}
              onChange={e => setTopWinFilter(e.target.value as 'ALL' | 'PREV' | 'CURRENT' | 'NEXT')}
            >
              <option value="ALL">Tat ca</option>
              <option value="PREV">Quy truoc (Q{prevQ}/{prevYear})</option>
              <option value="CURRENT">Quy hien tai (Q{currentQuarter}/{currentYear})</option>
              <option value="NEXT">Quy tiep theo (Q{nextQ1}/{nextQ1Year})</option>
            </select>
          </div>
          <table className="leaderboard">
            <thead>
              <tr>
                <th style={{ textAlign: 'right' }}>#</th>
                <th>Ma</th>
                <th>Co hoi</th>
                <th>Salesperson</th>
                <th>Giai doan</th>
                <th
                  className="leaderboard__sortable"
                  style={{ textAlign: 'right' }}
                  onClick={() => handleSort('potential')}
                >
                  Muc do{sortIcon('potential', sortCol, sortDir)}
                </th>
                <th
                  className="leaderboard__sortable"
                  style={{ textAlign: 'right' }}
                  onClick={() => handleSort('close_date')}
                >
                  Du kien chot{sortIcon('close_date', sortCol, sortDir)}
                </th>
                <th
                  className="leaderboard__sortable"
                  style={{ textAlign: 'right' }}
                  onClick={() => handleSort('value')}
                >
                  Gia tri{sortIcon('value', sortCol, sortDir)}
                </th>
              </tr>
            </thead>
            <tbody>
              {topWinSlice.length === 0 ? (
                <tr><td colSpan={8} className="table-placeholder">Khong co co hoi nao trong quy nay</td></tr>
              ) : topWinSlice.map((opp, i) => (
                <tr key={i}>
                  <td className="leaderboard__rank">{topWinPage * PAGE_SIZE + i + 1}</td>
                  <td>
                    {opp.crm_link
                      ? <a href={opp.crm_link} target="_blank" rel="noreferrer" className="crm-link">
                          {opp.opp_number || 'Xem CRM'} ↗
                        </a>
                      : <span>{opp.opp_number || '—'}</span>
                    }
                  </td>
                  <td className="leaderboard__name">{opp.name}</td>
                  <td>{opp.owner}</td>
                  <td>{opp.stage}</td>
                  <td>
                    <span className="potential-badge" style={{ color: potentialColor(opp.potential), fontWeight: 600 }}>
                      {opp.potential || '—'}
                    </span>
                  </td>
                  <td className="leaderboard__num" style={isUrgent(opp.estimated_close, 30) ? { color: 'var(--accent)', fontWeight: 600 } : undefined}>
                    {fmtDate(opp.estimated_close)}
                  </td>
                  <td className="leaderboard__value">{fmtVNDFull(opp.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {topWinPages > 1 && (
            <div className="pagination">
              <button className="pagination__btn" disabled={topWinPage === 0} onClick={() => setTopWinPage(p => p - 1)}>
                &laquo; Truoc
              </button>
              <span className="pagination__info">Trang {topWinPage + 1} / {topWinPages} ({topWinTotal} co hoi)</span>
              <button className="pagination__btn" disabled={topWinPage >= topWinPages - 1} onClick={() => setTopWinPage(p => p + 1)}>
                Tiep &raquo;
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
