import { useState } from 'react'
import type { DateRange, GroupBy } from '../api/sales'
import { getYearRange } from '../utils/date'

type Mode = 'year' | 'quarter'

type Props = {
  onChange: (range: DateRange, groupBy: GroupBy) => void
}

const MODES: { key: Mode; label: string }[] = [
  { key: 'quarter', label: 'Theo quý' },
  { key: 'year',    label: 'Theo năm' },
]

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i)

export function DateRangeFilter({ onChange }: Props) {
  const [active, setActive] = useState<Mode>('quarter')
  const [year,   setYear]   = useState(CURRENT_YEAR)

  function emit(mode: Mode, y: number) {
    if (mode === 'year')    onChange(getYearRange(y), 'month')
    if (mode === 'quarter') onChange(getYearRange(y), 'quarter')
  }

  function selectMode(mode: Mode) {
    setActive(mode)
    emit(mode, year)
  }

  function selectYear(y: number) {
    setYear(y)
    emit(active, y)
  }

  return (
    <div className="date-filter">
      <div className="date-filter__presets">
        <select
          className="date-filter__input"
          value={year}
          onChange={e => selectYear(Number(e.target.value))}
        >
          {YEARS.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        {MODES.map(({ key, label }) => (
          <button
            key={key}
            className={`date-filter__btn${active === key ? ' date-filter__btn--active' : ''}`}
            onClick={() => selectMode(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
