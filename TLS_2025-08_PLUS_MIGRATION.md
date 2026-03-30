# TLS 2025-08 及之后改动迁移文档

## 1. 文档目的

这份文档用于把 `tls <aosp@163.com>` 在 2025-08 及之后提交到当前分支的改动，整理成一份可迁移到新版本的实现说明。

文档目标不是复述所有 diff，而是回答下面 4 个问题：

1. 改了什么功能。
2. 这些功能是怎么实现的。
3. 迁移到新版本时应该改哪些文件、保留哪些行为。
4. 哪些内容只是业务定制或工程噪音，不建议机械照搬。

## 2. 提交范围

本文覆盖的正式提交如下：

| Commit | 日期 | 主题 |
| --- | --- | --- |
| `401e046fe` | 2025-08-05 | 增加前缀支持、工作流自动运行参数、Action Block |
| `49bec3fe1` | 2025-08-08 | 嵌入界面支持参数 |
| `b2a5c7479` | 2025-08-08 | Action Block 支持自动运行 |
| `69e058a85` | 2025-08-14 | 修正前缀跳转问题 |
| `95f57b380` | 2025-08-22 | 附加 logo、chatbot 支持参数、支持接收 postMessage |
| `c1071dc8b` | 2025-08-22 | 修正 `showdetail` |
| `c96f8aecb` | 2025-10-14 | systemVariables 进聊天上下文、copyright override、URL 参数解码增强、UI 清理、构建说明 |
| `e92abbb26` | 2025-12-10 | 升级 Next/React 依赖、忽略 tar 文件 |

不纳入本文主线的内容：

- 大量纯样式 class 清理。
- 删除 `eslint-disable` 的清理性提交内容。
- 与主功能无直接关系的小格式改动。
- 当前工作区里还未提交的 `web/build_and_push.sh` 和 `web/pnpm-lock.yaml` 本地改动。

## 3. 建议迁移顺序

建议按下面顺序往新版本迁：

1. 路由前缀层：先把 `basePath` / `assetPrefix` / 登录跳转的路径生成逻辑迁过去。
2. URL 参数解析兼容层：先让新版本具备“原始参数 + gzip/base64 参数”的兼容能力。
3. 分享页工作流参数化：迁 `autorun` / `showdetail` / `canbatch` / URL 输入预填充。
4. Embedded Chatbot 参数化：迁 `hideparams` / `isnew` / `copyright` / `locale` / `user_id` / `conversation_id`。
5. Embedded Chatbot 的 `postMessage` 协议：迁父页面发消息、iframe 内自动发送、Action Block 向外发事件。
6. Chat With History 对齐：迁 `isnew`、`hideparams` 自动行为和版权覆盖。
7. 最后再决定是否保留业务 branding、构建脚本和依赖升级。

## 4. 功能拆解

### 4.1 路由前缀支持与跳转修正

**涉及提交**

- `401e046fe`
- `69e058a85`

**关键文件**

- `web/utils/route-utils.ts`
- `web/utils/var-basePath.js`
- `web/service/base.ts`
- `web/app/components/swr-initializer.tsx`
- `web/app/signin/normalForm.tsx`
- `web/app/install/installForm.tsx`
- `web/app/(shareLayout)/...` 下若干页面

**功能目标**

- 支持站点部署在非根路径下，例如 `/dnrai`。
- 避免手写字符串路由导致路径缺少前缀或重复带前缀。
- 修正登录跳转时 `redirect_url` 被重复拼接前缀的问题。

**实现方式**

`401e046fe` 新增了统一路径工具 `web/utils/route-utils.ts`，核心是两个方法：

1. `getRoutePath(path, params)`：
   - 负责拼接 `basePath`。
   - 负责清理多余斜杠。
   - 负责统一处理 query 参数。

2. `getSigninPath(redirectUrl, message?, code?)`：
   - 负责生成带前缀的登录页面地址。
   - 用于替换散落在各处的 `.../webapp-signin?...` 拼接逻辑。

`69e058a85` 是对这个实现的补丁。它新增了“去重前缀”的逻辑：

- 如果 `redirect_url` 已经带了 `/dnrai`，先剥掉一次。
- 再由 `getRoutePath()` 统一重新拼回去。

