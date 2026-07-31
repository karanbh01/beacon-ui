import { useEffect, useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { EngineState } from '@shared/ipc'
import { BeaconProvider } from './BeaconProvider'
import { JobTray } from './JobTray'
import { useJobs } from './jobs'
import { keys } from './keys'
import { Button } from '../components/Button/Button'
import { Card } from '../components/Card/Card'
import { KV, KVList } from '../components/KV/KV'

const meta: Meta = { title: 'Data/Job progress (BU-21)' }
export default meta
type Story = StoryObj

/**
 * A WebSocket stand-in the story drives by hand.
 *
 * BU-21's acceptance asks for a *stub* long job, which is the honest way to
 * demonstrate the pipeline: py-beacon's real jobs need market data, and a
 * story that depends on a live sync would prove nothing repeatably.
 */
class FakeSocket implements Partial<WebSocket> {
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onclose: (() => void) | null = null
  static current: FakeSocket | null = null

  constructor() {
    FakeSocket.current = this
  }

  emit(payload: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(payload) }))
  }

  close(): void {
    // Deliberately does not call onclose: the provider would reconnect.
  }
}

const ENGINE: EngineState = {
  status: 'connected',
  baseUrl: 'http://127.0.0.1:9999',
  token: 'story-token',
  version: '0.0.2'
}

/** Stands in for a pane whose data the job invalidates. */
function CachedPane(): React.ReactElement {
  const queries = useQueryClient()
  const runs = useRef(0)

  const { data, isFetching } = useQuery({
    queryKey: keys.beacon.weights('TECH10', '2026-07-22'),
    queryFn: () => {
      runs.current += 1
      return Promise.resolve({ fetchedAt: new Date().toLocaleTimeString(), run: runs.current })
    },
    staleTime: Infinity
  })

  return (
    <Card
      title="Cached pane"
      aside={<span className="type-10">{isFetching ? 'fetching' : ''}</span>}
    >
      <KVList>
        <KV label="Query" value="beacon/weights/TECH10/2026-07-22" />
        <KV label="Fetched at" value={data?.fetchedAt ?? '—'} />
        <KV
          label="Fetch count"
          value={String(data?.run ?? 0)}
          tone={(data?.run ?? 0) > 1 ? 'positive' : 'default'}
        />
      </KVList>
      <p className="type-11" style={{ color: 'var(--text-muted)', marginTop: 10 }}>
        The count rises when the job succeeds — that is the cache settling, not a re-render.
      </p>
      <div style={{ marginTop: 10 }}>
        <Button
          onClick={() => {
            void queries.invalidateQueries()
          }}
        >
          Invalidate manually
        </Button>
      </div>
    </Card>
  )
}

function Demo(): React.ReactElement {
  const [running, setRunning] = useState(false)
  const reset = useJobs((state) => state.reset)

  useEffect(() => {
    if (!running) return undefined

    let progress = 0
    const id = setInterval(() => {
      progress = Math.min(progress + 0.12, 1)
      const socket = FakeSocket.current
      if (socket === null) return

      if (progress < 1) {
        socket.emit({
          type: 'job',
          job_id: 'stub-1',
          kind: 'backtest',
          status: 'running',
          progress,
          message: `computing returns — ${String(Math.round(progress * 100))}%`
        })
        return
      }

      socket.emit({
        type: 'job',
        job_id: 'stub-1',
        kind: 'backtest',
        status: 'succeeded',
        progress: 1,
        message: 'done'
      })
      clearInterval(id)
      setRunning(false)
    }, 450)

    return () => {
      clearInterval(id)
    }
  }, [running])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: 520 }}>
      <CachedPane />

      <div style={{ display: 'flex', gap: 8 }}>
        <Button
          variant="accent"
          onClick={() => {
            reset()
            setRunning(true)
          }}
        >
          Run stub backtest
        </Button>
        <Button
          onClick={() => {
            FakeSocket.current?.emit({
              type: 'job',
              job_id: 'stub-fail',
              kind: 'sync',
              status: 'failed',
              progress: 0.4,
              error: 'yfinance returned no rows for TECH10'
            })
          }}
        >
          Fail a job
        </Button>
        <Button
          onClick={() => {
            FakeSocket.current?.emit({ type: 'data.freshness', dataset: 'market' })
          }}
        >
          Publish freshness
        </Button>
      </div>

      <p className="type-11" style={{ color: 'var(--text-muted)', margin: 0 }}>
        Running jobs and failures show in the tray, bottom right. Successes vanish on their own —
        the result is already in the pane. Failures stay until dismissed.
      </p>

      <JobTray />
    </div>
  )
}

/** BU-21 acceptance: progress streams into the tray and settles the cache. */
export const StubJob: Story = {
  render: () => (
    <BeaconProvider engine={ENGINE} socketFactory={() => new FakeSocket() as unknown as WebSocket}>
      <Demo />
    </BeaconProvider>
  )
}
