# LifeLog

记录生活行为的 Android 应用，采用「网页套壳」（原生 WebView 容器 + 内置网页前端）的方式实现。

| 项目 | 值 |
| --- | --- |
| 当前版本 | **v0.0.4** |
| 包名 | `com.eliaszwc.lifelog` |
| 最低支持 | Android 8.0（API 26） |
| 目标版本 | Android 15（API 35） |
| 仓库 | https://github.com/EliasZWC/LifeLog |

## 设计约定

- **图标**：全部使用谷歌官方 [Material Icons](https://fonts.google.com/icons)，不引入第三方图标集。
- **主题色**：黑白，但使用不同质感的灰阶表达层次，**不使用纯黑 `#000` / 纯白 `#fff`**。
  - 白天主题：以白为主（背景 `#F4F4F2`，卡片 `#FFFFFF`，文字 `#1B1B1B`）
  - 夜间主题：以黑为主（背景 `#121212`，卡片 `#1C1C1C`，文字 `#ECECEA`）
  - 主题色定义集中在 `app/src/main/assets/www/styles.css` 的 `:root` 与 `@media (prefers-color-scheme: dark)` 中，加壳侧的系统栏颜色在 `res/values/colors.xml` 与 `res/values-night/colors.xml`。
- **语言**：默认英文（`en`）。网页端 i18n 在 `app/src/main/assets/www/i18n.js`，原生端以 `res/values/strings.xml`
  作为英文默认资源；中文（`zh`）词条已备好，等「设置」页做好后接上切换入口。
- **主题设置**：设置页可在「日间 / 夜间 / 跟随系统」间切换。网页端通过 `<html data-theme>` 覆盖系统配色，
  原生端同步窗口背景与状态栏图标颜色，保证系统与应用内设置不一致时不露错色。

## 网页与原生通信

原生通过 `addJavascriptInterface` 向网页暴露 `LifeLogNative` 对象（见 `MainActivity`）。目前只有一个方法：

| 方法 | 说明 |
| --- | --- |
| `setThemeMode(mode)` | 网页切换主题后通知原生，`mode` 为 `light` / `dark` / `system` |

原生会把该值落到 `SharedPreferences`，保证冷启动时先上对背景色，不用等网页接管。
网页侧的偏好则存在 `localStorage`，两者由这一桥接保持同步。

## 数据模型

数据和偏好目前都存在 WebView 的 `localStorage` 里（键名见 `store.js`）：

```js
Behavior = { id, name, icon }                                  // icon 为 icons.js 里的图标名
Record   = { id, behaviorId, type, start, end }                // type: 'period' | 'moment'
                                                               // start/end 为 epoch 毫秒，moment 的 end 为 null
```

- **行为是时间记录的前提**：先在行为页建立行为，才能在时间页新增记录。
- 时段（`period`）同时有开始和结束；时点（`moment`）只有 `start`。
- 后续若要换成原生 SQLite，只需保持 `store.js` 对外的方法签名不变，页面代码不用改。

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
│       ├── java/com/eliaszwc/lifelog/MainActivity.kt   # WebView 容器
│       ├── assets/www/           # 网页前端
│       │   ├── index.html        # 页面结构（含两个表单弹窗）
│       │   ├── styles.css        # 主题变量 + 全部样式
│       │   ├── i18n.js           # 中英文词条
│       │   ├── icons.js          # 谷歌官方行为图标库
│       │   ├── store.js          # 数据层（行为 / 时间记录）
│       │   ├── components.js     # 弹窗 / 下拉菜单 / 进入动画
│       │   ├── theme.js          # 主题偏好
│       │   ├── settings.js       # 设置页绑定
│       │   ├── page-time.js      # 时间页
│       │   ├── page-behavior.js  # 行为页
│       │   └── app.js            # 外壳：导航 / 标题 / 启动
│       └── res/                  # 主题、配色、启动图标
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

### 配置发布签名（推荐）

未配置时 APK 会用 debug 密钥签名，可以安装但不适合正式分发。
在仓库 `Settings → Secrets and variables → Actions` 中添加以下 4 个 Secret 即可启用正式签名：

| Secret | 说明 |
| --- | --- |
| `KEYSTORE_BASE64` | keystore 文件的 base64 内容 |
| `KEYSTORE_PASSWORD` | keystore 密码 |
| `KEY_ALIAS` | 密钥别名 |
| `KEY_PASSWORD` | 密钥密码 |

生成 base64（PowerShell）：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.jks")) | Set-Clipboard
```

## 开发进度

- [x] 应用骨架 + 黑白主题 + 启动图标
- [x] 底部导航（时间 / 行为 / 设置）+ 页面顶部居中标题
- [x] 中英双语基础，默认英文
- [x] 设置页：列表布局 + 主题（日间 / 夜间 / 跟随系统）
- [x] 页面 / 列表切换动画
- [x] 行为页：列表 + 新增行为表单（名称 + 图标）
- [x] 时间页：三视图（全部 / 时段 / 时点）+ 列表 + 新增记录表单
- [ ] 卡片编辑与删除
- [ ] 统计页
- [ ] 设置页：其余设置项（语言切换等）
