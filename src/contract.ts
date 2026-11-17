/**
 * The contract dsh-superagent promises to Source-kind implementers, stated once as data.
 *
 * ## Why this module exists
 *
 * A Source plugin is written against this contract: it hands the host a `SourceKind`, receives a
 * `SourceContext`, fills `Trigger`s and reads `Ticket`s. The host consumes those values field by
 * field, and a field it does not know is **ignored, not refused**. A renamed field therefore does
 * not fail loudly, it fails quietly: a health code that no longer exists is not translated, a
 * `meta` key that moved is simply not read, and the plugin keeps "working" while doing nothing.
 * Outside this repository nobody notices, because the plugin usually lives in another package that
 * keeps its own copy of these types (the plan-board bridge does).
 *
 * This module states the promised surface once, as data that an outside copy can compare against,
 * and `tests/contract.spec.ts` checks that the host still honours it. The fixtures in that test
 * are built from these names, so a rename in the host breaks the test instead of the plugin.
 *
 * The type-level assertions at the bottom tie these names to the real interfaces, so a rename in
 * `src/sources/kind.ts`, `src/sources/host.ts` or `src/core/model.ts` fails `tsc` as well.
 *
 * ## What belongs here
 *
 * Only what a plugin author must get right for the host to work: the members of `SourceKind`,
 * `SourceContext`, `Trigger` and `Ticket`, and the health vocabulary. Anything the host keeps to
 * itself (the Engine's ports, the Store's tables, the panel's routes) is not part of the contract
 * and must not be listed here.
 */
import type { Ticket, Trigger } from './core/index.ts'
import type { Health, SourceContext, SourceHost, HEALTH_TEXT } from './sources/host.ts'
import type { SourceChannel, SourceKind, SourcePolicyPart, ThreadContext } from './sources/kind.ts'

/**
 * The promised surface, as data.
 *
 * `required` members the host always reads; `optional` members it reads when the plugin provides
 * them. A plugin that follows these names keeps working across host upgrades; one that does not
 * fails silently, which is exactly what this module and its test exist to prevent.
 */
export const SOURCE_CONTRACT = {
  /** The contract's own version; a copy states the version it was written against. */
  version: 1,
  /** `SourceKind`: what a plugin registers with the host. */
  kind: {
    required: ['kind', 'title', 'description', 'schema', 'fields', 'health'],
    optional: ['facts', 'scope', 'channel', 'threadContext', 'find', 'repliesTo', 'policy', 'refreshLabels', 'environment'],
  },
  /** `SourceContext`: what the host hands a plugin. */
  context: {
    required: ['deployment', 'commands', 'ready', 'configured', 'config', 'receive', 'atomic', 'state', 'threads', 'tickets', 'triggers', 'notify', 'report'],
    optional: ['problem'],
  },
  /** `Trigger`: what a plugin fills to hand an event to the host. */
  trigger: {
    required: ['id', 'source', 'threads', 'actor', 'human', 'at', 'text', 'meta'],
    optional: ['addressed', 'channel', 'url'],
  },
  /** `Ticket`: what a plugin reads back. */
  ticket: {
    required: ['id', 'title', 'decisionId', 'mandate', 'channels', 'assignments', 'inputs', 'undelivered', 'createdAt', 'updatedAt', 'origin'],
    optional: ['ended', 'attention', 'follows', 'answers', 'execution', 'delivery'],
  },
  /** `SourceChannel`: the outbound adapter of a kind. */
  channel: { required: ['send', 'link'], optional: ['allowed'] },
  /** `SourcePolicyPart`: the Policy section of a kind. */
  policy: { required: ['schema', 'fields', 'explicit'], optional: ['unnamed', 'rows', 'sync'] },
  /** `ThreadContext`: the context reader of a kind. */
  threadContext: { required: ['messageId', 'read'], optional: ['images', 'image'] },
  /** `SourceHost`: the service a plugin injects. */
  host: { required: ['sources', 'context'] },
  /** `Health`: the vocabulary of a health entry. */
  health: {
    states: ['starting', 'ready', 'paused', 'error'],
    fields: ['state', 'detail', 'at', 'code', 'values'],
    codes: ['setupPending', 'sourceOff', 'feishuCliUnset', 'feishuBotMissing', 'pollFailures'],
  },
} as const

/** A union of the names of a contract section. */
type Names<T extends readonly string[]> = T[number]

/** Whether two types are the same, for the assertions below. */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
/** Fails the compilation when the assertion does not hold. */
type Assert<T extends true> = T

// The names above are the host's promise; these assertions make a rename in the host a compile error.
type _kind = Assert<Equals<keyof SourceKind, Names<typeof SOURCE_CONTRACT.kind.required> | Names<typeof SOURCE_CONTRACT.kind.optional>>>
type _context = Assert<Equals<keyof SourceContext, Names<typeof SOURCE_CONTRACT.context.required> | Names<typeof SOURCE_CONTRACT.context.optional>>>
type _trigger = Assert<Equals<keyof Trigger, Names<typeof SOURCE_CONTRACT.trigger.required> | Names<typeof SOURCE_CONTRACT.trigger.optional>>>
type _ticket = Assert<Equals<keyof Ticket, Names<typeof SOURCE_CONTRACT.ticket.required> | Names<typeof SOURCE_CONTRACT.ticket.optional>>>
type _channel = Assert<Equals<keyof SourceChannel<Record<string, unknown>>, Names<typeof SOURCE_CONTRACT.channel.required> | Names<typeof SOURCE_CONTRACT.channel.optional>>>
type _policy = Assert<Equals<keyof SourcePolicyPart<Record<string, unknown>>, Names<typeof SOURCE_CONTRACT.policy.required> | Names<typeof SOURCE_CONTRACT.policy.optional>>>
type _threadContext = Assert<Equals<keyof ThreadContext<Record<string, unknown>>, Names<typeof SOURCE_CONTRACT.threadContext.required> | Names<typeof SOURCE_CONTRACT.threadContext.optional>>>
type _host = Assert<Equals<keyof SourceHost, Names<typeof SOURCE_CONTRACT.host.required>>>
type _healthStates = Assert<Equals<Health['state'], Names<typeof SOURCE_CONTRACT.health.states>>>
type _healthCodes = Assert<Equals<keyof typeof HEALTH_TEXT, Names<typeof SOURCE_CONTRACT.health.codes>>>
type _healthFields = Assert<Equals<keyof Health, Names<typeof SOURCE_CONTRACT.health.fields>>>

/** Every name the contract promises, per section; a copy compares its own names against these. */
export function contractNames(): Record<string, string[]> {
  const names = (section: { required: readonly string[]; optional?: readonly string[] }) => [
    ...section.required, ...(section.optional ?? []),
  ]
  return {
    kind: names(SOURCE_CONTRACT.kind), context: names(SOURCE_CONTRACT.context), trigger: names(SOURCE_CONTRACT.trigger),
    ticket: names(SOURCE_CONTRACT.ticket), channel: names(SOURCE_CONTRACT.channel), policy: names(SOURCE_CONTRACT.policy),
    threadContext: names(SOURCE_CONTRACT.threadContext), host: names(SOURCE_CONTRACT.host),
    health: [...SOURCE_CONTRACT.health.states, ...SOURCE_CONTRACT.health.fields, ...SOURCE_CONTRACT.health.codes],
  }
}