这样可以避免下面这种错误：

```text
/dnrai/webapp-signin?redirect_url=/dnrai/app/xxx
```

在跳转回来后再次变成：

```text
/dnrai/dnrai/app/xxx
```

**迁移到新版本时怎么做**

1. 在新版本保留一个唯一的路由工具文件，不要同时保留旧的 `web/src/utils/route-utils.ts` 和新的 `web/utils/route-utils.ts` 两套实现。
2. 把所有和页面跳转相关的硬编码路径都收口到 `getRoutePath()` / `getSigninPath()`。
3. 登录鉴权失败的跳转必须统一走 `getSigninPath()`，不要再手拼 `redirect_url`。
4. 如果新版本的 `basePath` 配置方式不同，保留行为，不必照搬文件结构。

**需要保留的行为**

- `getRoutePath()` 要能接受裸路径，例如 `signin`、`webapp-signin/check-code`。
- `getRoutePath()` 要能安全处理空 `basePath`。
- `getSigninPath()` 要先清理一次现有前缀，再生成最终地址。

**迁移风险**

- 新版本如果已经有官方 router helper，不要重复做第二层封装；只需要保留“前缀去重”和“统一登录跳转”两个行为。
- 当前仓库的 `route-utils.ts` 里带了若干 `console.error` 调试输出，迁新版本时不建议保留。

### 4.2 分享页工作流参数化：`autorun`、`canbatch`、`showdetail`

**涉及提交**

- `401e046fe`
- `95f57b380`
- `c1071dc8b`

**关键文件**

- `web/app/components/share/text-generation/index.tsx`
- `web/app/components/share/text-generation/run-once/index.tsx`
- `web/app/components/share/text-generation/result/index.tsx`
- `web/app/components/app/text-generate/item/index.tsx`
- `web/app/components/app/text-generate/item/result-tab.tsx`
- `web/app/components/base/chat/chat/answer/workflow-process.tsx`

**功能目标**

- 让 workflow 分享页可以通过 URL 参数预填输入并自动运行。
- 可以通过 URL 禁用批量 tab。
- 可以控制是否显示 workflow detail 标签页。
- 自动运行完成后，自动折叠 workflow 过程面板，减轻嵌入场景的视觉噪音。

**URL 参数约定**

```text
mode=create|batch
canbatch=0|1
autorun=0|1
showdetail=0|1
<prompt_variable_key>=<value>
```

**最终语义**

- `canbatch=0`：隐藏 batch tab。
- `autorun=1`：在 URL 参数已填充输入的前提下自动点击运行。
- `showdetail=0`：隐藏 DETAIL 标签页。
- 没传 `showdetail`：默认显示 DETAIL。
- 对 workflow 来说，即便没有 `autorun=1`，也要支持从 URL 把输入值灌进表单。

`c1071dc8b` 是这里最关键的修正。它把 `showdetail` 的语义从“传 1 才显示”改成了“传 0 才隐藏”。这意味着默认行为恢复为显示详情，更符合原有页面预期。

**实现方式**

`web/app/components/share/text-generation/index.tsx` 做了 4 件事：

1. 从 `useSearchParams()` 读取 `canbatch`、`autorun`、`showdetail`。
2. 在 workflow 模式下，按 `prompt_variables` 的 key 去 URL 里找同名参数并写入 `inputs`。
3. 只有 `autorun=1` 时才自动触发 `handleSend()`。
4. `autorun` 模式下隐藏左侧表单面板，让结果面板全宽展示，同时在顶部保留一个运行按钮。

`web/app/components/share/text-generation/run-once/index.tsx` 的修正同样重要：

- 只在 `inputs` 为空时初始化默认值。
- 这样 URL 参数注入的输入不会被表单初始化逻辑覆盖掉。

`web/app/components/app/text-generate/item/index.tsx` 和 `result-tab.tsx` 则负责真正落实 `showdetail`：

- `showDetail=false` 时不渲染 DETAIL tab。
- 如果当前 tab 恰好在 DETAIL，自动切换回 RESULT。
- `workflowProcessData` 有结果时优先切 RESULT。

