# LifeLog

记录生活行为的 Android 应用，采用「网页套壳」（原生 WebView 容器 + 内置网页前端）的方式实现。

| 项目 | 值 |
| --- | --- |
| 当前版本 | **v0.0.11** |
| 包名 | `com.eliaszwc.lifelog` |
| 最低支持 | Android 8.0（API 26） |
| 目标版本 | Android 15（API 35） |
| 仓库 | https://github.com/EliasZWC/LifeLog |

## 设计约定

- **图标**：全部使用谷歌官方 [Material Icons](https://fonts.google.com/icons)，不引入第三方图标集。
- **主题色**：黑白，但使用不同质感的灰阶表达层次，**不使用纯黑 `#000` / 纯白 `#fff`**。
  - 白天主题：以白为主（页面背景 `#EFEFED`，导航栏 / 面板 `#FCFCFB`，文字 `#1B1B1B`）
  - 夜间主题：以黑为主（页面背景 `#1E1E1E`，导航栏 `#131313`，面板 `#242424`，文字 `#ECECEA`）
  - 导航栏与页面背景的关系固定为「导航栏更极端」：日间导航栏比背景更白，夜间导航栏比背景更黑；
    设置项这类“栏”则取 `--surface`，与 `--bg` 拉开差异以体现分区。
  - 主题色定义集中在 `app/src/main/assets/www/styles.css` 的 `:root` 与 `@media (prefers-color-scheme: dark)` 中，加壳侧的系统栏颜色在 `res/values/colors.xml` 与 `res/values-night/colors.xml`。
- **语言**：默认英文（`en`）。网页端 i18n 在 `app/src/main/assets/www/i18n.js`，原生端以 `res/values/strings.xml`
  作为英文默认资源；中文（`zh`）词条已备好，等「设置」页做好后接上切换入口。
- **主题设置**：设置页可在「日间 / 夜间 / 跟随系统」间切换。网页端通过 `<html data-theme>` 覆盖系统配色，
  原生端同步窗口背景与状态栏图标颜色，保证系统与应用内设置不一致时不露错色。

## 网页与原生通信

原生通过 `addJavascriptInterface` 向网页暴露 `LifeLogNative` 对象（见 `WebAppBridge`）：

| 方法 | 说明 |
| --- | --- |
| `setThemeMode(mode)` | 网页切换主题后通知原生，`mode` 为 `light` / `dark` / `system` |
| `saveRecordsCsv(csv)` | 把全部时间记录的 CSV 镜像写入 LifeLog 目录 |
| `saveMetricsCsv(csv)` | 把全部跟踪数据的 CSV 镜像写入同一目录的 `metrics.csv` |
| `pickStorageFolder()` | 拉起系统文件夹选择器，换数据存储位置 |
| `resetStorageFolder()` | 恢复默认存储位置 |
| `exportRecordsCsv(csv)` | 设置页「导出数据」：拉起系统「另存为」 |
| `downloadUpdate()` | 更新弹窗点「更新」：开始下载新版 APK |
| `installUpdate()` | 安装被权限拦下后点「重试安装」 |
| `closeUpdate()` | 弹窗关掉，原生可以重置「本次进入已检查过」的状态 |

反方向（原生 → 网页）用 `evaluateJavascript` 调用 `LifeLogShell`：

| 方法 | 说明 |
| --- | --- |
| `setInsets(top, right, bottom, left, keyboard)` | 推送系统栏与输入法尺寸（dp），网页写进 `--safe-*` / `--keyboard` CSS 变量 |
| `setVersion(name, code)` | 推送版本名与版本号，供设置页只读显示 |
| `onStorageReady(csv, path)` | 推送 `LifeLog/records.csv` 的内容与路径（文件不存在时内容为空串） |
| `onMetricsReady(csv)` | 推送 `metrics.csv` 的内容 |
| `onCsvSaved(ok, detail)` | 时间记录 CSV 落盘结果 |
| `onMetricsSaved(ok, detail)` | 跟踪数据 CSV 落盘结果 |
| `onStoragePathChanged(path)` | 只换了目录、内容未变（例如切到新文件夹后的回推） |
| `onExported(ok, detail)` | 导出结果（`detail` 为空串表示用户取消） |
| `onUpdateAvailable(version, current, size)` | 发现新版本，网页弹窗 |
| `onUpdateProgress(percent)` | 下载进度 0~100 |
| `onUpdateReady()` | 下载完成，安装器已拉起 |
| `onUpdateFailed(reason, downloaded)` | 更新失败；`reason` 为 `permission` / `network` / `install` |

**WebView 是全屏的**（包括状态栏与系统导航条区域），所以遮罩与底部弹窗能盖住整屏。
内容要让开多少由 CSS 变量决定，不依赖 `env(safe-area-inset-*)`（WebView 里的取值不可靠，只在 `:root` 里作为兜底）。

原生会把主题偏好落到 `SharedPreferences`，保证冷启动时先上对背景色，不用等网页接管。
网页侧的偏好则存在 `localStorage`，两者由这一桥接保持同步。

## 应用内更新

每次重新进入 app（`onResume`，且页面已就绪）会去查一次
`https://api.github.com/repos/EliasZWC/LifeLog/releases/latest`：

- 取 `tag_name` 去掉 `v` 与本地 `versionName` 按段比较，**只认更新不回退**；
- 从 `assets[]` 里挑第一个 `.apk`，用它的 `browser_download_url` 与 `size`；
- 有新版本才推给网页弹窗，用户确认后由原生下载到 `cacheDir/update/`；
- 下完用 `FileProvider`（authority `${applicationId}.fileprovider`）以 `content://` 交给系统安装器；
- 若系统未授予「安装未知应用」（`canRequestPackageInstalls()` 为 false），
  先跳 `ACTION_MANAGE_UNKNOWN_APP_SOURCES`，回来后点「重试安装」即可，无需重下。

几个刻意的限制：

- **每次进入前台只查一次**。GitHub 未登录 API 限额是每小时 60 次；
  而拉起安装器会让 Activity 走一遍 `onStop`/`onResume`，所以弹窗还开着时不重置标志，
  否则会反复弹窗。
- 只能覆盖安装，**签名不同会装不上**；因此更新包必须是同一个发布密钥签的。
- debug 构建的 `versionName` 带 `-debug` 后缀，比较时会先截掉。

## 数据模型

**时间记录以 CSV 形式存放在手机的 LifeLog 目录下作为数据库**，应用启动时从该文件载入，
之后任何改动都会同步写回；`localStorage` 只是一份加快启动的缓存。

落盘位置：`Documents/LifeLog/records.csv`（API 29+ 走 MediaStore，无需任何权限，文件管理器可见；
部分定制系统限制 MediaStore 时会退回应用专属目录，实际路径会显示在设置页）。

CSV 表头固定为 `id,behavior,type,start,end`：

- `behavior` 写的是行为**名称**而不是 id，便于人读与迁移
- `start` / `end` 为本地时间 `YYYY-MM-DD HH:mm`，时点的 `end` 留空
- 行尾 CRLF，Excel 可直接打开

```js
Behavior = { id, name, icon }                                  // icon 为 icons.js 里的图标名
Record   = { id, behaviorId, type, start, end }                // type: 'period' | 'moment'
```

- **行为是时间记录的前提**：先在行为页建立行为，才能在时间页新增记录。
- 删除行为会连带删除它名下的全部时间记录。
- 时间记录的增删改都会重写整个 CSV（个人量级足够快）。

### 跟踪数据（`metrics.csv`）

跟跟踪是与「行为 / 时间记录」完全独立的另一套数据，存在于导航栏第二个页签（Track）：

```js
Metric       = { id, name, icon }
MetricRecord = { id, metricId, time, value }
```

- 跟踪项就是「被跟踪的数据」，比如体重、腰围、每日喝水量。
- 跟踪记录本质上都是**时点**：只有记录时间与记录值，没有起止时间，
  所以它们永远不会出现在时间页，只能从跟踪详情页的悬浮按钮添加。
- CSV 表头为 `id,metric,time,value`，`metric` 同样写名称，与 `records.csv` 放在同一个目录。

### 存储位置

设置页的「数据存储位置」可以换成任意文件夹（`ACTION_OPEN_DOCUMENT_TREE`，授权会持久化）：

- 目标文件夹里已有 `records.csv` → 采用它（相当于换一个数据库）
- 没有 → 把当前内存里的数据搬过去
- 长按那一栏恢复默认位置（`Documents/LifeLog`）

## 目录结构

```
LifeLog/
├── .github/workflows/
│   ├── build.yml                 # CI：构建 Debug APK
│   └── release.yml               # 发布：打 v* 标签时构建并发布 Release
├── app/
│   ├── build.gradle.kts          # 版本号唯一来源
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/eliaszwc/lifelog/
│       │   ├── MainActivity.kt   # WebView 容器、系统栏、文件选择器
│       │   ├── WebAppBridge.kt   # 暴露给网页的 JS 接口
│       │   ├── CsvStore.kt       # CSV 落盘到 LifeLog 目录
│       │   ├── Updater.kt        # 应用内更新：查 Release / 下载 APK / 拉起安装器
│       │   └── CrashLog.kt       # 崩溃堆栈落盘并在下次启动显示
│       ├── assets/www/           # 网页前端
│       │   ├── index.html        # 页面结构（含表单弹窗、详情页）
│       │   ├── styles.css        # 主题变量 + 全部样式
│       │   ├── i18n.js           # 中英文词条
│       │   ├── icons.js          # 谷歌官方行为图标库
│       │   ├── csv.js            # CSV 序列化 / 解析
│       │   ├── store.js          # 数据层（行为 / 时间记录）
│       │   ├── metrics.js        # 数据层（跟踪项 / 跟踪记录）
│       │   ├── components.js     # 弹窗 / 下拉 / 图标选择器 / 多选 / 轻提示 / 壳通信
│       │   ├── datetime.js       # 日期格式化 + 分段日期时间输入
│       │   ├── chart.js          # 直方图（内联 SVG）
│       │   ├── theme.js          # 主题偏好
│       │   ├── setting.js        # 设置页
│       │   ├── update.js         # 应用内更新弹窗
│       │   ├── page-time.js      # 时间页
│       │   ├── page-behavior.js  # 行为页
│       │   ├── page-behavior-detail.js  # 行为详情页
│       │   ├── page-metric.js    # 跟踪页
│       │   ├── page-metric-detail.js    # 跟踪详情页
│       │   └── app.js            # 外壳：导航 / 标题 / 启动
│       └── res/                  # 主题、配色、启动图标、FileProvider 路径
├── build.gradle.kts
├── settings.gradle.kts
├── gradle.properties
└── CHANGELOG.md
```

网页资源通过 `WebViewAssetLoader` 以 `https://appassets.androidplatform.net/assets/www/index.html`
提供给 WebView（而不是 `file://`），这样 `localStorage` 等 Web API 才能正常工作。

## 本地开发

本地只需改网页部分时，可以直接用任意静态服务器预览 `app/src/main/assets/www/`：

```powershell
cd app/src/main/assets/www
python -m http.server 8000
```

构建 APK 需要 JDK 17 + Android SDK；也可以在本地用 Gradle 构建：

```powershell
gradle assembleDebug
```

## 版本管理

- 版本号**唯一来源**是 `app/build.gradle.kts` 顶部的两个常量：

  ```kotlin
  val appVersionCode = 1
  val appVersionName = "0.0.1"
  ```

- **只有明确要求发版时才修改版本号**，平时开发保持当前版本不变。
- Git 标签格式为 `vX.Y.Z`，且必须与 `appVersionName` 完全一致，否则发布工作流会直接失败（防止发错版本）。
- 每次发版时同步更新 `CHANGELOG.md`。

### 发布一个新版本

```powershell
# 1. 修改 app/build.gradle.kts：appVersionCode +1，appVersionName 改为新版本
# 2. 更新 CHANGELOG.md
git add -A
git commit -m "chore: release v0.0.2"
git push origin main

# 3. 打标签并推送，触发发布工作流
git tag v0.0.2
git push origin v0.0.2
```

标签推送后，`Release` 工作流会构建 APK，并自动创建 GitHub Release 挂上 `LifeLog-v0.0.2.apk`。

### 发布签名

**发布包必须用固定密钥签名**。否则每次 CI 都会新生成一个随机 debug 密钥，导致新旧版本签名不一致，
用户覆盖安装时会报 `conflicting signature` / 无法安装。

因此 `app/build.gradle.kts` 在缺少密钥时会**直接让 release 任务失败**，绝不会产出「能装但签不了名」的包。

密钥库放在本地 `.signing/`（已被 gitignore），同目录有密码，**务必备份**。仓库 Secrets 已配置：

| Secret | 说明 |
| --- | --- |
| `KEYSTORE_BASE64` | `lifelog-release.p12` 的 base64 |
| `KEYSTORE_PASSWORD` | 密钥库密码 |
| `KEY_ALIAS` | `lifelog` |
| `KEY_PASSWORD` | 密钥密码 |

详见 `.signing/README.md`。

> ⚠️ 换密钥 = 换签名，用户必须先卸载再装新版（数据全丢），所以**不要轻易更换**。

## 开发进度

- [x] 应用骨架 + 黑白主题 + 启动图标
- [x] 底部导航（时间 / 行为 / 跟踪 / 设置）+ 页面顶部居中标题
- [x] 中英双语基础，默认英文
- [x] 设置页：列表布局 + 主题（日间 / 夜间 / 跟随系统）
- [x] 页面 / 列表切换动画
- [x] 行为页：列表 + 新增行为表单（名称 + 图标）
- [x] 时间页：三视图（全部 / 时段 / 时点）+ 列表 + 新增记录表单
- [x] 卡片长按多选删除（时间页）
- [x] 全屏布局 + 键盘避让 + 自绘下拉控件
- [x] 行为详情页（重命名 / 输名删除 / 记录视图）
- [x] 时间记录以 CSV 落盘到 LifeLog 目录 + CSV 导入
- [x] 设置页分区
- [x] 行为详情页的统计视图（直方图 + 统计信息）
- [x] 设置项统一为「左名称 / 右值」，设置列表卡片化
- [x] 时间记录点击修改
- [x] 数据导出（系统「另存为」）
- [x] 应用内检测更新 + 下载 + 安装
- [x] 时间记录点击修改
- [x] 数据导出（系统「另存为」）
- [x] 跟踪页（跟踪项 + 时点式记录 + 统计）
- [x] 数据存储位置可换文件夹
- [ ] 卡片编辑
- [ ] 统计页
- [ ] 设置页：语言切换等其它设置项
