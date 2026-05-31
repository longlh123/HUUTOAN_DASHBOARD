import { useState } from 'react'
import type { PipelineData, GapToTargetItem } from '../api/sales'
import { fmtVND, fmtVNDFull } from '../utils/format'

type Props = {
  data:       PipelineData | null
  loading:    boolean
  gapData:    GapToTargetItem[]
  gapLoading: boolean
}

const PAGE_SIZE = 10
const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3)

function probLevel(prob: number): string {
  if (prob >= 70) return 'high'
  if (prob >= 40) return 'mid'
  return 'low'
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

export function PipelineHealth({ data, loading, gapData, gapLoading }: Props) {
  const [agingPage, setAgingPage] = useState(0)

  if (loading && !data) {
    return <p className="table-placeholder">Dang tai...</p>
  }
  if (!data) return null

  const currentGap  = gapData.find(d => d.quarter === `Q${currentQuarter}`)
  const attainment  = currentGap && currentGap.target > 0
    ? Math.min(100, Math.round(currentGap.actual / currentGap.target * 100))
    : 0

  const agingTotal = data.aging.length
  const agingPages = Math.ceil(agingTotal / PAGE_SIZE)
  const agingSlice = data.aging.slice(agingPage * PAGE_SIZE, (agingPage + 1) * PAGE_SIZE)

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
          <div className="kpi-card__label">Weighted Pipeline</div>
          <div className="kpi-card__value">{fmtVND(data.weighted_pipeline)}</div>
          <div className="kpi-card__sub">theo xac suat chot</div>
        </div>
        <div className="card">
          <div className="kpi-card__label">Du bao 30 ngay</div>
          <div className="kpi-card__value">{fmtVND(data.forecast_30d)}</div>
          <div className="kpi-card__sub">theo ngay du kien chot</div>
        </div>
        <div className="card">
          <div className="kpi-card__label">Du bao 60 / 90 ngay</div>
          <div className="kpi-card__value">{fmtVND(data.forecast_60d)}</div>
          <div className="kpi-card__sub">{fmtVND(data.forecast_90d)} trong 90 ngay</div>
        </div>
      </div>

      <div className="card">
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

            <div className="gap-target__forecast">
              <p className="gap-target__forecast-title">Kha nang dat target tu pipeline:</p>
              {[
                { label: '30 ngay', forecast: data.forecast_30d, note: null },
                { label: '60 ngay', forecast: data.forecast_60d, note: 'bao gom Q3' },
                { label: '90 ngay', forecast: data.forecast_90d, note: 'bao gom Q3' },
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

      {(data.top_win ?? []).length > 0 && (
        <div className="card">
          <h2 className="card__title">Top 10 Co hoi nen tap trung</h2>
          <table className="leaderboard">
            <thead>
              <tr>
                <th style={{ textAlign: 'right' }}>#</th>
                <th>Ma</th>
                <th>Co hoi</th>
                <th>Salesperson</th>
                <th>Giai doan</th>
                <th style={{ textAlign: 'right' }}>Xac suat</th>
                <th style={{ textAlign: 'right' }}>Du kien chot</th>
                <th style={{ textAlign: 'right' }}>Gia tri</th>
              </tr>
            </thead>
            <tbody>
              {(data.top_win ?? []).map((opp, i) => (
                <tr key={i}>
                  <td className="leaderboard__rank">{i + 1}</td>
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
                  <td className="leaderboard__num">
                    <span className={`win-rate win-rate--${probLevel(opp.close_probability)}`}>
                      {opp.close_probability}%
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
        </div>
      )}

      {agingTotal > 0 && (
        <div className="card">
          <h2 className="card__title">Co hoi hang hoa (&gt;90 ngay)</h2>
          <table className="leaderboard">
            <thead>
              <tr>
                <th>Co hoi</th>
                <th>Salesperson</th>
                <th>Giai doan</th>
                <th style={{ textAlign: 'right' }}>So ngay mo</th>
                <th style={{ textAlign: 'right' }}>Gia tri</th>
              </tr>
            </thead>
            <tbody>
              {agingSlice.map((opp, i) => (
                <tr key={i}>
                  <td>{opp.name}</td>
                  <td>{opp.owner}</td>
                  <td>{opp.stage}</td>
                  <td className="leaderboard__num">{opp.days_open}</td>
                  <td className="leaderboard__value">{fmtVNDFull(opp.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {agingPages > 1 && (
            <div className="pagination">
              <button
                className="pagination__btn"
                disabled={agingPage === 0}
                onClick={() => setAgingPage(p => p - 1)}
              >
                &laquo; Truoc
              </button>
              <span className="pagination__info">
                Trang {agingPage + 1} / {agingPages} ({agingTotal} co hoi)
              </span>
              <button
                className="pagination__btn"
                disabled={agingPage >= agingPages - 1}
                onClick={() => setAgingPage(p => p + 1)}
              >
                Tiep &raquo;
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
