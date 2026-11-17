# 与上游的差异

上游仓库：[deepseek-ai/dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype)（基线 commit `6337fc8`）。

本仓库对上游的改动有三类：**Windows 兼容**（不改语义）、**身份下发范围**（改语义，见第 2 节）与**契约守卫**（不改语义，见第 5 节）。其余文件与上游一致，`prompts/`、`skills/`、`locale/`、`examples/` 均未改动；`docs/` 只多了第 5 节讲的那一处说明。

---

## 1. Windows 兼容（不改变行为语义）

上游是 POSIX 假设的，在 Windows 上会在启动阶段就失败。逐处修改：

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `src/deployment.ts` | `stateDir` 的 schema 从 `pattern(/^\//)` 改为同时接受 `C:\…` 与 `C:/…` | 原正则直接拒绝 Windows 盘符路径 |
| `src/deployment.ts` | `workerProbe` 不再构造 `['env','PATH=…',…]`，改为把 `PATH` 作为 subprocess 的显式 `env` 传入；`Probe` 类型增加可选 env 参数 | Windows 没有 `env` 可执行文件 |
| `src/deployment.ts` | 飞书探针同样去掉 `env` 前缀，改为显式 env | 同上 |
| `src/deployment.ts` | `executable()` 在 Windows 上按 `PATHEXT` 依次尝试 `.exe/.cmd/.bat/.com` | 配置里只写 `gh` 时找不到 `gh.exe` |
| `src/infra/environment.ts` | worker shim：POSIX 仍写 `#!/bin/sh` 脚本；Windows 只写被禁命令的 `.cmd` 存根，不写 `gh`/`lark-cli` 的身份 shim | Windows 不执行无扩展名脚本；`.cmd` 无法安全地"同名遮蔽后再调真实程序" |
| `src/infra/environment.ts` | `written()` 比对标记前去掉行首 `rem ` 并 trim | `.cmd` 存根的标记写在 `rem` 注释行里，否则第二次启动会把它当成外来文件报 `foreignFile` |
| `src/infra/environment.ts` | `credentialHelper()` 在 Windows 返回 `!"C:/…/gh.exe" auth git-credential`（正斜杠 + 双引号） | git 的 `!` helper 在 Windows 由 Git for Windows 的 `sh.exe` 执行，单引号反斜杠路径不稳 |
| `src/infra/environment.ts` | `verifyEnvironment()` 比对前统一反斜杠与 CR | git 在 Windows 回显 `file:C:/…`，与 `path.join` 产物不一致 |
| `src/executor/dsh.ts` | `prepare` 命令在 Windows 用 `powershell.exe -NoProfile -NonInteractive -Command`，POSIX 仍用 `sh -c` | Windows 的 PATH 上没有 `sh`；`prepare` 命令因此要写 PowerShell 语法 |
| `src/app/sessions.ts` | 主 Session 的工具白名单按平台取 `['pwsh']` 或 `['bash']`；`noWait` 守卫同时覆盖 `pwsh` | `tools.restrict()` 遇到未注册的工具名会抛错；Windows 只注册 `pwsh` |
| `src/policy.ts` | `executor.directory` 接受盘符绝对路径 | 面板保存时会返回 400 |

---

## 2. 身份下发范围（改语义）

上游在 `setup` 成功后调用 `applyEnvironment()`，直接改**整个 DSH 进程**的 `PATH` 与 `GIT_CONFIG_GLOBAL`（并把旧值存起来以便还原）。这要求插件跑在专用 profile 里，否则同一个 profile 里人的会话也会被接管。

本仓库改为**按每次命令下发**：DSH 在 spawn 时会把 `ShellExecSpec.env` 合并到"已剥掉凭据形状变量的父环境"之上，所以同样的变量写在 spec 上即可，进程环境一个字节都不动。

| 文件 | 改动 |
| --- | --- |
| `src/infra/environment.ts` | 删除 `applyEnvironment()`；新增 `workerEnvironment(stateDir, path)` 返回条目（`PATH` 前置 shim 目录 + 上游那组 `GIT_*`）；`verifyEnvironment()` / `verifyDirectory()` 改为显式接收 env |
| `src/app/setup.ts` | 不再写 `process.env`；setup 成功后 `ctx.provide('workerEnvironment', { entries })`，失败时撤销；`commandEnvironment` 只保留"去掉 shim 目录 + 抹掉 GH_TOKEN/GITHUB_TOKEN" |
| `src/worker-shell-pwsh.ts`（新增） | `WorkerPwshExecutor extends SandboxPwshExecutor`，覆写 `resolve()` 把服务的条目写进 `spec.env` |
| `src/worker-shell-bash.ts`（新增） | 同上，POSIX 版 |
| `cordis.patch.yml` | 两个 agent preset 里的 `bash-sandbox` / `pwsh-sandbox` 换成 `dsh-superagent/worker-shell-bash` / `-pwsh`（**替换**而非追加：`ctx.shell` 每个 context 只允许一个实现） |
| `src/executor/dsh.ts` | `prepare` 命令与 `verifyDirectory` 显式携带 worker env |
| `src/deployment.ts` | 新增插件配置 `isolateEnvironment`（默认 `true`）：`true` = 按命令下发；`false` = 不下发，worker 用宿主账号 |
| `tsdown.config.ts` / `package.json` | 新增两个 build entry 与对应子路径导出 |

