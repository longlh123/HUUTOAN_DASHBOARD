export type Territory = 'ALL' | 'SOUTH' | 'CENTER' | 'NORTH'

const TERRITORIES: { key: Territory; label: string }[] = [
  { key: 'ALL',    label: 'Tất cả'    },
  { key: 'SOUTH',  label: 'Miền Nam'  },
  { key: 'CENTER', label: 'Miền Trung'},
  { key: 'NORTH',  label: 'Miền Bắc' },
]

type Props = {
  value:    Territory
  onChange: (territory: Territory) => void
  disabled?: boolean
}

export function TerritoryFilter({ value, onChange, disabled = false }: Props) {
  return (
    <div className={`territory-filter${disabled ? ' territory-filter--disabled' : ''}`}>
      {TERRITORIES.map(({ key, label }) => (
        <button
          key={key}
          className={`date-filter__btn${value === key ? ' date-filter__btn--active' : ''}`}
          onClick={() => !disabled && onChange(key)}
          disabled={disabled}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
