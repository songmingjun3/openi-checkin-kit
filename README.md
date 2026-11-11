# DSH OpenI 每日打卡插件 / OpenI Daily Check-in

把 `openi-checkin-kit` 的打卡引擎封装为 DeepSeek Harness 插件：**支持多账号**，每个账号
在全局时间范围内拥有自己的随机执行时间；登录、开关、时间窗口都在设置页可视化配置。

An OpenI daily check-in plugin for DeepSeek Harness with **multiple accounts**,
each with its own random daily window inside a global range. Sign-in, the master
switch and every window are configured in the settings page.

## 安装 / Install

```sh
dsh plugin --profile <profile> install github:songmingjun3/openi-checkin-kit
```

或在 DSH 的 **插件 → 已安装 → 安装插件** 中填写 `github:songmingjun3/openi-checkin-kit`。

## 功能

- **多账号**：可添加任意数量账号；每个账号独立保存凭据、独立随机时间、独立 Windows 定时任务
  `OpenI-Daily-Checkin-DSH-<accountId>`、独立日志目录（`logs/<accountId>/`）。
- **并发安全**：引擎用「日志目录旁的锁文件」保证同一账号不会重复执行；因此每个账号使用**独立日志目录**，
  不同账号可同时运行而互不阻塞，同一账号的重复触发仍会被跳过。
- **每个账号随机时间**：全局时间范围（如 09:00–10:00）+ 每个账号自己的子窗口（如 09:00–09:20、
  09:30–09:55）。Windows 任务用 `RandomDelay` 在该子窗口内随机触发；DSH 运行期间另有进程内定时器
  按同样规则兜底。
- **首次登录**：未登录时设置页提供「前往默认浏览器登录」，点击后由 Host 调用系统默认浏览器打开
  OpenI 登录页（不使用内置浏览器）。在浏览器登录并保存密码后点「自动获取登录信息」即可自动读取
  Chrome 保存的密码；也支持手动账号密码与 Cookie。
- **同站点多账号**：Chrome 可能保存了多个 OpenI 账号。添加账号时会列出全部已保存账号供选择，
  默认取**最近使用**的那个；每个账号用它自己的密码校验，不会串号。
- **凭据存储**：密码/Cookie 写入 Harness 凭据记录（每个账号一条），不写入配置文件；供定时任务使用的
  引擎配置在 Windows 上按账号分别用当前用户 DPAPI 加密保存，执行时解密到临时文件并立即删除。
- **可视化配置**：开关用 switch，时间用时间选择框，其余操作均为按钮；全部落在窗口内，无需手改配置。
- **登录校验**：新增/重新登录账号时用引擎的 `--verify-login` 校验登录与任务列表接口，失败即报错。

## 配置

全局配置（`cordis.patch.yml`，也可在设置页修改）：

```yaml
enabled: false       # 自动打卡总开关
startTime: '09:00'   # 全局时间范围
endTime: '10:00'
```

每个账号的 `enabled`、`startTime`、`endTime` 保存在插件状态文件里（由设置页维护），必须落在全局范围内。

## Agent 工具

`openi_checkin` 的 `action`：

`status`、`openLoginBrowser`、`addAccount`、`signIn`、`removeAccount`、`saveSettings`、
`installTask`、`removeTask`、`dryRun`、`checkIn`、`log`。

为账号级操作传 `accountId`；`saveSettings` 可带 `accounts: [{ id, enabled, startTime, endTime }]`。
敏感参数只在调用时传递，返回值不回显密码/Cookie。

## 文件

- `index.js`：Host 服务、每账号凭据/配置/任务/定时器、HTTP 路由、Agent 工具、旧版单账号迁移。
- `client.js`：Web 设置页（全局设置 + 账号列表 + 添加账号）。
- `lib/openi-checkin.cjs`：原始打卡引擎（新增 `--verify-login`）。
- `lib/discover-chrome.cjs`：Chrome 凭据自动发现。
- `lib/config.cjs` / `lib/tool.cjs`：本地配置声明与工具 schema 构造。
- `locale/*.json` / `icon.svg`：插件显示资源。
- `test-host.mjs` / `test-runner.mjs` / `test-tool.mjs`：离线验证时间窗口、每账号任务 XML、DPAPI 封装、
  启动器与工具 schema。

## 许可 / License

MIT。
