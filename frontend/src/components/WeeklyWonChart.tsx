import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, Tooltip, LabelList, ResponsiveContainer } from 'recharts'
import type { WeeklyDealItem } from '../api/sales'
import { fetchWeeklyDeals } from '../api/sales'
import { fmtVND } from '../utils/format'

type Props = {
  territory:   string
  department?: string
}

function fmtDay(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${parseInt(d)}/${parseInt(m)}`
}

function weekLabel(offset: number): string {
  if (offset === 0)  return 'Tuần này'
  if (offset === -1) return 'Tuần trước'
  return `${Math.abs(offset)} tuần trước`
}

export function WeeklyWonChart({ territory, department }: Props) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [data,       setData]       = useState<WeeklyDealItem[]>([])
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchWeeklyDeals(territory, weekOffset, department)
      .then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [territory, department, weekOffset])

  const chartData = data.map(d => ({
    ...d,
    _lbl: d.count > 0 ? `${d.count}::${d.value}` : '',
  }))

  const totalCount = data.reduce((s, d) => s + d.count, 0)
  const totalRevenue = data.reduce((s, d) => s + d.value, 0)
  const weekRange  = data.length === 7
    ? `${fmtDay(data[0].date)} – ${fmtDay(data[6].date)}`
    : ''

  return (
    <div className="card">
      <div className="chart-header">
        <div>
          <p className="card__title" style={{ marginBottom: 2 }}>{weekLabel(weekOffset)}</p>
          {weekRange && <p style={{ fontSize: 12, color: 'var(--text)' }}>{weekRange}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!loading && totalCount > 0 && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-h)', margin: 0, lineHeight: 1.15 }}>
                {totalCount}
                <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text)', marginLeft: 6 }}>
                  hợp đồng
                </span>
              </p>
              <p style={{ fontSize: 12, color: 'var(--text)', fontWeight: 800, margin: 0 }}>{fmtVND(totalRevenue)}</p>
            </div>
          )}
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="pagination__btn" onClick={() => setWeekOffset(o => o - 1)} title="Tuần trước">←</button>
            <button className="pagination__btn" onClick={() => setWeekOffset(o => o + 1)} disabled={weekOffset >= 0} title="Tuần sau">→</button>
          </div>
        </div>
      </div>

      <div className={`chart-wrap${loading ? ' chart-wrap--loading' : ''}`} style={{ overflow: 'visible' }}>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} margin={{ top: 48, right: 4, left: 4, bottom: 0 }} style={{ overflow: 'visible' }}>
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'var(--text)' }}
            />
            <Tooltip
              cursor={{ fill: 'var(--accent-light)' }}
              position={{ y: 80 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload as WeeklyDealItem
                if (!d.count) return null
                return (
                  <div className="card" style={{ padding: '8px 12px', fontSize: 12 }}>
                    <p style={{ fontWeight: 600, marginBottom: 4 }}>{d.date}</p>
                    <p style={{ margin: 0 }}>{d.count} hợp đồng · {fmtVND(d.value)}</p>
                  </div>
                )
              }}
            />
            <Bar dataKey="count" fill="var(--accent)" maxBarSize={48} radius={[3, 3, 0, 0]}>
              <LabelList
                dataKey="_lbl"
                content={(props) => {
                  const { x, y, width, value } = props
                  if (!value) return null
                  const [countStr, valStr] = String(value).split('::')
                  const cx = Number(x) + Number(width) / 2
                  return (
                    <text textAnchor="middle">
                      <tspan x={cx} y={Number(y) - 20} fontSize={12} fontWeight={700} fill="var(--text-h)">{countStr}</tspan>
                      <tspan x={cx} y={Number(y) - 6} fontSize={10} fontWeight={400} fill="var(--text)">{fmtVND(Number(valStr))}</tspan>
                    </text>
                  )
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
