# dsh-video-preview

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）Web UI 的侧边栏加一个**视频预览器**：文件树 / `@` 引用 / 工区变更里点开 `.mp4`、`.webm`、`.mov`，直接就地播放，不再落到"该格式文件暂时无法预览"。

DSH 自带的文档预览只注册了文本、PDF、Excel 和图片——**没有视频**。这个插件补上这一格：`mp4` / `m4v` / `webm` / `ogv` / `ogg` / `mov`。

> English: [README.md](README.md)

## 特性

- **点开即播**：按后缀匹配渲染器，读取完整字节后本地 Blob 播放，不经过第三方服务。
- **静音自动播放**：浏览器不允许有声自动播放，所以先静音起播，控制条里一键开声音。
- **基础信息**：文件名、容器格式、体积。
- **失败可读**：编码/封装不受支持时给出明确提示，而不是空白播放器。
- **零运行时依赖**：只用 React（宿主提供）和标准浏览器 API；**没有构建步骤**，浏览器半是手写的 `__ModuleLoader__` 模块。
- **不碰宿主代码**：只通过公开服务 `documentPreviews` / `slots` / `locale` 注册，和 dsh 升级解耦。

## 安装

```bash
# 从本地目录安装
dsh plugin --profile web add /path/to/dsh-video-preview

# 从 GitHub 安装，锁定 release —— 推荐
dsh plugin --profile web add "github:lvxianchao/dsh-video-preview#v0.1.0"
```

装完重启 `dsh`（Web UI 需要重新载入前端模块）：

```bash
sudo systemctl restart dsh-web   # 按你的部署方式替换
```

包内声明了 `dsh.bundle`，安装时会被自动加进 profile 的 bundle 列表并挂载，**不需要手改 `cordis.patch.yml`**。

想临时试又不想改 profile，可以用覆盖层：

```bash
dsh --profile web --patch ./dev.yml --host 127.0.0.1 --port 3099 --no-open
```

```yaml
# dev.yml
- insert:
    - id: video-preview
      name: '/absolute/path/to/dsh-video-preview/lib/index.js'
```

## 使用

1. 在会话里输入 `@`，选一个视频文件（或从工区变更列表里点开）。
2. 点击文件引用，右侧预览栏出现播放器，静音自动播放。
3. 控制条里拖进度、开声音、全屏。

## 限制（都是宿主侧的现实约束，不是隐藏问题）

| 限制 | 原因 | 怎么办 |
|---|---|---|
| 单个文件有大小上限（默认 32 MB） | 预览走 `workspaceFiles` 的**完整字节**读取，`maxFileBytes` 默认 32 MB | 在 profile 里调大 `workspace-files` 行的 `maxFileBytes` |
| 不支持 `mkv` | Chrome 解不了 Matroska | 转成 mp4/webm |
| 编码受限 | 浏览器只认平台自带解码器；HEVC/AV1 等看平台 | 用 H.264/AAC 的 mp4 最稳 |
| 整文件读入内存 | 没有走 Range 流式请求（v0.1 的取舍） | 大文件建议先压一版预览 |

> 想彻底解决大小与流式问题，下一步可以把宿主半做成一个带鉴权的 Range 路由，让 `<video>` 直接吃 HTTP 流；v0.1 先用完整字节换取"零宿主依赖"。

## 实现

| 半 | 文件 | 职责 |
|---|---|---|
| 宿主 | `lib/index.js` | 空 `apply`，只让插件出现在 Loader / 冻结打包，`dsh tui`、`dsh headless` 下无副作用 |
| 浏览器 | `lib/client.js` | 注册字典 → 注册渲染器元数据 → 注册键控文档体；渲染 `<video>`，管理 Blob URL 生命周期 |

浏览器半没有构建步骤，直接是宿主加载器的模块格式：

```js
window.__ModuleLoader__.load({ id: "@lvxianchao/dsh-video-preview", factory: (require) => { /* … */ } });
```

注册核心（节选）：

```js
ctx.documentPreviews.register({
  id: VIDEO_BODY_ID,
  extensions: ["mp4", "m4v", "webm", "ogv", "ogg", "mov"],
  binaryExtensions: ["mp4", "m4v", "webm", "ogv", "ogg", "mov"],
  priority: "extension",
  title: () => t("title"),
  loading: "bytes-complete",
  wrap: false
});

ctx.slots.register({ name: "sidebar.right.tab.document", key: VIDEO_BODY_ID, locale: "sidebarVideo" }, VideoBody);
```

## 开发

```bash
# 影子实例：用独立 DSH_HOME，不碰线上 profile 与数据
DSH_HOME=/tmp/dsh-test-home dsh --profile web \
  --patch ./test/shadow.patch.yml --host 127.0.0.1 --port 3199 --no-open
```

`test/shadow.patch.yml` 把插件按路径插进影子实例，`test/e2e.mjs` 用无头 Chrome 走一遍"@ 引用 → 点开 → 断言 `<video>` 在播放"。

## License

MIT
