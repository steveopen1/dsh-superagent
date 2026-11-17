// @vitest-environment jsdom
/** Smoke test: the Flow page renders its pipeline from the management API without a runtime error. */
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { expect, test } from 'vitest'
import { FlowPage } from '../src/client/flow.tsx'
import { PanelProvider } from '../src/client/provider.tsx'
import type { T } from '../src/client/text.ts'

const thread = { key: 'github:1', source: 'github', title: '修复文件面板超时', stage: 'subscribed',
  tickets: [{ id: 't1', title: '修文件面板超时', state: 'open' }], subscriptions: 1, pending: 0,
  lastAt: '2026-11-05T14:00:00Z', createdAt: '2026-11-05T13:00:00Z' }
const ticket = { id: 't1', title: '修文件面板超时', state: 'open', stage: 'working', assignments: 1, inputs: 0, undelivered: 0,
  strength: 'explicit', actions: { retry: false, stop: true }, createdAt: '2026-11-05T13:00:00Z', updatedAt: '2026-11-05T14:00:00Z',
  sessionId: '', threads: [] }
const overview = { person: [{ ...ticket, stage: 'person', action: 'answer' }], problems: [],
  flow: { received: 1, filtered: 0, judged: 1, accepted: 1, dropped: 0 }, executor: { running: 1, queued: 0, idle: 0, maxWorkers: 2 } }
const routes: [string, unknown][] = [
  ['/orchestrator/api/overview', overview],
  ['/orchestrator/api/threads', { items: [thread], next_offset: null }],
  ['/orchestrator/api/tickets', { items: [ticket], next_offset: null }],
  ['/orchestrator/api/decisions', { items: [{ id: 'd1', kind: 'accept', outcome: 'accept', at: '2026-11-05T14:00:00Z', thread: 'github:1',
    threadTitle: '修复文件面板超时', preview: '', reason: [], rules: [], triggerIds: ['e1'], strength: 'explicit' }], next_offset: null }],
  ['/orchestrator/api/state', { masterId: 'm1', paused: false, load: { running: 0 }, setup: undefined }],
]

test('Flow page draws one five-step pipeline per request', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    const found = routes.find(([path]) => url.includes(path))
    return new Response(JSON.stringify(found?.[1] ?? {}), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  // The dictionary keys are returned verbatim, so the assertions below match on structure rather than on wording.
  const t = ((key: string) => key) as unknown as T
  await act(async () => {
    root.render(<PanelProvider t={t}><FlowPage /></PanelProvider>)
  })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })
  expect(container.querySelectorAll('.dt-flow-row').length).toBe(1)
  expect(container.querySelectorAll('.dt-flow-row .dt-flow-step').length).toBe(5)
  expect(container.querySelectorAll('.dt-flow-legend-step').length).toBe(5)
  const now = container.querySelector('.dt-flow-row .dt-flow-step[data-state="now"]')
  expect(now?.textContent).toContain('3')
  // The hero line, the pending-Tickets section, and the 24-hour timeline read from the same page.
  expect(container.querySelector('.dt-flow-hero')).not.toBeNull()
  expect(container.querySelectorAll('.dt-cards .dt-ticket').length).toBe(1)
  expect(container.querySelectorAll('.dt-flow-timeline .dt-flow-event').length).toBe(1)
  expect(container.querySelector('.dt-flow-event .dt-flow-event-what')?.textContent).toBe('修复文件面板超时')
  await act(async () => { root.unmount() })
  container.remove()
})