`web/app/components/base/chat/chat/answer/workflow-process.tsx` 新增了 `shouldAutoCollapseWorkflow`：

- 当 workflow 成功结束时自动折叠过程面板。
- 这个状态由分享页 `handleCompleted()` 在成功时置为 `true`。

**迁移到新版本时怎么做**

1. 先迁 URL 参数读取。
2. 再迁“workflow 场景下按变量名预填输入”。
3. 再迁 `RunOnce` 的“仅在空输入时初始化默认值”。
4. 最后迁 `showDetail` 和 `shouldAutoCollapseWorkflow` 这两个展示层行为。

**需要保留的行为**

- URL 输入预填充和自动运行要解耦。
- `autorun=1` 只是“自动点运行”，不是“唯一允许预填充输入的开关”。
- `showdetail=0` 时必须彻底隐藏 DETAIL tab，而不只是视觉隐藏。

**建议验证**

- `?autorun=1&showdetail=0&foo=bar` 是否会自动运行并只显示结果。
- `?showdetail=0` 但不带 `autorun` 时，是否只是不显示 DETAIL，而不会自动运行。
- `?canbatch=0` 是否真的移除 batch tab。

### 4.3 Embedded Chatbot 参数化：`systemVariables`、隐藏参数面板、强制新会话、自动发送

**涉及提交**

- `49bec3fe1`
- `95f57b380`
- `c96f8aecb`

**关键文件**

- `web/public/embed.js`
- `web/app/components/base/chat/utils.ts`
- `web/app/components/base/chat/embedded-chatbot/hooks.tsx`
- `web/app/components/base/chat/embedded-chatbot/chat-wrapper.tsx`
- `web/app/components/base/chat/embedded-chatbot/context.tsx`
- `web/app/components/base/chat/embedded-chatbot/index.tsx`
- `web/public/test-chatbot.html`

**功能目标**

- 嵌入式 chatbot 支持从宿主页面传入系统变量、用户变量和输入变量。
- 支持通过 `hideparams=1` 隐藏输入参数面板并自动开始会话。
- 支持通过 `isnew=1` 强制新建会话，而不是复用 localStorage 里的历史会话。
- 支持宿主页面通过 `postMessage` 直接触发 iframe 内发送消息。

**宿主页面配置格式**

`web/public/embed.js` 约定了下面这三类变量：

```js
window.difyChatbotConfig = {
  token: 'YOUR_TOKEN',
  inputs: {
    name: 'TLS',
  },
  systemVariables: {
    hideparams: '1',
    isnew: '1',
    locale: 'zh-Hans',
    copyright: 'Your Brand',
  },
  userVariables: {
    name: 'TLS',
    avatar_url: 'https://example.com/avatar.png',
  },
}
```

最终会被转成 query 参数：

- 输入参数：`foo=...`
- system 变量：`sys.hideparams=...`
- user 变量：`user.name=...`

并在进入 iframe 前做 gzip + base64 压缩。

**URL 参数解析兼容层**

这是 `c96f8aecb` 里最需要迁的底层能力，代码在 `web/app/components/base/chat/utils.ts`。

核心改动有两个：

1. `decodeBase64AndDecompress(rawString)` 不再假设所有参数都是 gzip/base64。
   - 先判断是否“像 base64”。
   - 如果不像，直接返回原值。
   - 如果像但解 gzip 失败，再尝试普通 `atob()`。
   - 再不行就返回原值。

2. `getProcessedSystemVariablesFromUrlParams()` 不只解析 `sys.*`。
   - `sys.xxx` 仍然是正式的 system variable 通道。
   - 但它也会把未带 `sys.` 的普通 query 参数合并进 `systemVariables`。

这样做的结果是：

- embed.js 传来的 `sys.hideparams` 可以被识别。
- 直接访问分享链接时写成 `?hideparams=1&isnew=1` 也能被识别。

这个兼容层非常重要，建议优先迁。

**Embedded Chatbot 内部实现**

`web/app/components/base/chat/embedded-chatbot/hooks.tsx` 是主入口，关键点如下：

