import { useEffect, useState } from 'react'
import type { OppQualityRow } from '../api/sales'
import { fetchOppQuality } from '../api/sales'
import { OppQualityTable } from '../components/OppQualityTable'
import { TerritoryFilter } from '../components/TerritoryFilter'
import type { Territory } from '../components/TerritoryFilter'
import { useAuth } from '../contexts/AuthContext'

export function OppQualityPage() {
  const { user } = useAuth()
  const isAdmin = user?.is_admin ?? true

  const [territory, setTerritory] = useState<Territory>(
    !isAdmin && user?.territory ? user.territory as Territory : 'ALL'
  )
  const [data,     setData]     = useState<OppQualityRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [fetching, setFetching] = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    setFetching(true)
    setError(null)
    fetchOppQuality(territory)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => { setLoading(false); setFetching(false) })
  }, [territory])

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <div className="dashboard__title-row">
          <h1 className="dashboard__title">Chat luong Opportunity</h1>
          {fetching && !loading && <span className="dashboard__refreshing">Dang cap nhat...</span>}
        </div>
        <div className="dashboard__filters">
          <TerritoryFilter value={territory} onChange={setTerritory} disabled={!isAdmin} />
        </div>
      </div>
      {error && <div className="dashboard__error">{error}</div>}
      <p className="section-divider__sub" style={{ marginBottom: '1rem' }}>
        Do chat luong nhap lieu va quy trinh cham soc — chi tinh Opp chua co hop dong won
      </p>
      <OppQualityTable data={data} loading={loading} />
    </div>
  )
}
