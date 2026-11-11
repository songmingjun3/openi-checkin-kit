# DSH OpenI 每日打卡插件 / OpenI Daily Check-in

把 `openi-checkin-kit` 的打卡引擎封装为 DeepSeek Harness 插件，在 Web GUI 的
**Settings → OpenI 打卡** 中完成首次登录、自动获取登录信息、设置执行时间范围，并可手动运行/查看日志。

Encapsulates the OpenI daily debug-task check-in engine as a DeepSeek Harness
plugin: sign-in, automatic credential discovery, a configurable random
execution window, and manual runs — all from **Settings → OpenI check-in**.

## 安装 / Install

```sh
dsh plugin --profile <profile> install github:songmingjun3/dsh-openi-checkin
```

或在 DSH 的 **插件 → 已安装 → 安装插件** 中填写
`github:songmingjun3/dsh-openi-checkin`。安装后在 **Settings → OpenI 打卡**
首次登录，登录信息会自动读取 Chrome 中保存的 OpenI 密码（也可手动填账号密码或 Cookie）。

## 功能

- **首次登录**：账号未登录时，设置页提供 **“前往默认浏览器登录”** 按钮，点击后直接调用系统默认
  浏览器打开 OpenI 登录页（不使用内置浏览器）。在浏览器中登录并保存密码后，点击
  **“登录完成后自动获取”** 即可自动读取 Chrome 保存的登录信息；也支持手动 `plain` 账号密码与
  `cookie` 登录。获取时会调用原脚本的 `--check` 验证登录与任务列表接口，成功后才保存。
- **账号信息展示**：设置页账号卡片显示当前账号、凭据来源、Chrome Profile 与验证时间。
- **凭据存储**：密码/Cookie 写入 Harness 凭据记录 `openi-checkin/account`，不写入 `cordis.patch.yml`；
  Chrome 自动发现只在内存中传递密码，临时数据库副本立即删除。供定时任务使用的运行配置在 Windows
  上经当前用户 DPAPI 加密保存，执行时解密到临时文件并立即删除。
- **窗口内可配置**：所有配置都在设置页完成，无需手工改配置文件——开关用 switch 按钮，
  开始/结束时间用时间选择框，定时任务注册/删除、演练、立即打卡、日志都是按钮操作。
- **时间范围**：配置 `startTime`、`endTime`（本地 HH:MM），在窗口内随机选一个时刻；
  保存设置时同步注册/更新 Windows 定时任务 `OpenI-Daily-Checkin-DSH`，
  DSH 运行期间另有进程内定时器做错过计划后的补跑。
- **两种入口共享同一操作**：设置页 HTTP 路由 `/api/openi-checkin/*` 与 Agent 工具
  `openi_checkin` 都调用同一个 Host 服务方法。
- **打卡逻辑**：沿用压缩包内 `openi-checkin.js`，包括再次调试/新建任务、停止、幂等、清理与重试。

## 配置

`cordis.patch.yml` 默认值（可在设置页修改并自动持久化）：

```yaml
enabled: false       # 登录后可在设置页打开
startTime: '09:00'
endTime: '10:00'     # 9:00–10:00 内随机
```

设置页的保存操作通过 `configEditor` 持久化到当前 profile，而不是修改插件包。
Windows 定时任务依赖 `schtasks.exe` 和当前登录用户的 DPAPI 凭据解密；Chrome 自动发现需要 Node 22+。

## Agent 工具

`openi_checkin` 的 `action` 参数支持：
`status`、`openLoginBrowser`、`signIn`、`signOut`、`saveSettings`、`installTask`、`removeTask`、
`dryRun`、`checkIn`、`log`。敏感参数仅在调用时传递，返回值不回显密码/Cookie。

## 文件

- `index.js`：Host 服务、凭据记录、配置持久化、定时任务、HTTP 路由、Agent 工具。
- `client.js`：Web 设置页；仅使用 React 与 `--dsw-alias-*` 主题 token。
- `lib/openi-checkin.cjs`：原始打卡引擎（仅修正 `--config` 参数解析）。
- `lib/discover-chrome.cjs`：Chrome 凭据自动发现。
- `lib/config.cjs`：本地 Standard Schema 配置声明。
- `lib/tool.cjs`：本地工具定义封装，在官方 `defineTool` 不可用时保持工具 schema 可用。
- `locale/*.json` / `icon.svg`：插件显示资源。
- `test-host.mjs` / `test-runner.mjs`：离线验证时间窗口、任务 XML、DPAPI 封装与启动器。

## 许可 / License

MIT — 打卡引擎来自 `openi-checkin-kit`（原始脚本版随包分发）。
