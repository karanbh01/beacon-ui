import type { ReactElement } from 'react'
import { Section } from '../../components/Section/Section'
import type { InstrumentProfile } from '../shared/beaconQueries'
import { ProfileTable } from './ProfileTable'

/**
 * Drilldown → Trading: what it cost to hold and trade the name. Every trade
 * with why it was made and what it cost; how big the holding was against
 * what the market trades of it, at each rebalance; and its dividends and
 * splits, which the trades and the price both answer to.
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
      <div className="drilldown-pair">
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
        <Section title="Corporate actions">
          <ProfileTable
            profile={profile}
            part="corporate_actions"
            dateHeader="Ex-date"
            shown={[
              { name: 'type', width: 90 },
              { name: 'amount', width: 100 }
            ]}
          />
        </Section>
      </div>
    </div>
  )
}
