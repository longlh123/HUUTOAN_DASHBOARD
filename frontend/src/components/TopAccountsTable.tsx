import { useEffect, useState } from 'react'
import type { TopAccountItem, DateRange } from '../api/sales'
import { fetchTopAccounts } from '../api/sales'
import { fmtVNDFull } from '../utils/format'

type Props = {
  territory:   string
  department?: string
  range:       DateRange
}

export function TopAccountsTable({ territory, department, range }: Props) {
  const [data,     setData]     = useState<TopAccountItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    setFetching(true)
    fetchTopAccounts(range, territory, department)
      .then(setData)
      .catch(() => {})
      .finally(() => { setLoading(false); setFetching(false) })
  }, [territory, department, range])

  return (
    <div className="card">
      <div className="chart-header">
        <h2 className="card__title">Top 10 Khach hang</h2>
        {fetching && !loading && <span className="dashboard__refreshing">Dang cap nhat...</span>}
      </div>

      {loading ? (
        <p className="table-placeholder">Dang tai...</p>
      ) : data.length === 0 ? (
        <p className="table-placeholder">Khong co du lieu</p>
      ) : (
        <div className={`table-wrap${fetching && !loading ? ' chart-wrap--loading' : ''}`}>
          <table className="leaderboard">
            <thead>
              <tr>
                <th style={{ textAlign: 'right' }}>#</th>
                <th>Khach hang</th>
                <th style={{ textAlign: 'right' }}>Tong gia tri</th>
                <th style={{ textAlign: 'right' }}>So HĐ</th>
              </tr>
            </thead>
            <tbody>
              {data.map((acc, i) => (
                <tr key={acc.account_id}>
                  <td className="leaderboard__rank">{i + 1}</td>
                  <td className="leaderboard__name">{acc.name}</td>
                  <td className="leaderboard__value">{fmtVNDFull(acc.total_value)}</td>
                  <td className="leaderboard__num">{acc.deals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
