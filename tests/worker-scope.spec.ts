import { describe, expect, it } from 'vitest'
import { ticketEnvironment } from '../src/app/execution-environment.ts'
import { mandateInstructions, ticketExecution, triggerMessage } from '../src/executor/dsh.ts'
import { SettingsSchema } from '../src/policy.ts'
import type { Ticket, Trigger } from '../src/core/index.ts'

/**
 * How far a ticket's scope actually reaches its worker.
 *
 * The engine **authorizes** work: the Policy gate decides whether a ticket may start at all, and
 * the Mandate records what it was authorized for. It does not **confine** the worker while it
 * works. The scope of a ticket is text the worker reads, and the only boundaries the engine sets
 * itself are the ticket's own directory and the operator's list of blocked commands — neither is
 * derived from the scope.
 *
 * These cases pin that, so that a change which adds or removes a constraint cannot pass unnoticed,
 * and so that the gap is written down where a reader of the code meets it. A worker that writes
 * outside its scope is not stopped by the engine: what the ticket produces is visible (its
 * report, its pull request, the files its worktree holds), but the engine does not record the
 * attempt as an out-of-scope one.
 */
const settings = SettingsSchema.parse({
  policy: { rules: [{ id: 'copy', name: 'Copy fixes', enabled: true, instruction: 'Fix typos only.' }] },
  executor: { blockedCommands: ['personal-gh'] },
})
const request = '把副标题改成“浏览网页”'
const trigger: Trigger = {
  id: 'tr1', source: 'github', threads: [{ source: 'github', id: '128' }], actor: { source: 'github', id: 'alice' },
  human: true, addressed: 'mention', at: '2026-09-23T00:00:00.000Z', text: request,
  channel: { source: 'github', thread: 'github:128', address: { number: '128' } }, meta: { number: 128 },
}
/** A ticket the way the Engine creates it: with its mandate, its execution and its first Assignment. */
function ticketOf(strength: 'explicit' | 'inferred', scope: string): Ticket {
  return {
    id: 'ticket-0123456789abcdef', title: '改副标题', decisionId: 'dec1',
    mandate: { strength, policyVersion: 'v1', basis: strength === 'inferred' ? { via: 'admission', rules: ['copy'] } : { via: 'addressed', addressed: 'mention' },
      actor: { source: 'github', id: 'alice' }, scope },
    channels: [], assignments: [], inputs: [], undelivered: [], createdAt: '2026-09-23T00:00:00.000Z', updatedAt: '2026-09-23T00:00:00.000Z',
    origin: { triggerId: trigger.id, triggerIds: [trigger.id] },
    execution: { name: 'fix-subtitle-ticket-01234', directory: '/state/work/fix-subtitle-ticket-01234', assignment: '' },
  } as unknown as Ticket
}
/** The environment the worker and its prepare command work in. */
function environmentOf(ticket: Ticket) {
  return ticketEnvironment({ deployment: {} as never, sources: { environments: () => [] } as never, settings, ticket, trigger })
}

describe('the scope a ticket hands its worker', () => {
  it('is the request itself for an explicit ticket, and nothing else', () => {
    const ticket = ticketOf('explicit', '只改副标题那一行')
    const execution = ticketExecution(ticket, { kind: 'accept', title: '改副标题', scope: '只改副标题那一行', reason: 'asked', name: 'fix-subtitle' } as never,
      settings, '/state')
    // The scope the assessor wrote is not repeated to the worker: the request is the scope, and a
    // second wording of it would let the router widen the work by paraphrasing it.
    expect(execution.assignment).not.toContain('只改副标题那一行')
    expect(execution.assignment).toBe('')
    expect(mandateInstructions(ticket.mandate)).toBe('')
    // What the worker reads is the request, unchanged.
    expect(triggerMessage(trigger, {}).text).toBe(request)
  })

  it('is written out for a proactive ticket, with the rules that bound it', () => {
    const ticket = ticketOf('inferred', '只改副标题那一行')
    const execution = ticketExecution(ticket, { kind: 'accept', title: '改副标题', scope: '只改副标题那一行', reason: 'a rule matched', name: 'fix-subtitle' } as never,
      settings, '/state')
    expect(execution.assignment).toContain('Scope: 只改副标题那一行.')
    expect(execution.assignment).toContain('- Copy fixes (copy): Fix typos only.')
    // And the limits that make a proactive ticket narrower than an explicit one are in the system prompt.
    expect(mandateInstructions(ticket.mandate)).toContain('do not expand scope')
  })

  it('points the worker at its own directory, which is the only place the engine confines it to', () => {
    const ticket = ticketOf('explicit', '只改副标题那一行')
    const variables = environmentOf(ticket)
    expect(variables.find(variable => variable.key === 'DSH_SUPERAGENT_DIR')?.value).toBe(ticket.execution!.directory)
    expect(variables.find(variable => variable.key === 'DSH_SUPERAGENT_NAME')?.value).toBe(ticket.execution!.name)
    expect(variables.find(variable => variable.key === 'DSH_SUPERAGENT_TICKET')?.value).toBe(ticket.id)
  })

  it('derives no command restriction from the scope: two tickets with different scopes get the same one', () => {
    const narrow = environmentOf(ticketOf('explicit', '只改副标题那一行'))
    const wide = environmentOf(ticketOf('explicit', '整个项目重构'))
    const blocked = narrow.find(variable => variable.key === 'DSH_SUPERAGENT_BLOCKED_COMMANDS')?.value
    expect(blocked).toBe('personal-gh')
    // The blocked commands are the operator's, listed by name; the ticket's scope does not reach them.
    expect(wide.find(variable => variable.key === 'DSH_SUPERAGENT_BLOCKED_COMMANDS')?.value).toBe(blocked)
    expect(narrow.map(variable => variable.key)).toEqual(wide.map(variable => variable.key))
  })

  it('keeps the scope text out of what an explicit worker is told', () => {
    const scope = '只改副标题那一行'
    const ticket = ticketOf('explicit', scope)
    const execution = ticketExecution(ticket, { kind: 'accept', title: '改副标题', scope, reason: 'asked', name: 'fix-subtitle' } as never,
      settings, '/state')
    const told = [execution.assignment, triggerMessage(trigger, {}).text].join('\n')
    expect(told).not.toContain(scope)
  })
})