### 行为对照

| | 上游 | 本仓库（`isolateEnvironment: true`） |
| --- | --- | --- |
| 宿主进程 `PATH` / `GIT_CONFIG_GLOBAL` | 被改写 | 不动 |
| worker 命令的 `PATH` / git 配置 | agent 的 | agent 的（等价） |
| 同 profile 里人的会话 | 受影响 | 不受影响 |
| `isolateEnvironment: false` | — | 完全不下发（worker 用宿主账号） |

---

## 3. 为了让声明产物能编译

`src/deployment.ts` 的 `Config` 上加了一处显式类型 `Schemastery<Record<string, unknown>, Machine>` 与 `KEYS` 常量：新增字段后 schemastery 的推断类型在 `.d.ts` 里无法命名（TS2883）。运行时 schema 不变。

`tests/deployment.spec.ts` 的期望值补上新键 `isolateEnvironment: true`。

---

## 4. 未改动的部分

- 领域模型、策略、评估、工单、交付、面板、提示词、Skill、locale（`docs/007-architecture.md` 只补了契约一节）
- `scripts/dsh-superagent`（POSIX 服务脚本，Windows 上不适用；服务用 `dsh --profile … --no-open` 或自己的守护方式）
- 上游的测试用例（除第 3 节提到的那一处期望值）

测试本身是 POSIX 形态（依赖 `sh` / `sleep` / `/tmp`），在 Windows 上运行会失败；交叉验证请在 WSL 或 Linux 里 `pnpm vitest run`。
---

## 5. 契约守卫（不改上游行为）

上游把「对 Source 插件的承诺」只写在类型里（`src/sources/kind.ts`、`src/sources/host.ts`、`src/core/model.ts`），
而宿主对不认识的字段是**消费者 fall through**：字段改名不会报错，只会被静默忽略。
放在别的包里的插件（例如计划板桥）各自抄了一份类型，于是引擎升版时两边悄悄失配——这类问题在生产里极难查。

本仓库把这份承诺抽成**数据**，并给它加了两道守卫：

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `src/contract.ts`（新增） | `SOURCE_CONTRACT`：kind / context / trigger / ticket / channel / policy / threadContext / host / health 的字段名清单，外加把这些名字与真实接口绑在一起的类型级断言 | 让「承诺」变成外部副本能在运行时比对的数据；改名在 `tsc` 阶段就红 |
| `tests/contract.spec.ts`（新增） | 用契约里的名字造 fixture，再问宿主还认不认：读哪些可选成员、Trigger/Ticket 保留哪些字段、schema 怎么填默认值与拒绝未知键、健康码是哪几个 | 引擎改名时**测试变红**，而不是插件静默失灵 |
| `tests/worker-scope.spec.ts`（新增） | 工单的 scope 到底能管到 worker 哪一步 | 见第 6 节 |
| `tsdown.config.ts` / `package.json` / `src/index.ts` | 新增 `contract` 构建入口、`./contract` 子路径导出，包根也再导出一次 | 让别的包能在运行时读到这份契约（`import { SOURCE_CONTRACT } from 'dsh-superagent/contract'`） |

---

## 6. worker 的范围目前只是约定（不是强制）

引擎**授权**工单（Policy 的 gate 决定能不能开工，Mandate 记录被授权到什么程度），但**不约束** worker 干活的过程：

| 本该管住 worker 的东西 | 现状 |
| --- | --- |
| 工单 scope | 文本。对**明确请求**的工单，scope 文本根本不下发给 worker（`ticketExecution` 只带路由备注），worker 读到的范围就是**原始请求本身**；对**主动推断**的工单，assignment 里带 `Scope: …` 与命中的规则，系统提示词里另有一段限制 |
| 文件写入范围 | 引擎不管。worker 的工作目录是工单自己的目录（`DSH_SUPERAGENT_DIR`），越界写入靠 **DSH 的沙箱**（在引擎之外，按会话 cwd 决定可写根目录），引擎不参与 |
| 命令黑名单 | `executor.blockedCommands` 是**运维配置**，按命令名拦，面板文案自己写明「不是安全边界」；与工单 scope 无关 |

也就是说：worker 改了 scope 外的文件，引擎**不会拦，也不会记录成「越界」**；能看到的只有工单本身（报告、PR、worktree 里的文件）。
`tests/worker-scope.spec.ts` 把这条现状钉住：将来谁加约束或撤约束，都必须改这个测试，不会悄悄变。
本仓库没有实现更强的约束；可做的下一步是 worker 报告时用 `git status` 记下本工单改动的文件清单并存进工单，让「越界」**可见**。