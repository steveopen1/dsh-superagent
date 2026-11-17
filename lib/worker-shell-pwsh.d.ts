import { SandboxPwshExecutor } from "@deepseek-ai/dsh-pwsh-sandbox";
import { ShellExecRequest, ShellExecSpec } from "@deepseek-ai/dsh-shell";
//#region src/worker-shell-pwsh.d.ts
declare class WorkerPwshExecutor extends SandboxPwshExecutor {
  resolve(request: ShellExecRequest): ShellExecSpec;
}
//#endregion
export { WorkerPwshExecutor, WorkerPwshExecutor as default };