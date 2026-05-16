import { LabelList } from 'recharts'

type ChartLabelPosition =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'center'
  | 'inside'
  | 'insideTop'
  | 'insideBottom'
  | 'insideLeft'
  | 'insideRight'

type ChartLabelListProps = {
  position?: ChartLabelPosition
  offset?: number
  fill?: string
  fontSize?: number
  fontWeight?: number | string
}

function toFiniteNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function formatChartPercentLabel(value: unknown) {
  const numeric = toFiniteNumber(value)
  if (numeric === null) {
    return ''
  }

  return `${numeric.toFixed(1)}%`
}

export function formatChartCountLabel(value: unknown, hideZero = true) {
  const numeric = toFiniteNumber(value)
  if (numeric === null) {
    return ''
  }

  if (hideZero && numeric === 0) {
    return ''
  }

  return numeric.toLocaleString()
}

export function ChartPercentLabelList({
  position = 'top',
  offset = 10,
  fill = '#0f172a',
  fontSize = 11,
  fontWeight = 600,
}: ChartLabelListProps) {
  return (
    <LabelList
      position={position}
      offset={offset}
      fill={fill}
      fontSize={fontSize}
      fontWeight={fontWeight}
      formatter={formatChartPercentLabel}
    />
  )
}

export function ChartCountLabelList({
  position = 'top',
  offset = 10,
  fill = '#0f172a',
  fontSize = 11,
  fontWeight = 600,
  hideZero = true,
}: ChartLabelListProps & { hideZero?: boolean }) {
  return (
    <LabelList
      position={position}
      offset={offset}
      fill={fill}
      fontSize={fontSize}
      fontWeight={fontWeight}
      formatter={(value: unknown) => formatChartCountLabel(value, hideZero)}
    />
  )
}
