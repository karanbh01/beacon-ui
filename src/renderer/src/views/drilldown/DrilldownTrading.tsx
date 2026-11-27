import type { ReactElement } from 'react'
import { Section } from '../../components/Section/Section'
import type { InstrumentProfile } from '../shared/beaconQueries'
import { ProfileTable } from './ProfileTable'

/**
 * Drilldown → Trading: what it cost to hold and trade the name. Every trade
 * with why it was made and what it cost; how big the holding was against
 * what the market trades of it, at each rebalance. Its dividends and
 * splits have a face of their own (Karan, 2026-11-27).
 */
export function DrilldownTrading({
  profile
}: {
  profile: InstrumentProfile | undefined
}): ReactElement {
  return (
    <div className="drilldown-face">
      <Section title="Trades">
        <ProfileTable
          profile={profile}
          part="trades"
          shown={[
            { name: 'side', width: 54 },
            { name: 'quantity', width: 84 },
            { name: 'price', width: 84 },
            { name: 'notional', width: 96 },
            { name: 'cost', width: 84 },
            { name: 'impact', width: 84 },
            { name: 'reason', width: 110 },
            { name: 'tags', width: 140 }
          ]}
        />
      </Section>
      <Section title="Liquidity at each rebalance">
        <ProfileTable
          profile={profile}
          part="liquidity"
          dateHeader="Rebalance"
          shown={[
            { name: 'value', width: 96 },
            { name: 'traded_value', width: 110 },
            { name: 'days_to_sell', width: 86 }
          ]}
        />
      </Section>
    </div>
  )
}
