import { SandboxPwshExecutor } from "@deepseek-ai/dsh-pwsh-sandbox";
//#region src/worker-shell-pwsh.ts
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
var WorkerPwshExecutor = class extends SandboxPwshExecutor {
	resolve(request) {
		return stamp(this.ctx, super.resolve(request));
	}
};
//#endregion
export { WorkerPwshExecutor, WorkerPwshExecutor as default };
