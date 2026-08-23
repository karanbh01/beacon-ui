import type { Meta, StoryObj } from '@storybook/react'
import type { ReactElement } from 'react'

const SAMPLES = [
  { className: 'type-16', label: '16 Medium', note: 'Stat values, page headings' },
  { className: 'type-13', label: '13 Medium', note: 'Control labels, tab labels' },
  { className: 'type-11', label: '11 Regular', note: 'Body, table cells, footnotes' },
  { className: 'type-10', label: '10 Medium · 0.4px', note: 'Stat labels, table headers' },
  { className: 'type-9', label: '9 Medium · 6%', note: 'Pricer section heads' },
  { className: 'type-section-label', label: '16 SemiBold', note: 'Section labels' },
  { className: 'type-page-title', label: '32 Regular', note: 'Page titles' }
]

function Row({
  className,
  label,
  note
}: {
  className: string
  label: string
  note: string
}): ReactElement {
  return (
    <tr>
      <td style={{ padding: '10px 20px 10px 0', verticalAlign: 'baseline' }}>
        <span className={className}>Beacon 341.34 +14.20%</span>
      </td>
      <td
        className="type-11"
        style={{ padding: '10px 20px 10px 0', color: 'var(--text-secondary)' }}
      >
        {label}
      </td>
      <td className="type-11" style={{ padding: '10px 0', color: 'var(--text-muted)' }}>
        {note}
      </td>
    </tr>
  )
}

function TypeScale(): ReactElement {
  return (
    <table style={{ borderCollapse: 'collapse' }}>
      <tbody>
        {SAMPLES.map((sample) => (
          <Row key={sample.className} {...sample} />
        ))}
      </tbody>
    </table>
  )
}

const meta: Meta<typeof TypeScale> = {
  title: 'Foundations/Type scale',
  component: TypeScale
}

export default meta

export const Scale: StoryObj<typeof TypeScale> = {}
