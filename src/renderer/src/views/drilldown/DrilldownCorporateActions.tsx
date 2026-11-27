import type { ReactElement } from 'react'
import { Section } from '../../components/Section/Section'
import type { InstrumentProfile } from '../shared/beaconQueries'
import { ProfileTable } from './ProfileTable'

/**
 * Drilldown → Corporate actions, a face of its own (Karan, 2026-11-27):
 * each dividend and split on the name over the run, by ex-date, as the run
 * applied it, newest first.
 */
export function DrilldownCorporateActions({
  profile
}: {
  profile: InstrumentProfile | undefined
}): ReactElement {
  return (
    <div className="drilldown-face">
      <Section title="Corporate actions">
        <ProfileTable
          profile={profile}
          part="corporate_actions"
          dateHeader="Ex-date"
          maxBodyHeight={480}
          shown={[
            { name: 'type', width: 110 },
            { name: 'amount', width: 120 }
          ]}
        />
      </Section>
    </div>
  )
}
