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

function applyRollingTarget(
  data:         MergedPoint[],
  qt:           KpiQuarterly,
  groupBy:      GroupBy,
): MergedPoint[] {
  if (data.length === 0) return data
  const bases = periodTargets(data.length, qt, groupBy)
  return data.map((d, i) => ({ ...d, target: bases[i] }))
}

export function RevenueChart({ data, prevData, loading, groupBy, quarterlyTargets }: Props) {
  const base   = mergeData(data, prevData, groupBy)
  const hasKpi = quarterlyTargets && (quarterlyTargets.q1 + quarterlyTargets.q2 + quarterlyTargets.q3 + quarterlyTargets.q4) > 0

  const merged = hasKpi ? applyRollingTarget(base, quarterlyTargets, groupBy) : base

  return (
    <div className="card">
      <h2 className="card__title">Giá trị hợp đồng theo kỳ</h2>

      <div className={loading ? 'chart-wrap chart-wrap--loading' : 'chart-wrap'}>
        {!loading && data.length === 0 && prevData.length === 0 ? (
          <p className="chart-empty">Không có dữ liệu trong kỳ này</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={merged} margin={{ top: 28, right: 8, left: 0, bottom: 0 }} barGap={3} barCategoryGap="30%">
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
                formatter={(value: unknown) => fmtVND(Number(value))}
                labelStyle={{ color: 'var(--text-h)', fontWeight: 600 }}
                contentStyle={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 13,
                  boxShadow: 'var(--shadow)',
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
                <LabelList
                  dataKey="current"
                  position="top"
                  formatter={(v: unknown) => Number(v) === 0 ? '' : fmtAxisVND(Number(v))}
                  style={{ fontSize: 10, fill: 'var(--text)' }}
                />
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
