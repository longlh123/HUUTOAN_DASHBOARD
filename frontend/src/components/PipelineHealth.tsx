import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts'
import type { PipelineData } from '../api/sales'
import { fmtVND, fmtVNDFull } from '../utils/format'

type Props = {
  data: PipelineData | null
  loading: boolean
}

export function PipelineHealth({ data, loading }: Props) {
  if (loading && !data) {
    return <p className="table-placeholder">Dang tai...</p>
  }
  if (!data) return null

  const chartHeight = Math.max(160, data.by_stage.length * 52)

  return (
    <div className="pipeline-health">
      <div className="kpi-grid">
        <div className="card">
          <div className="kpi-card__label">Pipeline Value</div>
          <div className="kpi-card__value">{fmtVND(data.pipeline_value)}</div>
          <div className="kpi-card__sub">
            {data.opportunity_count} co hoi chua co hop dong
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

      {data.by_stage.length > 0 && (
        <div className="card">
          <h2 className="card__title">Phan bo theo giai doan</h2>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={data.by_stage}
              layout="vertical"
              margin={{ top: 0, right: 100, left: 0, bottom: 0 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="stage"
                width={150}
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(v: unknown) => [fmtVNDFull(Number(v)), 'Gia tri']}
              />
              <Bar dataKey="value" fill="var(--accent)" radius={[0, 4, 4, 0]}>
                <LabelList
                  dataKey="value"
                  position="right"
                  formatter={(v: unknown) => fmtVND(Number(v))}
                  style={{ fontSize: 11, fill: 'var(--text)' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="stage-count-row">
            {data.by_stage.map(s => (
              <span key={s.stage} className="stage-count-item">
                <span className="stage-count-item__name">{s.stage}</span>
                <span className="stage-count-item__num">{s.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {data.by_stage.length === 0 && (
        <div className="card">
          <p className="table-placeholder">Khong co co hoi dang mo</p>
        </div>
      )}
    </div>
  )
}
