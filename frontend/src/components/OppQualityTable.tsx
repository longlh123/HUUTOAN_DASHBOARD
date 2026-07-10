import { useEffect, useRef, useState } from 'react'
import type { OppQualityRow } from '../api/sales'

function ColInfo({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const [pos,  setPos]  = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLSpanElement>(null)

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect()
      setPos({ top: r.bottom + 8, left: r.left + r.width / 2 })
    }
    setOpen(v => !v)
  }

  useEffect(() => {
    if (!open) return
    function close() { setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <span className={`col-info${open ? ' col-info--open' : ''}`} ref={ref} onClick={toggle}>
      <span className="col-info__icon">ⓘ</span>
      {open && (
        <div
          className="col-info__tip"
          style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateX(-50%)' }}
          onMouseDown={e => e.stopPropagation()}
        >
          {text}
        </div>
      )}
    </span>
  )
}

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
      <p className="card__desc">Chi tinh cac Opp dang mo, chua co hop dong won</p>
      <div className="table-wrap">
        <table className="leaderboard">
          <thead>
            <tr>
              <th>#</th>
              <th>Salesperson</th>
              <th style={{ textAlign: 'right' }}>Opp mo</th>
              <th style={{ textAlign: 'right' }}>Co Quote</th>
              <th style={{ textAlign: 'right' }}>
                % Dinh kem Quote
                <ColInfo text="Tỉ lệ opp có ít nhất 1 báo giá liên kết. Mục tiêu ≥ 80%." />
              </th>
              <th style={{ textAlign: 'right' }}>
                Lag Opp→Quote
                <ColInfo text="Số ngày TB từ khi tạo Opp đến Quote đầu tiên được tạo. Tốt: ≤ 3 ngày · Trung bình: 4–7 ngày · Chậm: > 7 ngày." />
              </th>
              <th style={{ textAlign: 'right' }}>
                % Du thong tin
                <ColInfo text={"Opp được coi là đủ thông tin khi có đủ 5 trường:\n• Ngày dự kiến chốt (EstimatedCloseDate)\n• Giá trị ước tính > 0\n• Giai đoạn (Process Stage)\n• Khách hàng\n• Mức độ tiềm năng (Low / Medium / High)"} />
              </th>
              <th style={{ textAlign: 'right' }}>
                Co Quote, Bo nguoi 30d
                <ColInfo text={"Số opp đã có quote, chưa won, nhưng không có dấu hiệu hoạt động trong 30 ngày:\n• Không có activity (cuộc gọi, email, task...)\n• Không có quote nào được cập nhật\nĐây là các opp cần sales chủ động follow up."} />
              </th>
              <th style={{ textAlign: 'right' }}>
                Nhap muon
                <ColInfo text="Số opp có EstimatedCloseDate chỉ cách ngày tạo ≤ 7 ngày — nghi ngờ nhập hồi tố (backdated)." />
              </th>
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
