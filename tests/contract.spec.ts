import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { SOURCE_CONTRACT, contractNames } from '../src/contract.ts'
import { Engine, MemoryRepositories, type Assessor, type Candidate, type Executor, type Policy, type Trigger } from '../src/core/index.ts'
import { environmentOf } from '../src/app/execution-environment.ts'
import { HealthBoard } from '../src/infra/health.ts'
import { HEALTH_TEXT, health } from '../src/sources/host.ts'
import type { SourceKind } from '../src/sources/kind.ts'
import { SourceRegistry } from '../src/sources/registry.ts'
import { SettingsSchema } from '../src/policy.ts'
import type { Settings } from '../src/policy.ts'

/**
 * The contract a Source plugin is written against, checked against the host that serves it.
 *
 * The point of these cases is a question the host cannot answer by itself: **does an
 * implementation written against an older copy of the contract still work here?** The host
 * ignores what it does not know, so a renamed field is not an error, it is a silence. Therefore
 * every fixture here is built from the names in `SOURCE_CONTRACT` — the contract is the old copy,
 * and the host is what answers whether it still understands it.
 *
 * A rename in `src/sources/kind.ts`, `src/sources/host.ts` or `src/core/model.ts` breaks these
 * cases: the host stops calling the member the fixture offers, or stops storing the field the
 * fixture filled. The type-level assertions in `src/contract.ts` make the same rename a compile
 * error, so the two guards fail together.
 */

/** A kind whose members are named by the contract, and which records every call the host makes. */
function contractKind(): { kind: SourceKind; calls: string[] } {
  const calls: string[] = []
  const record = (name: string) => { calls.push(name) }
  const members: Record<string, unknown> = {}
  const schema = z.object({ token: z.string().default('t') }).strict()
  const implementations: Record<string, () => unknown> = {
    kind: () => 'contract',
    title: () => ({ zh: '契约', en: 'Contract' }),
    description: () => ({ zh: '契约来源', en: 'Contract source' }),
    schema: () => schema,
    fields: () => [],
    health: () => ['contract'],
    facts: () => () => { record('facts'); return { cli: 'gh' } },
    scope: () => ({ meta }: { meta: Record<string, unknown> }) => { record('scope'); return { listened: true, observed: false, ...(meta.row ? { row: String(meta.row) } : {}) } },
    channel: () => ({
      allowed: (address: Record<string, string>) => { record('channel.allowed'); return address.ok !== 'no' },
      send: async () => { record('channel.send'); return 'sent' as const },
      link: () => { record('channel.link'); return { url: '', label: { zh: '契约', en: 'Contract' } } },
    }),
    threadContext: () => ({
      messageId: () => { record('threadContext.messageId'); return 'm1' },
      read: async () => { record('threadContext.read'); return { messages: [], body: {} } },
    }),
    find: () => (query: string) => { record('find'); return { threads: [], terms: [query] } },
    repliesTo: () => () => { record('repliesTo'); return undefined },
    policy: () => ({
      schema: z.object({ allowed: z.array(z.object({ id: z.string() })).default([]) }).strict(),
      fields: [],
      explicit: { zh: '名单里的人 @ 智能体。', en: 'A listed sender mentions the agent.' },
      rows: () => { record('policy.rows'); return [] },
    }),
    refreshLabels: () => async () => { record('refreshLabels'); return {} },
    environment: () => ({
      variables: [{ key: 'DSH_SUPERAGENT_CONTRACT', description: { zh: '契约变量', en: 'Contract variable' } }],
      values: () => { record('environment.values'); return { DSH_SUPERAGENT_CONTRACT: 'c' } },
    }),
  }
  for (const name of [...SOURCE_CONTRACT.kind.required, ...SOURCE_CONTRACT.kind.optional]) {
    const make = implementations[name]
    if (!make) throw new Error(`The contract names a kind member this fixture does not implement: ${name}`)
    members[name] = make()
  }
  return { kind: members as unknown as SourceKind, calls }
}

