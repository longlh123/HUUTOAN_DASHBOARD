import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { PeriodData, GroupBy, KpiQuarterly } from '../api/sales'
import { fmtVND, fmtAxisVND } from '../utils/format'

type Props = {
  data:               PeriodData[]
  prevData:           PeriodData[]
  loading:            boolean
  groupBy:            GroupBy
  quarterlyTargets?:  KpiQuarterly
  title?:             string
}

type MergedPoint = { key: string; label: string; current: number; prev: number; target?: number }

function stripYear(period: string): string {
  if (/^Q\d/.test(period)) return period.split(' ')[0]  // "Q1 2025" → "Q1"
  const parts = period.split('-')
  return parts.length >= 2 ? parts[1] : period           // "2025-03"  → "03"
}

function toLabel(key: string): string {
  if (/^Q/.test(key)) return key
  return `Th.${parseInt(key, 10)}`
}

function mergeData(current: PeriodData[], prev: PeriodData[], groupBy: GroupBy): MergedPoint[] {
  const map = new Map<string, MergedPoint>()

  if (groupBy === 'quarter') {
    for (const q of ['Q1', 'Q2', 'Q3', 'Q4'])
      map.set(q, { key: q, label: q, current: 0, prev: 0 })
  } else if (groupBy === 'month') {
    for (let m = 1; m <= 12; m++) {
      const key = String(m).padStart(2, '0')
      map.set(key, { key, label: toLabel(key), current: 0, prev: 0 })
    }
  }

  for (const d of prev) {
    const key = stripYear(d.period)
    const e   = map.get(key)
    if (e) e.prev = d.value
    else map.set(key, { key, label: toLabel(key), current: 0, prev: d.value })
  }
  for (const d of current) {
    const key = stripYear(d.period)
    const e   = map.get(key)
    if (e) e.current = d.value
    else map.set(key, { key, label: toLabel(key), current: d.value, prev: 0 })
  }
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key))
}

function periodTargets(count: number, qt: KpiQuarterly, groupBy: GroupBy): number[] {
  if (groupBy === 'quarter') return [qt.q1, qt.q2, qt.q3, qt.q4].slice(0, count)
  if (groupBy === 'month')   return Array.from({ length: count }, (_, i) => [qt.q1, qt.q2, qt.q3, qt.q4][Math.floor(i / 3)] / 3)
  const annual = qt.q1 + qt.q2 + qt.q3 + qt.q4
  return Array.from({ length: count }, () => annual / count)
}

function pctColor(pct: number): string {
  if (pct >= 100) return '#16a34a'
  if (pct >= 70)  return '#ca8a04'
  return '#dc2626'
}

function applyRollingTarget(
  data:         MergedPoint[],
  qt:           KpiQuarterly,
  groupBy:      GroupBy,
): MergedPoint[] {
  if (data.length === 0) return data
  const bases = periodTargets(data.length, qt, groupBy)
  return data.map((d, i) => ({ ...d, target: bases[i] }))
}

export function RevenueChart({ data, prevData, loading, groupBy, quarterlyTargets, title = 'Giá trị hợp đồng theo kỳ' }: Props) {
  const base   = mergeData(data, prevData, groupBy)
  const hasKpi = quarterlyTargets && (quarterlyTargets.q1 + quarterlyTargets.q2 + quarterlyTargets.q3 + quarterlyTargets.q4) > 0

  const merged = hasKpi ? applyRollingTarget(base, quarterlyTargets, groupBy) : base

  // Label riêng cho bar "Năm nay" — dòng giá trị + dòng % target (màu theo ngưỡng đạt/chưa đạt),
  // chỉ hiện % khi có KPI target cho kỳ đó.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderCurrentLabel = (props: any) => {
    const x = Number(props.x ?? 0)
    const y = Number(props.y ?? 0)
    const width = Number(props.width ?? 0)
    const index = props.index ?? 0
    const v = Number(props.value)
    if (v === 0) return null

    const cx  = x + width / 2
    const d   = merged[index]
    const pct = hasKpi && d?.target ? Math.round(v / d.target * 100) : null

    return (
      <g>
        <text x={cx} y={y - (pct !== null ? 14 : 4)} textAnchor="middle" fontSize={10} fill="var(--text)">
          {fmtAxisVND(v)}
        </text>
        {pct !== null && (
          <text x={cx} y={y - 2} textAnchor="middle" fontSize={10} fontWeight={700} fill={pctColor(pct)}>
            {pct}%
          </text>
        )}
      </g>
    )
  }

  return (
    <div className="card">
      <h2 className="card__title">{title}</h2>

      <div className={loading ? 'chart-wrap chart-wrap--loading' : 'chart-wrap'}>
        {!loading && data.length === 0 && prevData.length === 0 ? (
          <p className="chart-empty">Không có dữ liệu trong kỳ này</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={merged} margin={{ top: 40, right: 8, left: 0, bottom: 0 }} barGap={3} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: 'var(--text)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={fmtAxisVND}
                tick={{ fontSize: 12, fill: 'var(--text)' }}
                axisLine={false}
                tickLine={false}
                width={64}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload as MergedPoint
                  const pct = hasKpi && d.target ? Math.round(d.current / d.target * 100) : null

                  return (
                    <div style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      fontSize: 13,
                      boxShadow: 'var(--shadow)',
                    }}>
                      <p style={{ color: 'var(--text-h)', fontWeight: 600, margin: '0 0 4px' }}>{label}</p>
                      {d.target !== undefined && (
                        <p style={{ margin: '2px 0', color: '#f59e0b' }}>KPI: {fmtVND(d.target)}</p>
                      )}
                      <p style={{ margin: '2px 0', color: 'var(--accent)' }}>Năm nay: {fmtVND(d.current)}</p>
                      <p style={{ margin: '2px 0', color: '#94a3b8' }}>Năm ngoái: {fmtVND(d.prev)}</p>
                      {pct !== null && (
                        <p style={{ margin: '4px 0 0', fontWeight: 700, color: pctColor(pct) }}>{pct}% target</p>
                      )}
                    </div>
                  )
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar dataKey="prev" name="Năm ngoái" fill="#94a3b8" radius={[4, 4, 0, 0]} maxBarSize={52}>
                <LabelList
                  dataKey="prev"
                  position="top"
                  formatter={(v: unknown) => Number(v) === 0 ? '' : fmtAxisVND(Number(v))}
                  style={{ fontSize: 10, fill: 'var(--text)' }}
                />
              </Bar>
              <Bar dataKey="current" name="Năm nay" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={52}>
                <LabelList dataKey="current" position="top" content={renderCurrentLabel} />
              </Bar>
              {hasKpi && (
                <Line
                  dataKey="target"
                  name="KPI"
                  type="linear"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                >
                  <LabelList
                    dataKey="target"
                    position="top"
                    formatter={(v: unknown) => Number(v) === 0 ? '' : fmtAxisVND(Number(v))}
                    style={{ fontSize: 10, fill: '#f59e0b', fontWeight: 600 }}
                  />
                </Line>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
