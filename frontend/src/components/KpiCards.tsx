import type { SalesSummary } from '../api/sales'
import { fmtVND } from '../utils/format'

type Props = {
  summary:     SalesSummary | null
  prevSummary: SalesSummary | null
  loading:     boolean
}

function delta(current: number, prev: number | undefined): { pct: number; dir: 'up' | 'down' } | null {
  if (!prev) return null
  const pct = (current - prev) / prev * 100
  if (Math.abs(pct) < 0.1) return null
  return { pct: Math.abs(pct), dir: pct > 0 ? 'up' : 'down' }
}

export function KpiCards({ summary, prevSummary, loading }: Props) {
  const wonCount  = summary?.total_deals ?? 0
  const lostCount = summary?.lost_deals  ?? 0

  const cards = [
    {
      label:   'Tổng giá trị hợp đồng',
      value:   summary ? fmtVND(summary.total_value) : '—',
      sub:     'đã ký trong kỳ',
      delta:   summary ? delta(summary.total_value,  prevSummary?.total_value)  : null,
    },
    {
      label:   'Số hợp đồng ký được',
      value:   summary ? wonCount.toLocaleString('vi-VN') : '—',
      sub:     `lost: ${lostCount}`,
      delta:   summary ? delta(summary.total_deals,  prevSummary?.total_deals)  : null,
    },
    {
      label:   'Win Rate',
      value:   summary ? `${summary.win_rate}%` : '—',
      sub:     summary ? `${wonCount} won / ${lostCount} lost` : 'won / lost',
      delta:   summary ? delta(summary.win_rate,     prevSummary?.win_rate)     : null,
    },
    {
      label:   'Giá trị trung bình / HĐ',
      value:   summary ? fmtVND(summary.avg_deal_size) : '—',
      sub:     'avg deal size',
      delta:   summary ? delta(summary.avg_deal_size, prevSummary?.avg_deal_size) : null,
    },
  ]

  return (
    <div className="kpi-grid">
      {cards.map((card) => (
        <div key={card.label} className={`card kpi-card${loading ? ' kpi-card--loading' : ''}`}>
          <p className="kpi-card__label">{card.label}</p>
          {card.delta && (
            <span className={`kpi-delta kpi-delta--${card.delta.dir}`}>
              {card.delta.dir === 'up' ? '▲' : '▼'} {card.delta.pct.toFixed(1)}%
            </span>
          )}
          <p className="kpi-card__value">{card.value}</p>
          <p className="kpi-card__sub">{card.sub}</p>
        </div>
      ))}
    </div>
  )
}
