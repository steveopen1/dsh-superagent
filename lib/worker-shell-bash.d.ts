import { SandboxBashExecutor } from "@deepseek-ai/dsh-bash-sandbox";
import { ShellExecRequest, ShellExecSpec } from "@deepseek-ai/dsh-shell";
//#region src/worker-shell-bash.d.ts
declare class WorkerBashExecutor extends SandboxBashExecutor {
  resolve(request: ShellExecRequest): ShellExecSpec;
}
//#endregion
export { WorkerBashExecutor, WorkerBashExecutor as default };