/** The settings a registered kind is stored in. */
function settingsWith(config: Record<string, unknown> = {}): Settings {
  return SettingsSchema.parse({ sources: { contract: { enabled: true, config } }, policy: { sources: { contract: { allowed: [{ id: 'alice' }] } } } })
}

/** A Trigger whose field names come from the contract, so a renamed field leaves it unread. */
function contractTrigger(id: string): Trigger {
  const values: Record<string, unknown> = {
    id, source: 'contract', threads: [{ source: 'contract', id: 't1' }], actor: { source: 'contract', id: 'alice' },
    human: true, at: '2026-09-23T00:00:00.000Z', text: 'please do it', meta: {},
    addressed: 'mention', channel: { source: 'contract', thread: 'contract:t1', address: { id } }, url: 'https://example.test/x',
  }
  const trigger: Record<string, unknown> = {}
  for (const name of [...SOURCE_CONTRACT.trigger.required, ...SOURCE_CONTRACT.trigger.optional]) {
    if (values[name] !== undefined) trigger[name] = values[name]
  }
  return trigger as unknown as Trigger
}

/** An Engine with the smallest set of ports, for the intake and accept path. */
function harness() {
  const repo = new MemoryRepositories()
  const requests: Candidate[] = []
  const assessor: Assessor = { request: candidate => { requests.push(candidate) }, release: () => {} }
  const executor: Executor = { start: () => {}, deliver: () => {}, stop: () => {} }
  const policy: Policy = {
    version: 'v1', paused: false, evalTimeoutMs: 60_000,
    gate: () => ({ admissible: true, strength: 'explicit', basis: { via: 'listed' } }),
    revalidate: () => true, admitsInferred: () => true,
  }
  const engine = new Engine({
    repo, scope: { scope: () => ({ listened: true, observed: false }) }, policy: () => policy, assessor, executor,
    outbox: { send: () => {}, status: () => undefined, withdraw: () => {} }, now: () => '2026-09-23T00:00:00.000Z',
  })
  return { repo, engine, requests }
}

