/** Flow page: the work path of every recent request, drawn as a pipeline so anyone can see where things stand. */
import { usePoll, type ThreadRow, type TicketRow } from './api.ts'
import { Button, Icon } from './controls.tsx'
import type { DshSuperagentKey } from './locales.ts'
import { usePanel } from './provider.tsx'
import { decisionMark } from './marks.ts'
import type { Route } from './route.ts'
import { TicketLine } from './rows.tsx'
import { readableMarkers, when } from './text.ts'
import { Hint, LoadState, Section } from './widgets.tsx'

/** The steps a request walks, in the words a person would use rather than the domain's. */
const STEPS = ['received', 'judge', 'work', 'person', 'done'] as const
type Step = typeof STEPS[number]
/** Where one request stands: the highlighted step, the plain-language next step, and the tone of its dot. */
export interface Place { node: number; hint: DshSuperagentKey; tone: 'done' | 'ongoing' | 'warning' | 'error' | 'idle' }

/** Reads the place of a Ticket alone, for pages that show one without its Thread. A Ticket whose pull request is open waits on a person, whatever its worker's last report said. */
export function ticketPlace(ticket: { stage?: string; action?: string | undefined }, openPull = false): Place {
  if (openPull && ticket.stage !== 'person') return { node: 3, hint: 'flow.hint.review', tone: 'warning' }
  switch (ticket.stage) {
    case 'person':
      switch (ticket.action) {
        case 'answer': return { node: 3, hint: 'flow.hint.answer', tone: 'warning' }
        case 'delivery': return { node: 3, hint: 'flow.hint.delivery', tone: 'error' }
        case 'blocked': return { node: 3, hint: 'flow.hint.blocked', tone: 'error' }
        case 'failed': return { node: 3, hint: 'flow.hint.failed', tone: 'error' }
        default: return { node: 3, hint: 'flow.hint.review', tone: 'warning' }
      }
    case 'working':
      return ticket.action === 'queued' ? { node: 2, hint: 'flow.hint.queued', tone: 'idle' }
        : { node: 2, hint: 'flow.hint.work', tone: 'ongoing' }
    case 'idle': return { node: 2, hint: 'flow.hint.idle', tone: 'idle' }
    case 'ended': return { node: 4, hint: 'flow.hint.ended', tone: 'done' }
    default: return { node: 2, hint: 'flow.hint.work', tone: 'ongoing' }
  }
}

/** Reads a request's place off its Thread and the Ticket the Thread's request became, if any. */
function place(thread: ThreadRow, ticket: TicketRow | undefined): Place {
  if (ticket && ticket.state === 'open') return ticketPlace(ticket)
  if (thread.stage === 'evaluating' || thread.stage === 'queued') return { node: 1, hint: 'flow.hint.judge', tone: 'ongoing' }
  // A Thread whose requests all ended without a Ticket was read and left alone.
  return { node: 4, hint: 'flow.hint.ignored', tone: 'done' }
}

/** One request's path: the five steps, with the current one lit and the rest dimmed. */
export function Chain({ node, tone }: { node: number; tone: Place['tone'] }) {
  const { t } = usePanel()
  return <ol className="dt-flow-chain" aria-label={t('flowTitle')}>
    {STEPS.map((step: Step, index) => <li key={step} className="dt-flow-step" data-state={index < node ? 'done' : index === node ? 'now' : 'todo'}
      data-tone={index === node ? tone : undefined} title={t(`flow.stage.${step}`)}
      aria-current={index === node ? 'step' : undefined}>
      <span className="dt-flow-node" aria-hidden="true">{index < node ? '✓' : index + 1}</span>
      <span className="dt-flow-label">{t(`flow.stage.${step}`)}</span>
    </li>)}
  </ol>
}

/** The legend strip: the same five steps as boxes, with how many requests sit on each. */
function Legend({ counts }: { counts: number[] }) {
  const { t } = usePanel()
  return <div className="dt-flow-legend">
    <p className="dt-flow-legend-intro">{t('flowLegend')}</p>
    <ol className="dt-flow-legend-list">
      {STEPS.map((step: Step, index) => <li key={step} className="dt-flow-legend-step" data-busy={counts[index]
        ? 'yes' : undefined}>
        <span className="dt-flow-legend-index">{index + 1}</span>
        <span className="dt-flow-legend-label">{t(`flow.stage.${step}`)}</span>
        <span className="dt-flow-legend-count">{counts[index] ?? 0}</span>
      </li>)}
    </ol>
  </div>
}

