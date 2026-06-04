import { useEffect, useState } from 'react'
import type { RequestTypeCrosstab } from '../api/sales'
import { fetchRequestTypeCrosstab } from '../api/sales'
import { TerritoryFilter } from '../components/TerritoryFilter'
import type { Territory } from '../components/TerritoryFilter'
import { useAuth } from '../contexts/AuthContext'

const THIS_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = [THIS_YEAR, THIS_YEAR - 1, THIS_YEAR - 2]

export function RequestTypePage() {
  const { user } = useAuth()
  const isAdmin = user?.is_admin ?? true

  const [year,       setYear]       = useState(THIS_YEAR)
  const [territory,  setTerritory]  = useState<Territory>(
    !isAdmin && user?.territory ? user.territory as Territory : 'ALL'
  )
  const [department, setDepartment] = useState<string | undefined>(undefined)
  const [data,       setData]       = useState<RequestTypeCrosstab | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [fetching,   setFetching]   = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  useEffect(() => {
    setFetching(true)
    setError(null)
    fetchRequestTypeCrosstab(year, territory, department)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => { setLoading(false); setFetching(false) })
  }, [year, territory, department])

  const allDepts = data
    ? Array.from(new Set(data.departments)).sort()
    : []

  function codeLabel(code: string): string {
    if (!data?.labels) return code
    return data.labels[code] ?? code
  }

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <div className="dashboard__title-row">
          <h1 className="dashboard__title">Phan loai yeu cau</h1>
          {fetching && !loading && <span className="dashboard__refreshing">Dang cap nhat...</span>}
        </div>
        <div className="dashboard__filters">
          {isAdmin && allDepts.length > 1 && (
            <div className="territory-filter">
              <button
                className={`date-filter__btn${department === undefined ? ' date-filter__btn--active' : ''}`}
                onClick={() => setDepartment(undefined)}
              >
                Tat ca
              </button>
              {allDepts.map(d => (
                <button
                  key={d}
                  className={`date-filter__btn${department === d ? ' date-filter__btn--active' : ''}`}
                  onClick={() => setDepartment(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          )}
          <div className="territory-filter">
            {YEAR_OPTIONS.map(y => (
              <button
                key={y}
                className={`date-filter__btn${year === y ? ' date-filter__btn--active' : ''}`}
                onClick={() => setYear(y)}
              >
                {y}
              </button>
            ))}
          </div>
          <TerritoryFilter value={territory} onChange={setTerritory} disabled={!isAdmin} />
        </div>
      </div>

      {error && <div className="dashboard__error">{error}</div>}

      <p className="section-divider__sub" style={{ marginBottom: '1rem' }}>
        So luong quotes tao trong nam {year} theo tung loai yeu cau × department
      </p>

      {loading ? (
        <div className="card"><p className="table-placeholder">Dang tai...</p></div>
      ) : !data || data.rows.length === 0 ? (
        <div className="card"><p className="table-placeholder">Khong co du lieu</p></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="leaderboard">
              <thead>
                <tr>
                  <th>Loai yeu cau</th>
                  <th style={{ color: 'var(--text)', fontWeight: 400, fontSize: 10 }}>Code</th>
                  {data.departments.map(d => (
                    <th key={d} style={{ textAlign: 'right' }}>{d}</th>
                  ))}
                  <th style={{ textAlign: 'right' }}>Tong</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(row => (
                  <tr key={row.code}>
                    <td className="leaderboard__name">
                      {row.code === '(Chua nhap)'
                        ? <span style={{ color: 'var(--text)', fontStyle: 'italic' }}>(Chua nhap)</span>
                        : codeLabel(row.code)
                      }
                    </td>
                    <td style={{ color: 'var(--text)', fontSize: 11 }}>
                      {row.code !== '(Chua nhap)' && (
                        <code style={{ background: 'var(--surface)', padding: '1px 5px', borderRadius: 3 }}>
                          {row.code}
                        </code>
                      )}
                    </td>
                    {data.departments.map(d => (
                      <td key={d} className="leaderboard__num">
                        {row.by_dept[d] ? (
                          <span className={`win-rate win-rate--${countLevel(row.by_dept[d], data.grand_total)}`}>
                            {row.by_dept[d]}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text)' }}>—</span>
                        )}
                      </td>
                    ))}
                    <td className="leaderboard__num"><strong>{row.total}</strong></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="kpi-perf__total-row">
                  <td colSpan={2}><strong>Tong</strong></td>
                  {data.departments.map(d => (
                    <td key={d} style={{ textAlign: 'right' }}>
                      <strong>{data.column_totals[d] ?? 0}</strong>
                    </td>
                  ))}
                  <td style={{ textAlign: 'right' }}><strong>{data.grand_total}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function countLevel(count: number, total: number): string {
  const pct = total > 0 ? count / total : 0
  if (pct >= 0.3) return 'high'
  if (pct >= 0.1) return 'mid'
  return 'low'
}