describe('the contract a Source plugin is written against', () => {
  it('names every member of the kinds the host serves', () => {
    // The names are the promise; a copy of the contract outside this repository compares against them.
    const names = contractNames()
    expect(names.kind).toEqual([...SOURCE_CONTRACT.kind.required, ...SOURCE_CONTRACT.kind.optional])
    expect(names.context).toEqual([...SOURCE_CONTRACT.context.required, ...SOURCE_CONTRACT.context.optional])
    expect(names.trigger).toEqual([...SOURCE_CONTRACT.trigger.required, ...SOURCE_CONTRACT.trigger.optional])
    expect(names.ticket).toEqual([...SOURCE_CONTRACT.ticket.required, ...SOURCE_CONTRACT.ticket.optional])
    expect(SOURCE_CONTRACT.version).toBe(1)
  })

  it('reads exactly the optional kind members it names, and no other', async () => {
    const { kind, calls } = contractKind()
    const registry = new SourceRegistry(() => settingsWith(), new HealthBoard())
    registry.register(kind)
    const settings = settingsWith()
    const trigger = contractTrigger('tr1')
    registry.scope({ source: 'contract', meta: {} }, settings)
    expect(registry.channelAllowed({ source: 'contract', address: { ok: 'yes' } }, settings)).toBe(true)
    await registry.send({ id: 'm1', channel: { source: 'contract', thread: 'contract:t1', address: {} }, text: 'hi', kind: 'reply' },
      { run: async () => '' } as never)
    registry.link({ source: 'contract', thread: 'contract:t1', address: {} }, {})
    registry.find('query')
    registry.repliesTo(trigger)
    const context = registry.threadContext(trigger, settings)
    await context?.read({ run: async () => '' } as never, 'thread', undefined)
    // The environment's values are computed for a ticket, not by the registry.
    const variables = environmentOf({ deployment: {} as never, sources: registry, settings, trigger })
    expect(variables.map(variable => variable.key)).toContain('DSH_SUPERAGENT_CONTRACT')
    registry.validatePolicy({ contract: { allowed: [{ id: 'alice' }] } })
    registry.policyPart('contract', settings)
    // Every call the host made names a member the contract promises, so a plugin that implements
    // only the promised members is never called on something it does not have.
    const promised = new Set<string>([...SOURCE_CONTRACT.kind.required, ...SOURCE_CONTRACT.kind.optional])
    expect(calls.filter(name => !promised.has(name.split('.')[0]!))).toEqual([])
    // And the host really reads the optional members it promises to read.
    expect(new Set(calls)).toEqual(new Set(['scope', 'channel.allowed', 'channel.send', 'channel.link',
      'find', 'repliesTo', 'threadContext.messageId', 'threadContext.read', 'environment.values']))
  })

  it('takes a Trigger built from the contract names, and keeps the fields it promises', () => {
    const { engine, repo, requests } = harness()
    expect(engine.receive(contractTrigger('tr1'))).toBe('stored')
    expect(engine.receive(contractTrigger('tr1'))).toBe('duplicate')
    const stored = repo.triggers.get('tr1')!
    for (const name of SOURCE_CONTRACT.trigger.required) expect(Object.hasOwn(stored, name)).toBe(true)
    engine.evaluateDue()
    expect(requests).toHaveLength(1)
    const decision = engine.decide('tr1', { kind: 'accept', title: 'Do it', scope: 'the one file', reason: 'asked', evalId: requests[0]!.evalId })
    expect(decision.kind).toBe('accept')
    const ticket = repo.tickets.get(decision.ticketId!)!
    for (const name of SOURCE_CONTRACT.ticket.required) expect(Object.hasOwn(ticket, name)).toBe(true)
    // The end of a ticket is the optional part plugins read to know it is over.
    engine.stopTicket(ticket.id, 'a person stopped it')
    const ended = repo.tickets.get(ticket.id)!
    expect(ended.ended).toEqual({ at: '2026-09-23T00:00:00.000Z', by: 'human', outcome: 'stopped', reason: 'a person stopped it' })
  })

  it('fills a kind\'s schema defaults and refuses what it does not know', () => {
    const { kind } = contractKind()
    const registry = new SourceRegistry(() => settingsWith(), new HealthBoard())
    registry.register(kind)
    // A missing field takes the schema's default; the host stores what the schema parsed.
    expect(registry.validate('contract', { enabled: true, config: {} })).toEqual({ enabled: true, config: { token: 't' } })
    // An unknown field is refused: a plugin that writes a field the host dropped is told, not ignored.
    expect(() => registry.validate('contract', { enabled: true, config: { token: 'x', extra: 1 } })).toThrow()
    // A stored configuration that no longer parses disables the instance and falls back to the defaults.
    const instance = registry.instance('contract', settingsWith({ extra: 1 }))
    expect(instance).toMatchObject({ enabled: false, config: { token: 't' } })
  })

  it('speaks the health vocabulary it names', () => {
    expect(Object.keys(HEALTH_TEXT).sort()).toEqual([...SOURCE_CONTRACT.health.codes].sort())
    expect(health('ready', 'sourceOff')).toEqual({ state: 'ready', detail: 'Off', code: 'sourceOff' })
    expect(health('error', 'pollFailures', { count: '3', error: 'boom' }).detail).toBe('3 consecutive failed polls; last: boom')
    // A health entry belongs to one writer: a second claim of the same name is refused.
    const board = new HealthBoard()
    board.claim('contract', { state: 'starting', detail: '' })
    expect(() => board.claim('contract', { state: 'starting', detail: '' })).toThrow()
  })
})
