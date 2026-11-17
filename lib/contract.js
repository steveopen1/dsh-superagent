//#region src/contract.ts
/**
* The promised surface, as data.
*
* `required` members the host always reads; `optional` members it reads when the plugin provides
* them. A plugin that follows these names keeps working across host upgrades; one that does not
* fails silently, which is exactly what this module and its test exist to prevent.
*/
const SOURCE_CONTRACT = {
	/** The contract's own version; a copy states the version it was written against. */
	version: 1,
	/** `SourceKind`: what a plugin registers with the host. */
	kind: {
		required: [
			"kind",
			"title",
			"description",
			"schema",
			"fields",
			"health"
		],
		optional: [
			"facts",
			"scope",
			"channel",
			"threadContext",
			"find",
			"repliesTo",
			"policy",
			"refreshLabels",
			"environment"
		]
	},
	/** `SourceContext`: what the host hands a plugin. */
	context: {
		required: [
			"deployment",
			"commands",
			"ready",
			"configured",
			"config",
			"receive",
			"atomic",
			"state",
			"threads",
			"tickets",
			"triggers",
			"notify",
			"report"
		],
		optional: ["problem"]
	},
	/** `Trigger`: what a plugin fills to hand an event to the host. */
	trigger: {
		required: [
			"id",
			"source",
			"threads",
			"actor",
			"human",
			"at",
			"text",
			"meta"
		],
		optional: [
			"addressed",
			"channel",
			"url"
		]
	},
	/** `Ticket`: what a plugin reads back. */
	ticket: {
		required: [
			"id",
			"title",
			"decisionId",
			"mandate",
			"channels",
			"assignments",
			"inputs",
			"undelivered",
			"createdAt",
			"updatedAt",
			"origin"
		],
		optional: [
			"ended",
			"attention",
			"follows",
			"answers",
			"execution",
			"delivery"
		]
	},
	/** `SourceChannel`: the outbound adapter of a kind. */
	channel: {
		required: ["send", "link"],
		optional: ["allowed"]
	},
	/** `SourcePolicyPart`: the Policy section of a kind. */
	policy: {
		required: [
			"schema",
			"fields",
			"explicit"
		],
		optional: [
			"unnamed",
			"rows",
			"sync"
		]
	},
	/** `ThreadContext`: the context reader of a kind. */
	threadContext: {
		required: ["messageId", "read"],
		optional: ["images", "image"]
	},
	/** `SourceHost`: the service a plugin injects. */
	host: { required: ["sources", "context"] },
	/** `Health`: the vocabulary of a health entry. */
	health: {
		states: [
			"starting",
			"ready",
			"paused",
			"error"
		],
		fields: [
			"state",
			"detail",
			"at",
			"code",
			"values"
		],
		codes: [
			"setupPending",
			"sourceOff",
			"feishuCliUnset",
			"feishuBotMissing",
			"pollFailures"
		]
	}
};
/** Every name the contract promises, per section; a copy compares its own names against these. */
function contractNames() {
	const names = (section) => [...section.required, ...section.optional ?? []];
	return {
		kind: names(SOURCE_CONTRACT.kind),
		context: names(SOURCE_CONTRACT.context),
		trigger: names(SOURCE_CONTRACT.trigger),
		ticket: names(SOURCE_CONTRACT.ticket),
		channel: names(SOURCE_CONTRACT.channel),
		policy: names(SOURCE_CONTRACT.policy),
		threadContext: names(SOURCE_CONTRACT.threadContext),
		host: names(SOURCE_CONTRACT.host),
		health: [
			...SOURCE_CONTRACT.health.states,
			...SOURCE_CONTRACT.health.fields,
			...SOURCE_CONTRACT.health.codes
		]
	};
}
//#endregion
export { SOURCE_CONTRACT, contractNames };