1. 初始化阶段读取 `getProcessedSystemVariablesFromUrlParams()`。
   - 把 `user_id`、`conversation_id` 拆出来单独管理。
   - 其余字段进入 `systemVariables` 上下文。

2. `hideparams=1` 的行为：
   - 跳过输入必填校验。
   - 自动折叠输入参数区域。
   - 在没有当前会话时，输入准备完成后自动调用 `handleStartChat()`。

3. `isnew=1` 的行为：
   - 在 `embedded-chatbot/index.tsx` 里等待 `appId` 可用后主动调用 `handleNewConversation()`。
   - 目的不是简单清空 UI，而是避免继续复用 localStorage 里的旧 `conversationId`。

4. `hideparams=1 && isnew=1` 的特殊处理：
   - 新会话输入值优先使用 URL 参数，不再被默认表单值覆盖。
   - 发送消息时重新从 URL 读取输入值，而不是使用一次性初始化时的 state。
   - 当前会话创建完成后，把 `newConversationInputs` 提升为 `currentConversationInputs`，保证后续消息继续沿用相同输入。

5. `locale` 行为：
   - 优先看 URL 的 `locale`。
   - 没有时再看 `systemVariables.locale`。
   - 仍没有时回落到 app 默认语言。

**`postMessage` 自动发送协议**

`95f57b380` 在 `embedded-chatbot/hooks.tsx` 新增了一套父页面发消息给 iframe 的协议。

父页面发给 iframe：

```js
iframe.contentWindow.postMessage({
  type: 'DIFY_CHAT_SEND_MESSAGE',
  message: 'hello',
  files: [],
}, '*')
```

iframe 内的处理逻辑：

1. `ChatWrapper` 把 `doSend` 注册进上下文，作为 `setAutoSendCallback()`。
2. `hooks.tsx` 里监听 `window.message`。
3. 如果 callback 还没注册好，把消息先放入 `pendingMessagesRef` 队列。
4. callback 就绪后自动 flush 队列。

这一步是为了避免“宿主页面发消息时 iframe 还没完全初始化”的竞态条件。

**迁移到新版本时怎么做**

1. 优先迁 `chat/utils.ts` 的兼容解码逻辑。
2. 再迁 `systemVariables` 进入 `embedded-chatbot` context 的流程。
3. 再迁 `hideparams`、`isnew`、`locale` 三个行为。
4. 最后迁 `postMessage` 自动发送和排队机制。

**需要保留的行为**

- `hideparams=1` 不只是“UI 收起”，还意味着跳过表单校验和自动起会话。
- `isnew=1` 不只是“UI 看起来像新对话”，还必须绕开旧会话复用。
- `postMessage` 自动发送必须处理 callback 未注册完成的时序问题。

### 4.4 Chat With History 对齐：新对话、隐藏参数、自定义版权

**涉及提交**

- `401e046fe`
- `95f57b380`
- `c96f8aecb`

**关键文件**

- `web/app/components/base/chat/chat-with-history/hooks.tsx`
- `web/app/components/base/chat/chat-with-history/chat-wrapper.tsx`
- `web/app/components/base/chat/chat-with-history/index.tsx`
- `web/app/components/base/chat/chat-with-history/context.tsx`
- `web/app/components/base/chat/chat-with-history/sidebar/index.tsx`

**功能目标**

- 让带历史记录的聊天页也能响应 `hideparams=1` 和 `isnew=1`。
- 让 branding 区域支持 query 参数级别的版权覆盖。

**当前实现状态**

这一块不像 embedded-chatbot 那样彻底参数化，属于“部分对齐”：

1. `chat-with-history/index.tsx`
   - 组件挂载后读取原始 query。
   - 如果 `isnew=1`，主动执行 `handleNewConversation()`。

2. `chat-with-history/chat-wrapper.tsx`
   - 初始 `collapsed` 状态会读取 `hideparams=1`。

3. `chat-with-history/hooks.tsx`
   - 如果 URL 里有 `hideparams=1`，在输入表单准备完成后自动开始会话。
   - 这里仍然使用原始 query，而不是完整复用 embedded-chatbot 那套 state 策略。

4. `chat-with-history/context.tsx` 和 `sidebar/index.tsx`
   - `systemVariables` 被放进 context。
   - 主要用于渲染版权文案覆盖。

