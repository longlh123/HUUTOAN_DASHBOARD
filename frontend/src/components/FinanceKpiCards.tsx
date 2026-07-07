import type { FinanceSummary } from '../api/sales'
import { fmtVND } from '../utils/format'

type Props = {
  summary:     FinanceSummary | null
  prevSummary: FinanceSummary | null
  loading:     boolean
}

function delta(current: number, prev: number | undefined): { pct: number; dir: 'up' | 'down' } | null {
  if (!prev) return null
  const pct = (current - prev) / prev * 100
  if (Math.abs(pct) < 0.1) return null
  return { pct: Math.abs(pct), dir: pct > 0 ? 'up' : 'down' }
}

export function FinanceKpiCards({ summary, prevSummary, loading }: Props) {
  const cards = [
    {
      label: 'Doanh thu (Invoice)',
      value: summary ? fmtVND(summary.total_revenue) : '—',
      sub:   'theo hóa đơn F&O trong kỳ',
      delta: summary ? delta(summary.total_revenue, prevSummary?.total_revenue) : null,
    },
    {
      label: 'Số hóa đơn',
      value: summary ? summary.invoice_count.toLocaleString('vi-VN') : '—',
      sub:   'trong kỳ',
      delta: summary ? delta(summary.invoice_count, prevSummary?.invoice_count) : null,
    },
  ]

  return (
    <div className="kpi-grid kpi-grid--2">
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
