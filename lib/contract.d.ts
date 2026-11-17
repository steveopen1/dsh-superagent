//#region src/contract.d.ts
/**
 * The promised surface, as data.
 *
 * `required` members the host always reads; `optional` members it reads when the plugin provides
 * them. A plugin that follows these names keeps working across host upgrades; one that does not
 * fails silently, which is exactly what this module and its test exist to prevent.
 */
declare const SOURCE_CONTRACT: {
  /** The contract's own version; a copy states the version it was written against. */
  readonly version: 1;
  /** `SourceKind`: what a plugin registers with the host. */
  readonly kind: {
    readonly required: readonly ["kind", "title", "description", "schema", "fields", "health"];
    readonly optional: readonly ["facts", "scope", "channel", "threadContext", "find", "repliesTo", "policy", "refreshLabels", "environment"];
  };
  /** `SourceContext`: what the host hands a plugin. */
  readonly context: {
    readonly required: readonly ["deployment", "commands", "ready", "configured", "config", "receive", "atomic", "state", "threads", "tickets", "triggers", "notify", "report"];
    readonly optional: readonly ["problem"];
  };
  /** `Trigger`: what a plugin fills to hand an event to the host. */
  readonly trigger: {
    readonly required: readonly ["id", "source", "threads", "actor", "human", "at", "text", "meta"];
    readonly optional: readonly ["addressed", "channel", "url"];
  };
  /** `Ticket`: what a plugin reads back. */
  readonly ticket: {
    readonly required: readonly ["id", "title", "decisionId", "mandate", "channels", "assignments", "inputs", "undelivered", "createdAt", "updatedAt", "origin"];
    readonly optional: readonly ["ended", "attention", "follows", "answers", "execution", "delivery"];
  };
  /** `SourceChannel`: the outbound adapter of a kind. */
  readonly channel: {
    readonly required: readonly ["send", "link"];
    readonly optional: readonly ["allowed"];
  };
  /** `SourcePolicyPart`: the Policy section of a kind. */
  readonly policy: {
    readonly required: readonly ["schema", "fields", "explicit"];
    readonly optional: readonly ["unnamed", "rows", "sync"];
  };
  /** `ThreadContext`: the context reader of a kind. */
  readonly threadContext: {
    readonly required: readonly ["messageId", "read"];
    readonly optional: readonly ["images", "image"];
  };
  /** `SourceHost`: the service a plugin injects. */
  readonly host: {
    readonly required: readonly ["sources", "context"];
  };
  /** `Health`: the vocabulary of a health entry. */
  readonly health: {
    readonly states: readonly ["starting", "ready", "paused", "error"];
    readonly fields: readonly ["state", "detail", "at", "code", "values"];
    readonly codes: readonly ["setupPending", "sourceOff", "feishuCliUnset", "feishuBotMissing", "pollFailures"];
  };
};
/** Every name the contract promises, per section; a copy compares its own names against these. */
declare function contractNames(): Record<string, string[]>;
//#endregion
export { SOURCE_CONTRACT, contractNames };