**copyright override 语义**

`c96f8aecb` 把这个行为同时接到了：

- `embedded-chatbot/header/index.tsx`
- `embedded-chatbot/index.tsx`
- `chat-with-history/sidebar/index.tsx`

规则是：

- `copyright=0`：整个 `powered by` 区域不显示。
- `copyright=<非空字符串>`：显示自定义文本，而不是 logo。
- 未传：维持原先逻辑，优先 workspace branding，再看 `replace_webapp_logo`，最后回退到默认 `DifyLogo`。

**迁移建议**

- 如果新版本只需要嵌入式聊天，可以把这块视为次优先级。
- 如果新版本同时保留 web app chat，建议至少迁 `isnew`、`hideparams` 和 `copyright` 这三项。
- 不必强行把 Chat With History 改造成和 embedded-chatbot 完全同一套逻辑，只要外部行为一致即可。

### 4.5 Markdown `action` / `data` 代码块扩展

**涉及提交**

- `401e046fe`
- `b2a5c7479`
- `c96f8aecb`

**关键文件**

- `web/app/components/base/markdown-blocks/action-block.tsx`
- `web/app/components/base/markdown-blocks/code-block.tsx`
- `web/app/components/base/markdown-blocks/index.ts`

**功能目标**

- 允许模型输出一种专用的 `action` 代码块，前端渲染成可点击按钮。
- 支持自动执行 action。
- 允许模型输出 `data` 代码块，默认折叠，避免大段结构化数据把界面撑爆。

**`action` block 的格式**

````markdown
```action
{
  "action": "navigate",
  "label": "查看订单",
  "description": "跳转到订单详情",
  "autorun": false,
  "debug": true,
  "variant": "primary",
  "data": {
    "url": "https://example.com/orders/123"
  }
}
```
````

`action-block.tsx` 的处理流程是：

1. 把 `content` 当 JSON 解析。
2. 如果 JSON 里有 `action` 字段，就渲染一个按钮。
3. 点击后做三类分发：
   - 向 `window.parent` / `window.top` 发 `postMessage`，消息类型为 `dify-action-click`。
   - 向当前文档派发 `CustomEvent('actionButtonClick')`。
   - 对内置动作做默认处理，例如 `navigate`、`copy`。

`b2a5c7479` 新增了 `autorun`：

- `actionData.autorun === true` 时，组件挂载后直接执行一次 action。

**`data` block 的格式**

````markdown
```data
{
  "raw": "payload"
}
```
````

`c96f8aecb` 在 `code-block.tsx` 里新增了：

- `data` 语言名。
- 折叠状态 `isDataExpanded`。
- 默认只显示一个简化占位。
- 点击 header 上的切换按钮后展开完整内容。

**迁移建议**

1. 如果新版本仍然有 markdown 渲染扩展点，优先迁 `action`。
2. `data` 属于增强可读性的功能，可后迁。
3. `action` 的消息协议最好保持不变，便于宿主页面继续复用。

**建议保留的协议**

- iframe/页面对外事件：`dify-action-click`
- 页面内事件：`actionButtonClick`

### 4.6 Branding 定制：双 Logo 与版权覆盖

**涉及提交**

- `95f57b380`
- `c96f8aecb`

**关键文件**

- `web/app/components/base/logo/dify-logo.tsx`
- `web/public/logo/logodnr.svg`
- `web/app/components/base/chat/embedded-chatbot/header/index.tsx`
- `web/app/components/base/chat/embedded-chatbot/index.tsx`
- `web/app/components/base/chat/chat-with-history/sidebar/index.tsx`

**改动内容**

1. `dify-logo.tsx` 从单 logo 改成了“Dify + DNR”双 logo 组合。
2. 新增了 `web/public/logo/logodnr.svg`。
3. 同时又通过 `copyright` 参数提供了运行时覆盖能力。

**迁移建议**

- 双 logo 是明显的业务 branding，是否迁过去取决于新版本是否还要保留这个品牌展示。
- 如果新版本只需要保留“运行时版权覆盖”，那就只迁 `copyright` 行为，不迁 `logodnr.svg`。
- 如果新版本继续使用 workspace branding 或 `replace_webapp_logo`，保持优先级顺序即可。

