/** Probes repository and account CLIs, configures the worker execution environment and command shims, and tracks setup readiness. */
import type { Context } from '@deepseek-ai/cordis'
import { UserError } from '../core/index.ts'
import { SETUP_FIELDS, resolveDeployment, resolveFeishuBot, workerProbe, type Deployment, type Machine } from '../deployment.ts'
import { proxyEntries, verifyEnvironment, withoutDirectory, workerBin, workerEnvironment, writeEnvironment } from '../infra/environment.ts'
import type { Settings, SettingsBlock } from '../policy.ts'
import { SetupError, type SetupProblem } from '../setup.ts'

export interface SetupHost {
  readonly context: Context
  readonly machine: Machine
  readonly lifetime: AbortSignal
  restart(): void
}

const setupFields = (settings: Settings) =>
  JSON.stringify(Object.entries(SETUP_FIELDS).map(([id, keys]) => keys.map(key => settings.sources[id]?.config[key] ?? '')))
export const setupChanged = (before: Settings, after: Settings): boolean => setupFields(before) !== setupFields(after)

/**
 * Resolves the target repository, GitHub account, and optional Feishu bot by probing CLIs, then writes and applies the isolated git and shim environment used by worker processes.
 * `Runtime` runs it at startup to gate orchestration readiness, while `Settings` uses it to validate account changes, update blocked command shims, and schedule restarts.
 */
export class Setup {
  private resolved?: Deployment
  problem?: SetupProblem
  feishuProblem?: SetupProblem
  /** PATH with the worker shim directory removed so the host's own CLI calls invoke the real binaries. */
  private readonly path: string
  /** The proxy every outbound call goes through: the Execution settings' value, else the plugin configuration's. */
  private proxy = ''
  /** Disposer for the published worker-environment service. */
  private published?: () => void
  constructor(private readonly host: SetupHost) {
    this.path = withoutDirectory(process.env.PATH ?? '', workerBin(host.machine.stateDir))
  }
  /** Host command environment: the worker shim directory excluded from PATH, and ambient GitHub tokens stripped. */
  get commandEnvironment(): Record<string, string | undefined> { return { PATH: this.path, GH_TOKEN: undefined, GITHUB_TOKEN: undefined, ...proxyEntries(this.proxy) } }
  /** The entries a worker command carries, stamped per spawn by the preset's shell executor; empty when isolation is off. */
  get workerEntries(): Record<string, string> {
    return this.host.machine.isolateEnvironment ? workerEnvironment(this.host.machine.stateDir, this.path, this.proxy) : {}
  }
  /** Publishes those entries as the `workerEnvironment` service the bundle's shell executors read; later calls overwrite its value. */
  private publish(entries: Record<string, string>): void {
    const context = this.host.context as unknown as { provide(name: string, value?: unknown): () => void; set(name: string, value: unknown): void }
    const service = { entries: () => entries }
    if (!this.published) { this.published = context.provide('workerEnvironment', service); return }
    context.set('workerEnvironment', service)
  }
  get deployment(): Deployment {
    if (!this.resolved) throw new Error(`dsh-superagent is waiting for setup: ${this.problem?.detail ?? 'setup has not run'}`)
    return this.resolved
  }
  configured(): boolean { return this.resolved !== undefined }
  /** Resolve deployment accounts and apply the worker environment, recording `SetupError` failures in `problem`/`feishuProblem` and rethrowing unexpected errors. */
  async run(settings: Settings): Promise<boolean> {
    // The proxy has to be known before the probe runs: the probe is what decides readiness.
    this.proxy = settings.executor.proxy.trim() || this.host.machine.proxy.get()
    try { this.resolved = await this.resolve(settings); return true }
    catch (error) {
      if (!(error instanceof SetupError)) throw error
      this.problem = error.problem
      return false
    }
  }
  /** Trigger a restart to re-run setup, refusing if setup and Feishu are already healthy so running assignments are not interrupted. */
  check(): void {
    if (this.configured() && !this.feishuProblem) throw new UserError('setupComplete')
    this.restart()
  }
  /** Defer the restart to the next macrotask so the current HTTP or tool caller receives its response first. */
  restart(): void { setTimeout(this.host.restart, 0) }
  /** Verify account CLIs for a modified source block before saving, ignoring setup errors belonging to other blocks. */
  async checkAccounts(block: SettingsBlock, settings: Settings): Promise<void> {
    const { machine } = this.host
    const check = block === 'source:feishu' ? resolveFeishuBot(machine, settings.sources.feishu?.config, this.probe())
      : resolveDeployment(machine, settings.sources.github?.config, this.probe())
    await check.catch((error: unknown) => { if (!(error instanceof SetupError) || error.place === block.slice(7)) throw error })
  }
  async blockCommands(blocked: readonly string[]): Promise<void> {
    if (this.resolved && this.host.machine.isolateEnvironment) await writeEnvironment(this.resolved, blocked)
  }
  /**
   * Adopt the Execution settings and re-publish the worker entries.
   *
   * The proxy reaches every outbound call through the published worker environment and the host's own
   * command environment, so a proxy change has to be re-stamped for the workers to see it at once.
   */
  async applyExecutor(settings: Settings): Promise<void> {
    this.proxy = settings.executor.proxy.trim() || this.host.machine.proxy.get()
    if (this.resolved && this.host.machine.isolateEnvironment) await writeEnvironment(this.resolved, settings.executor.blockedCommands)
    this.publish(this.workerEntries)
  }
  /** Withdraw the published entries: setup failed, so no worker command may carry half a deployment. */
  restore(): void { this.publish({}) }
  /** Probes CLIs the way worker shells run them, using `stateDir` as `cwd` since it exists even before the repository clone is valid. */
  private probe() {
    const { context, machine, lifetime } = this.host
    return workerProbe(context.subprocess, machine.stateDir, machine.stateDir, lifetime, proxyEntries(this.proxy))
  }
  private async resolve(settings: Settings): Promise<Deployment> {
    const { context, machine, lifetime } = this.host
    const probe = this.probe()
    const deployment = await resolveDeployment(machine, settings.sources.github?.config, probe)
    const feishu = await resolveFeishuBot(machine, settings.sources.feishu?.config, probe).catch((error: unknown) => {
      if (!(error instanceof SetupError)) throw error
      this.feishuProblem = error.problem
      context.logger.warn('dsh-superagent leaves Feishu out: %s', error.message)
      return undefined
    })
    const resolved = { ...deployment, ...(feishu ? { feishu } : {}) }
    const machineProblem = (error: unknown): never => {
      if (error instanceof SetupError) throw error
      throw new SetupError('environmentFailed', { output: error instanceof Error ? error.message : String(error) })
    }
    // Isolation is what binds workers to the agent account. It is scoped: the entries travel with each worker command, so this
    // process's own PATH and git configuration are never touched, whether or not a person also works in this profile.
    this.proxy = settings.executor.proxy.trim() || this.host.machine.proxy.get()
    const entries = this.workerEntries
    if (machine.isolateEnvironment) {
      await writeEnvironment(resolved, settings.executor.blockedCommands).catch(machineProblem)
      await verifyEnvironment(resolved, context.subprocess, lifetime, entries).catch((error: unknown) => {
        this.publish({})
        machineProblem(error)
      })
    }
    this.publish(entries)
    return resolved
  }
}
