# v2.2.0 测试记录

日期：2026-11-19。目标是把界面按 Material Design 3 规范重做。本轮改动集中在样式层与导航交互，业务逻辑、导入解析、提醒排程未改动。

## 设计依据

- 规范来源：`Android-MD3-Knowledge`（lwhhz 维护的 m3.material.io 核验知识库），使用 `01-Foundations`（color-system / typography / shape-system / elevation / motion）、`02-Components`（navigation-bar / fab / cards / sheets / chips / text-fields）、`05-Design-Tokens`（colors.json 角色清单、typography.json 15 档、shapes.json 十档）。
- 色板：用官方 `@material/material-color-utilities` 的 `CorePalette` 按官方 tone 映射从种子色 `#006B9A` 生成，浅色与深色各 29 个语义角色（含 surface-container 五档、outline-variant、inverse 系列）。未手调色值。
- 排版：采用 M3 Type Scale 的 9 档（headlineMedium 28/36、titleLarge 22/28、titleMedium 16/24、titleSmall 14/20、bodyLarge 16/24、bodyMedium 14/20、bodySmall 12/16、labelLarge 14/20、labelMedium 12/16、labelSmall 11/16）。
- 形状：统一到 M3 十档中的 xs 4 / s 8 / m 12 / l 16 / xl 28 / full，不再逐页手写圆角。
- 动效：M3 emphasized `cubic-bezier(.05,.7,.1,1)` 与 standard `cubic-bezier(.2,0,0,1)`，时长 150–320ms。

## 界面

- 底部导航按 navigation-bar 规范重做：80dp 高、64×32 选中指示器、24dp 图标、labelMedium 标签；选中项图标由描边版交叉淡入为实心版。
- 指示器改为独立滑块，切换入口时从旧图标平移到新图标（320ms emphasized）。页面切换时同时播放 fade-through。
- 顶栏为两行式 app bar：第一行品牌标识与「切换／新建」图标按钮（40dp 触控区），第二行课表名（titleLarge）与周切换（‹ 第 N 周 › ＋「本周」text button）。
- 课表：今日整列以 surfaceContainerLow 弱高亮，表头今日用 primaryContainer 圆角块；网格线统一 outlineVariant；节次栏只显示节次序号与上课时间（结束时间移出窄列）。
- 课程卡片改为「容器色 + 容器上文字」浅调配对：由 `courseTone()` 从课程自带色相算出容器底色与同色深字，深色模式另行取值。取消原先依赖白色描边阴影的对比度方案。
- 卡片圆角 8dp（窄列下 12dp 视觉过圆），周次标识改为细描边 chip。
- 悬浮按钮按 FAB 规范：56dp、16dp 圆角、primaryContainer/onPrimaryContainer、elevation-3；弹层打开时淡出。
- 弹层：28dp 顶部圆角、32×4 把手、surfaceContainerLow 容器、标题左对齐；底部操作区用 filled + tonal 两级按钮。
- 表单：课程编辑用 M3 filled 字段（56dp、顶部 4dp 圆角、底部描边），空值且未聚焦时 label 落在框内居中，有值或聚焦浮顶；其余表单用 outlined 字段（4dp 圆角、1dp outline）。
- 设置页：分段按钮（segmented button）、settings 列表项 56dp、开关按 M3 switch 规格（52×32 轨道，选中滑块 24dp）、状态说明块用 surfaceContainerHigh。
- 导入页：分组容器 16dp 圆角，图标容器 12dp 圆角 primaryContainer，CSV 模板行两行式排版 + tonal 下载按钮。
- 空课表增加带图标的空状态引导（标题 + 一句操作提示）。
- 状态栏与导航栏颜色改为跟随新的 surface 角色（浅色 `#F9F9FC` / `#F3F3F6`，深色 `#111416` / `#191C1E`）。

## 验证

- `node tests/core.test.js`：ClassGrid core tests passed；SYUCT schedule syntax tests passed。
- `assembleDebug` 通过（本机 arm64 + qemu 转译 x86_64 aapt2，见下）。`aapt2 dump badging` 确认 `versionCode=16`、`versionName=2.2.0`、minSdk 26、targetSdk 34。
- 逐项核对打包产物：APK 内 `assets/material.css` 含 `nav-indicator` 与 8 处 `md-sys-color-surface-container-highest`；`assets/app.js` 含 5 处 `moveNavIndicator`；`assets/changelog.js` 含本次更新条目。
- 浏览器截图核对（chrome-headless-shell 157，视口 412×915 @2x）：浅色课表、深色课表、添加课程、导入课表、设置（课表／提醒／数据与应用）、周次选择、课表管理。逐张检查标签重叠、弹层标题对齐、悬浮按钮遮挡、导航指示器位置，修掉三处缺陷（表单 label 全部叠到卡片左上、`[hidden]` 失效导致悬浮按钮出现在设置页、指示器定位容器错误）。
- 窄屏与动效降级：`@media(max-width:350px)` 与 `prefers-reduced-motion:reduce` 分支保留，减少动效时全部转场关闭。

## 与上一版的差异范围

- 仅样式与交互表现：`app/src/main/assets/material.css`（重写）、`app/src/main/assets/app.js`（导航图标、卡片配色、空状态、指示器与转场接线）、`MainActivity.java`（系统栏取色）。
- `model.js`、`import.js`、`portal-extract.js`、`pickers.js`、`XlsxReader.java`、提醒相关 Java 文件未改动。
- `CHANGELOG.md` 与 `changelog.js` 同步更新（构建时 `verifyChangelog` 校验两者一致）。

## 构建环境备注（非项目问题）

本机为 arm64，Android SDK 的 `aapt2` 只有 x86_64 构建。用 `qemu-x86_64-static` 加 amd64 glibc 转译执行，并通过 `-Pandroid.aapt2FromMavenOverride=<路径>/aapt2` 指向该垫片（AGP 要求文件名以 `aapt2` 结尾）。这条只影响构建机，不影响产物与工程配置。

## 待补

- 正式发布包需用 `.signing/classgrid.jks` 签名（与 v2.1.1 证书 SHA-256 `952675267c2e00e25ee2400b6a05bf6da4589a7dff306e7f8ee1cd14ad1cc355` 一致），否则已装 v2.1.1 的用户无法覆盖升级。
- `downloads/ClassGrid-v2.2.0.apk`、`update.json` 与 GitHub Release 资产需在拿到正式签名包后一并落地。