### 4.7 构建脚本与依赖升级

**涉及提交**

- `c96f8aecb`
- `e92abbb26`

**关键文件**

- `web/README.md`
- `web/build_and_push.sh`
- `web/package.json`
- `.gitignore`

**改动内容**

1. `c96f8aecb`
   - 在 `web/README.md` 加了构建命令示例。
   - 新增了 `web/build_and_push.sh`，用于打 `dify-web` 镜像并打 `latest` tag。

2. `e92abbb26`
   - `next` 从 `~15.3.5` 升到 `15.3.6`。
   - `react` / `react-dom` 从 `~19.1.0` 升到 `19.1.2`。
   - `.gitignore` 增加 `*.tar`。

**迁移建议**

- 这是工程层改动，不是业务功能。
- 如果新版本已经是更高版本依赖，不需要为了“对齐 tls 改动”而降回这些具体版本。
- `.gitignore` 里的 `*.tar` 可以直接保留，风险低。

**额外说明**

当前工作区里 `web/build_and_push.sh` 还有未提交的本地改动，增加了：

- `docker save -o dify.tar ...`
- `crane push dify.tar ...`

这部分不属于本文覆盖的正式提交范围，如果要迁，请单独评估。

## 5. 不建议机械照搬的内容

下面这些内容在迁新版本时建议谨慎处理：

- `console.log` / `console.error` 调试输出。
- 纯 className 整理。
- 为了过 lint 而做的局部重排。
- `Footer` 默认隐藏这类和主功能无关的视觉定制。
- `DifyLogo` 双 logo 组合，如果新版本 branding 方案已变，直接跳过。

## 6. 最小可迁移清单

如果你只想把“真正影响业务行为”的部分迁到新版本，最少迁下面这些：

1. `route-utils` 的前缀拼接和登录跳转去重逻辑。
2. `chat/utils.ts` 的 URL 参数兼容解码逻辑。
3. 分享页的 `autorun`、`showdetail`、URL 输入预填充、`RunOnce` 防覆盖逻辑。
4. Embedded Chatbot 的 `systemVariables`、`hideparams`、`isnew`、`postMessage` 自动发送。
5. `copyright` 运行时覆盖。
6. Markdown `action` block。

## 7. 建议的回归验证清单

### 7.1 路由与前缀

- 在有 `basePath` 的部署下，登录、安装、分享页跳转是否都只带一层前缀。
- SSO 失败后跳登录，`redirect_url` 是否不会出现 `/prefix/prefix/...`。

### 7.2 分享页 workflow

- `?foo=bar` 是否会预填变量 `foo`。
- `?autorun=1&foo=bar` 是否自动触发一次运行。
- `?showdetail=0` 是否隐藏 DETAIL tab。
- `?canbatch=0` 是否移除 batch tab。

### 7.3 Embedded Chatbot

- `hideparams=1` 时参数面板是否默认折叠，并自动开始对话。
- `isnew=1` 时是否强制创建新会话，而不是进入旧会话。
- 父页面发 `DIFY_CHAT_SEND_MESSAGE` 是否能自动发送。
- callback 尚未注册完成时，消息是否会排队并在稍后发送。

### 7.4 Branding 与版权

- `copyright=0` 是否隐藏 powered by。
- `copyright=MyBrand` 是否显示文本而不是 logo。
- 未传时是否仍按原产品 branding 逻辑显示。

### 7.5 Markdown 扩展

- `action` block 是否能正常渲染按钮。
- `autorun: true` 的 action 是否会在挂载后自动执行。
- `data` block 是否默认折叠，点击后可展开。

## 8. 结论

这批提交里，真正值得迁到新版本的核心，不是“UI 长什么样”，而是下面 4 条能力链：

1. 前缀安全的路由生成。
2. URL 参数驱动的 workflow 分享页自动化。
3. Embedded Chatbot 的参数协议和 `postMessage` 协议。
4. URL 参数兼容解码与 branding override。

如果只迁这 4 条主链，基本就能把 tls 这批改动的大部分业务价值带到新版本里。
