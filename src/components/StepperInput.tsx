interface Props {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  label?: string
  disabled?: boolean
}

export default function StepperInput({ value, onChange, min = 0, max = 999, label, disabled }: Props) {
  const dec = () => onChange(Math.max(min, value - 1))
  const inc = () => onChange(Math.min(max, value + 1))

  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-sm text-gray-600 font-medium">{label}</span>}
      <div className="flex items-center gap-0">
        <button
          type="button"
          onClick={dec}
          disabled={disabled || value <= min}
          className="w-12 h-12 rounded-l-xl bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-xl font-bold text-gray-700 flex items-center justify-center transition-colors active:scale-95"
          aria-label="decrease"
        >
          −
        </button>
        <input
          type="number"
          value={value}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10)
            if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)))
          }}
          disabled={disabled}
          className="w-16 h-12 text-center text-xl font-bold border-y border-gray-200 bg-white text-gray-900 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          inputMode="numeric"
        />
        <button
          type="button"
          onClick={inc}
          disabled={disabled || value >= max}
          className="w-12 h-12 rounded-r-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-xl font-bold text-white flex items-center justify-center transition-colors active:scale-95"
          aria-label="increase"
        >
          +
        </button>
      </div>
    </div>
  )
}
