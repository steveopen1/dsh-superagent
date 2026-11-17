import { SandboxBashExecutor } from "@deepseek-ai/dsh-bash-sandbox";
//#region src/worker-shell-bash.ts
/** Adds the worker entries to one resolved spec; the preset's `isolate` covers `shell` only, so this service stays reachable. */
const stamp = (ctx, spec) => {
	const provider = ctx.get("workerEnvironment");
	if (!provider) return spec;
	return {
		...spec,
		env: {
			...spec.env,
			...provider.entries()
		}
	};
};
var WorkerBashExecutor = class extends SandboxBashExecutor {
	resolve(request) {
		return stamp(this.ctx, super.resolve(request));
	}
};
//#endregion
export { WorkerBashExecutor, WorkerBashExecutor as default };
