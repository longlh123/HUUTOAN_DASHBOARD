import { Fragment, useMemo } from 'react'
import { PieChart, Pie, Tooltip, ResponsiveContainer } from 'recharts'
import type { TeamData } from '../api/sales'
import { fmtVND } from '../utils/format'

const COLORS = ['#C8102E', '#3b82f6', '#0d9488', '#f97316', '#8b5cf6', '#ec4899', '#64748b']

type DeptItem = { name: string; actual: number; target: number; fill: string }
type PieItem  = { name: string; value: number; fill: string; pct?: number }

type Props = { data: TeamData[]; loading: boolean; department?: string; companyTarget?: number | null }

function pctColor(pct: number): string {
  if (pct >= 100) return '#16a34a'
  if (pct >= 70)  return '#ca8a04'
  return '#dc2626'
}

export function TeamTargetChart({ data, loading, department, companyTarget }: Props) {
  // Khi đã lọc theo 1 department cụ thể, mọi dòng đều cùng department nên group theo
  // department không còn ý nghĩa — group theo team (business unit) bên trong department đó.
  const depts = useMemo((): DeptItem[] => {
    const map = new Map<string, { name: string; actual: number; target: number }>()
    data.forEach(t => {
      const key = department ? (t.name || 'Khác') : (t.department || 'Khác')
      const d   = map.get(key) ?? { name: key, actual: 0, target: 0 }
      d.actual += t.total_value
      d.target += t.kpi ?? 0
      map.set(key, d)
    })
    return Array.from(map.values())
      .filter(d => d.actual > 0 || d.target > 0)
      .sort((a, b) => b.actual - a.actual)
      .map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))
  }, [data, department])

  const totalActual = depts.reduce((s, d) => s + d.actual, 0)
  // Xem "ALL" (không lọc department) → dùng thẳng target tổng công ty (kpi_company_targets),
  // không cộng dồn target từng team nữa (team có thể chưa nhập đủ, làm số lệch khỏi target thật).
  // Đã lọc theo 1 department cụ thể → vẫn cộng target của các team trong department đó (đúng cũ).
  const totalTarget = department ? depts.reduce((s, d) => s + d.target, 0) : (companyTarget ?? 0)
  const overallPct  = totalTarget > 0 ? Math.round(totalActual / totalTarget * 100) : null

  // Toàn bộ cung = target; từng dept chiếm actual/target của cung; phần xám = còn lại
  const pieData = useMemo((): PieItem[] => {
    if (totalTarget <= 0) return []
    const slices: PieItem[] = depts
      .filter(d => d.actual > 0)
      .map(d => ({
        name:  d.name,
        value: d.actual,
        fill:  d.fill,
        pct:   Math.round(d.actual / totalTarget * 100),
      }))
    const remaining = totalTarget - totalActual
    if (remaining > 0) {
      slices.push({ name: 'Còn lại', value: remaining, fill: 'var(--border)' })
    }
    return slices
  }, [depts, totalActual, totalTarget])

  return (
    <div className="card">
      <div className="chart-header">
        <p className="card__title">{department ? 'Team vs. Target năm' : 'Department vs. Target năm'}</p>
        {!loading && overallPct !== null && (
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-h)', margin: 0 }}>
              <span style={{ color: pctColor(overallPct) }}>{overallPct}%</span>
              <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text)', marginLeft: 6 }}>target</span>
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {fmtVND(totalActual)} / {fmtVND(totalTarget)}
            </p>
          </div>
        )}
      </div>

      {!loading && depts.length === 0 ? (
        <p style={{ color: 'var(--text)', fontSize: 13, margin: '32px 0', textAlign: 'center' }}>Chưa có dữ liệu</p>
      ) : (
        <div className={`team-target__body${loading ? ' chart-wrap--loading' : ''}`}>
          {/* Left: semi-donut */}
          <div style={{ flexShrink: 0, width: 350 }}>
            <ResponsiveContainer width="100%" height={165}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="100%"
                  startAngle={180}
                  endAngle={0}
                  innerRadius={80}
                  outerRadius={132}
                  paddingAngle={1}
                  strokeWidth={0}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload as PieItem
                    if (d.name === 'Còn lại') return null
                    return (
                      <div className="card" style={{ padding: '8px 12px', fontSize: 12, minWidth: 140 }}>
                        <p style={{ fontWeight: 600, marginBottom: 4 }}>{d.name}</p>
                        <p style={{ margin: '2px 0' }}>Thực tế: {fmtVND(d.value)}</p>
                        {d.pct !== undefined && (
                          <p style={{ margin: 0, fontWeight: 700, color: 'var(--accent)' }}>{d.pct}% target</p>
                        )}
                      </div>
                    )
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Right: legend dạng grid — cột tự co theo content */}
          <div style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '10px minmax(120px, 1fr) auto auto',
            columnGap: 8,
            rowGap: 7,
            alignContent: 'flex-start',
            paddingTop: 8,
            fontSize: 12,
          }}>
            {depts.map((d, i) => {
              // % o day la ty trong dong gop trong TONG THUC TE (100%), khac voi %
              // hien o goc tren ben phai la % dat TARGET tong the (vd 48%)
              const pct = totalActual > 0 ? Math.round(d.actual / totalActual * 100) : null
              return (
                <Fragment key={d.name}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length], display: 'inline-block', alignSelf: 'center' }} />
                  <span title={d.name} style={{ color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                  <span style={{ color: 'var(--text)', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtVND(d.actual)}</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-h)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {pct !== null ? `${pct}%` : ''}
                  </span>
                </Fragment>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