/** One row of the path list: the request's title, its path, and what happens next. */
function RequestRow({ thread, ticket, at }: { thread: ThreadRow; ticket: TicketRow | undefined; at: Place }) {
  const { t, navigate } = usePanel()
  const open: Route = ticket ? { page: 'execution', id: ticket.id } : { page: 'trigger', id: thread.key }
  return <li className="dt-flow-row">
    <div className="dt-flow-head">
      <button type="button" className="dt-open dt-flow-name" onClick={() => navigate(open)}>{readableMarkers(t, thread.title)}</button>
      <span className="dt-flow-next"><span className="dt-flow-next-label">{t('flowNext')}</span>{t(at.hint)}</span>
    </div>
    <Chain node={at.node} tone={at.tone} />
    <div className="dt-row-buttons">
      <Button variant="outline" size="sm" icon={<Icon name="chevron-right" size={14} />}
        onClick={() => navigate(open)}>{t('flowOpen')}</Button>
      {thread.url && <a className="dt-flow-link" href={thread.url} target="_blank" rel="noreferrer">
        <Icon name="external" size={14} />{t('flowOpenPost')}
      </a>}
    </div>
  </li>
}

export function FlowPage() {
  const { t, call, navigate } = usePanel()
  const overview = usePoll(() => call('GET overview'), [])
  const threads = usePoll(() => call('GET threads', { query: { filter: 'recent', limit: 12 } }), [])
  const tickets = usePoll(() => call('GET tickets', { query: { state: 'open', limit: 50 } }), [])
  const ended = usePoll(() => call('GET tickets', { query: { state: 'ended', limit: 50 } }), [])
  const recent = usePoll(() => call('GET decisions', { query: { window: '24h', limit: 20 } }), [])
  const error = threads.error ?? tickets.error ?? overview.error
  if (!threads.data || !tickets.data) return <LoadState error={error} loading={!error} />
  const byId = new Map([...tickets.data.items, ...(ended.data?.items ?? [])].map(ticket => [ticket.id, ticket]))
  const requests = threads.data.items.map(thread => {
    const found = thread.tickets.find(item => item.state === 'open') ?? thread.tickets[0]
    const ticket = found ? byId.get(found.id) : undefined
    return { thread, ticket, place: place(thread, ticket) }
  })
  const counts = STEPS.map((_, index) => requests.filter(item => item.place.node === index).length)
  const waiting = overview.data?.person.length ?? 0
  const running = (counts[1] ?? 0) + (counts[2] ?? 0)
  const busy = requests.length > 0
  return <>
    <Section title={t('flowTitle')}>
      <div className="dt-flow-hero">
        <span className="dt-flow-hero-dot" data-tone={overview.data?.problems.length ? 'error' : running ? 'ongoing' : 'done'}
          aria-hidden="true" />
        <p className="dt-flow-hero-text">{busy || waiting ? t('flowHeadline', { running, waiting }) : t('flowHeadlineCalm')}</p>
      </div>
      {overview.data && overview.data.problems.length > 0 && <p className="dt-flow-problems">
        {t('flowProblems', { count: overview.data.problems.length })}
        <button type="button" className="dt-textlink" onClick={() => navigate({ page: 'overview' })}>{t('details')}</button>
      </p>}
      <Legend counts={counts} />
    </Section>
    <Section title={t('pendingTickets')} count={waiting}>
      {overview.data && waiting > 0 ? <ul className="dt-list dt-cards">{overview.data.person.map(ticket => <TicketLine key={ticket.id}
        ticket={ticket} question onChanged={overview.reload} />)}</ul> : <Hint>{t('needsYouNone')}</Hint>}
    </Section>
    <Section title={t('flowRequests')} count={requests.length}>
      {requests.length ? <ul className="dt-list dt-flow-rows">{requests.map(item => <RequestRow key={item.thread.key}
        thread={item.thread} ticket={item.ticket} at={item.place} />)}</ul> : <Hint>{t('flowNothing')}</Hint>}
    </Section>
    <Section title={t('flowTimeline')} count={recent.data?.items.length}>
      {recent.data?.items.length ? <ol className="dt-flow-timeline">{recent.data.items.map(item => {
        // The pull request the job opened, so the ledger says whether code came out of it.
        const pull = item.ticketId ? byId.get(item.ticketId)?.pulls.find(p => !p.closed) : undefined
        return <li key={item.id} className="dt-flow-event" data-kind={item.outcome}>
          <span className="dt-flow-event-time">{when(item.at, t('lang'))}</span>
          <span className="dt-flow-event-mark">{decisionMark(t, item.outcome).label}</span>
          <button type="button" className="dt-textlink dt-flow-event-what" onClick={() => navigate(item.ticketId
            ? { page: 'execution', id: item.ticketId } : { page: 'trigger', id: item.thread })}>
            {readableMarkers(t, item.threadTitle ?? '') || readableMarkers(t, item.preview) || t('empty')}
          </button>
          {pull && <span className="dt-flow-event-pull">{t('flowOpenedPull', { number: String(pull.number) })}</span>}
        </li>
      })}</ol> : <Hint>{t('flowTimelineEmpty')}</Hint>}
    </Section>
  </>
}
