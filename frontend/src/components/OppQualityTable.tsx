import type { OppQualityRow } from '../api/sales'

type Props = {
  data:    OppQualityRow[]
  loading: boolean
}

function attachLevel(rate: number): string {
  if (rate >= 80) return 'high'
  if (rate >= 50) return 'mid'
  return 'low'
}

function completeLevel(rate: number): string {
  if (rate >= 80) return 'high'
  if (rate >= 50) return 'mid'
  return 'low'
}

function lagLevel(days: number | null): string {
  if (days === null) return 'slow'
  if (days <= 3) return 'fast'
  if (days <= 7) return 'mid'
  return 'slow'
}

function noActivityLevel(count: number, total: number): string {
  const pct = total > 0 ? count / total : 0
  if (pct === 0) return 'fast'
  if (pct <= 0.3) return 'mid'
  return 'slow'
}

export function OppQualityTable({ data, loading }: Props) {
  if (loading && data.length === 0) {
    return <p className="table-placeholder">Dang tai...</p>
  }
  if (data.length === 0) {
    return <p className="table-placeholder">Khong co du lieu</p>
  }

  return (
    <div className="card">
      <h2 className="card__title">Chat luong Opportunity theo sales</h2>
      <p className="card__desc">Chi tinh cac Opp chua co hop dong won — top 500 Opp dang mo</p>
      <div className="table-wrap">
        <table className="leaderboard">
          <thead>
            <tr>
              <th>#</th>
              <th>Salesperson</th>
              <th style={{ textAlign: 'right' }}>Opp mo</th>
              <th style={{ textAlign: 'right' }}>Co Quote</th>
              <th style={{ textAlign: 'right' }}>% Dinh kem Quote</th>
              <th style={{ textAlign: 'right' }}>Lag Opp→Quote</th>
              <th style={{ textAlign: 'right' }}>% Du thong tin</th>
              <th style={{ textAlign: 'right' }}>Khong HĐ 30d</th>
              <th style={{ textAlign: 'right' }}>Nhap muon</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={row.owner_id}>
                <td className="leaderboard__rank">{i + 1}</td>
                <td className="leaderboard__name">{row.name}</td>
                <td className="leaderboard__num">{row.total_open}</td>
                <td className="leaderboard__num">{row.with_quote}</td>
                <td className="leaderboard__value">
                  <span className={`win-rate win-rate--${attachLevel(row.quote_attach_rate)}`}>
                    {row.quote_attach_rate}%
                  </span>
                </td>
                <td className="leaderboard__value">
                  <span className={`speed-badge speed-badge--${lagLevel(row.avg_days_to_quote)}`}>
                    {row.avg_days_to_quote !== null ? `${row.avg_days_to_quote} ngay` : '—'}
                  </span>
                </td>
                <td className="leaderboard__value">
                  <span className={`win-rate win-rate--${completeLevel(row.complete_rate)}`}>
                    {row.complete_rate}%
                  </span>
                </td>
                <td className="leaderboard__value">
                  <span className={`speed-badge speed-badge--${noActivityLevel(row.no_activity_30d, row.total_open)}`}>
                    {row.no_activity_30d} opp
                  </span>
                </td>
                <td className="leaderboard__num">
                  {row.backdated > 0
                    ? <span className="speed-badge speed-badge--mid">{row.backdated}</span>
                    : <span className="speed-badge speed-badge--fast">0</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
