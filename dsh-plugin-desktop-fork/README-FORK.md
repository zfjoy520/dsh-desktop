# DSH Desktop Fork (B 构建版)

本地维护的 DSH Desktop 变体：与 stable **共享 `~/.dsh`（同一会话/同一 Profile）**，
但以独立应用身份安装与运行（`DSH Desktop Fork` / `ai.deepseek.dsh.desktop.fork`），
自动更新已关闭，官方 stable 发版不会覆盖它。

- 源码：`dsh-plugin-desktop-fork/`（由 `dsh-plugin-desktop` @ stable 复制，
  排除 `node_modules`；始终不改 stable/beta 原文件）
- 身份：`src/product-identity.ts`（`releaseChannel: 'stable'` 复用 stable 逻辑，
  `homeDirectoryName: '.dsh'` 共享会话，`appId/productName` 用 fork 的）
- 更新：`src/update-checker.ts`（`FORK_UPDATE_CHECKS_DISABLED` 硬门禁，
  定时 + 手动检查一律返回 null，永不下载官方安装包）与
  `src/updates.ts`（后台轮询默认 `enabled: false`）
- 图标：teal 圆环 + 圆点（`node scripts/tint-fork-app-icon.mjs` 重跑；
  `mac.icon` 改用手绘 tint 的 `build/app-icon.icns`，免 Xcode 重导出）
- 打包入口（根 `package.json`）：`build:fork` / `dev:fork` / `start:fork` /
  `package:dir:fork` / `dist:mac-smoke:fork`

## 并发风险（必读：一次只开一个 App）

Fork 与 stable 共享 `~/.dsh`，`resolveDesktopChannelHome()` 走
`channelHome === legacyHome` 分支，状态为 `'channel'`，无共享警告。
但两个 App 同时运行会竞争同一 home 下的 Profile 索引、sqlite 会话锁、
tray/端口等运行时状态。**同一时刻只启动一个 App（stable 或 fork 二选一），
切换前彻底退出另一个**（Dock 右键 Quit，确认进程已结束）。

`DSH_HOME` 环境变量会覆盖通道逻辑（状态变 `'explicit'`）；fork 与 stable
指向同一个显式目录时同样只能开一个。

## 安装

```sh
cd /Users/zfj/work/yunzhu/ai/deepseek-ai/anywhere-labs/dsh-desktop
 ditto "dsh-plugin-desktop-fork/dist/mac-arm64/DSH Desktop Fork.app" "/Applications/DSH Desktop Fork.app"
```

（构建产物即 `dsh-plugin-desktop-fork/dist/mac-arm64/DSH Desktop Fork.app`；
`ditto` 保留签名/扩展属性，比 `cp -R` 稳妥。不要覆盖
`/Applications/DSH Desktop.app` 官方版。）

重新构建：`yarn package:dir:fork`
（前置：`node dsh-plugin-desktop-fork/node_modules/electron/install.js`
只需跑一次，用于下载 Electron 二进制；另需给
`dsh-plugin-desktop-fork/node_modules/@dataiku/uv-darwin-*/bin/uv`
补 `+x`，见下文“已知坑”。）

## 首次启动验证（确认读到同一会话列表）

1. 彻底退出官方 DSH Desktop（同一时刻只开一个，见上）。
2. 打开 `/Applications/DSH Desktop Fork.app`（Dock 图标有 teal 圆环）。
3. 关于/托盘应显示 `DSH Desktop Fork 2.0.14`，设置里的“检查更新”无更新
   （fork 永不联网查询官方版本）。
4. 会话列表应与官方版看到的完全一致（同一 `~/.dsh`）。
   终端交叉验证：`ls ~/.dsh/sessions | head` 在两个 App 下看到同一目录。
5. 如需回退：退出 Fork，重新打开官方版即可（数据都在 `~/.dsh`，零迁移）。

## 已验证（2026-09-22，本机 arm64）

- `yarn workspace dsh-plugin-desktop-fork build` ✅
- `yarn workspace dsh-plugin-desktop-fork typecheck` ✅
- `yarn workspace dsh-plugin-desktop-fork test` ✅（143 文件 / 1446 通过 / 9 跳过）
- `yarn package:dir:fork` ✅（exit 0；
  `dist/mac-arm64/DSH Desktop Fork.app`，`CFBundleIdentifier =
  ai.deepseek.dsh.desktop.fork`，fuses + 打包 smoke 全过）

## 已知坑（本仓库 checkout 固有，非 fork 缺陷）

1. `yarn install` 后 workspace 内 `electron/dist` 为空（`enableScripts: false`
   跳过了 Electron 二进制下载）：stable/fork 打包前都需手动跑一次
   `node <workspace>/node_modules/electron/install.js`。
2. `@dataiku/uv-darwin-{arm64,x64}/bin/uv` 在 `node_modules` 里丢失了可执行位，
   `afterPack` 会 `EACCES`：`chmod +x` 即可（stable 同样中招）。
3. `scripts/verify-electron-fuses.ts` 在 `--dir` 构建下取不到 arch
  （`MacPackager` 不为 dir target 建 map 条目）：fork 副本里加了
   “配置 target 含 `dir` 则回落到 `process.arch`”逻辑；stable/beta 原文件未动，
   它们的 `package:dir` 在此 checkout 同样会挂（待上游修）。
4. `--dir` 产物会保留 stock `default_app.asar`（官方 dmg 产物里没有），
   会触发 vendored `dsh-fs-local` 的 BigInt stat 崩溃：fork 的 `afterPack`
   会直接删掉该占位文件（与官方产物布局对齐）。
5. vendored 包（`dsh-agent-presets`、`dsh-plugin-package-inventory-deepseek`）
   硬编码读取 `Symbol.for("dsh-plugin-desktop.asar-module-resolver")`：
   fork 的 `src/asar-module-resolver-state.ts` 会同时发布 stable 兼容 marker。
6. `deepseek-harness` submodule 在本机未检出，根 `check:layout` /
   `verify-layout` 跑不到 submodule 相关断言（与 fork 无关，既有状态）。

## 与 stable 同步

改 stable 时：`diff -rq dsh-plugin-desktop/src dsh-plugin-desktop-fork/src`
（预期仅 `product-identity.ts`、`update-checker.ts`、`updates.ts`、
`asar-module-resolver-state.ts` 有 fork 差异），按需 cherry-pick。
`scripts/verify-desktop-variants.mjs` 只比对 stable/beta，不约束 fork。
