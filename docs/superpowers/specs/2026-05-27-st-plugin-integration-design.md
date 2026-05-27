# ST Plugin Integration — Design Spec

> 将 SillyTavern 的 ST-Prompt-Template 与 JS-Slash-Runner 核心功能集成到樱栖学园

## 概述

本项目是独立 Web 应用。用户是 ST 熟手，希望将两个插件的核心能力搬到项目中，API 与语法与 ST 对齐，降低学习成本。

参考来源：
- **ST-Prompt-Template v1.16** — EJS 模板引擎、变量系统、内容注入标记
- **JS-Slash-Runner v4.8.9 (酒馆助手)** — 脚本管理、斜杠命令、变量管理器、提示词查看器

---

## 新增文件清单

| 文件 | 说明 |
|------|------|
| `scripts/sillytavern/ejs-engine.js` | EJS 模板渲染器，封装 ejs.js |
| `scripts/sillytavern/variable-store.js` | 三级变量仓库 (global/chat/message) |
| `scripts/sillytavern/slash-commands.js` | 斜杠命令注册表 + 7 个内置命令 |
| `scripts/sillytavern/script-manager.js` | 脚本 CRUD、沙箱执行、生命周期 |
| `scripts/script-editor.js` | 脚本管理面板 UI |
| `scripts/variable-manager.js` | 变量管理面板 UI (分作用域查看/编辑) |
| `scripts/prompt-viewer.js` | 提示词查看器 UI |
| `styles/script-editor.css` | 脚本面板样式 |

## 修改文件清单

| 文件 | 改动 |
|------|------|
| `scripts/sillytavern/prompt-assembler.js` | 拼接前对每条 content 调 EJS 渲染 |
| `scripts/sillytavern-store.js` | 发送前/接收后调 EJS；命令拦截；脚本执行钩子 |
| `scripts/chat.js` | send() 中斜杠命令检测 |
| `scripts/main.js` | 注册新面板入口（脚本、变量、提示词） |
| `index.html` | 引入 ejs.js CDN、新 JS/CSS 文件 |

---

## 模块设计

### 1. ejs-engine.js

**职责**：把文本中的 `<% ... %>` 块执行并替换为输出。

**依赖**：ejs.js（浏览器 standalone 版，从 CDN 或本地引入）

**API**：
```js
renderTemplate(template, context) → Promise<string>
renderMessages(messages, context) → Promise<messages>
```

**context 注入**：
```js
{
  getvar, setvar, incvar, decvar,  // 来自 variable-store
  variables: {},    // 当前 chat.variables 快照
  char: '',         // 角色名
  user: '',         // 用户名
  input: '',        // 用户输入原文
  chat: { id, name, messageCount },
  print, console,
}
```

**调用时机**：
1. 生成前 — `assemblePrompt()` 拼接完成后，逐条 message.content 渲染
2. 渲染后 — `sendGameMessage()` 收到 LLM 回复后，渲染回复内容

**错误处理**：模板语法错误捕获 → console.error → 原样返回原始文本，不阻断对话。

**安全**：ejs 在浏览器中无 `require`/`import`，代码运行在受控 context 内。

---

### 2. variable-store.js

**职责**：三级作用域变量管理，API 与 ST-Prompt-Template 对齐。

**作用域**：
- `global` — 跨所有对话，存 IndexedDB 独立表
- `chat` — 当前对话内，存 `chat.variables`（复用现有字段）
- `message` — 内存 Map，不持久化

**API**：
```js
getVar(key, options?)      // 读，key 支持 "a.b.c" 路径
setVar(key, value, opts?)  // 写
incVar(key, delta?, opts?) // 增
decVar(key, delta?, opts?) // 减

// 快捷别名
getLocalVar / getGlobalVar
setLocalVar / setGlobalVar
incLocalVar / incGlobalVar
decLocalVar / decGlobalVar
```

**options**：
```ts
{ scope, defaults, flags: 'nx'|'xx'|'n', min, max }
```

**读取优先级**：message → chat → global

---

### 3. slash-commands.js

**职责**：检测 `/` 前缀输入，执行对应命令。

**API**：
```js
register(name, handler, options)   // 注册命令
execute(input, context) → { handled, output? }
parse(input) → { isCommand, command, args }
```

**内置命令**：

| 命令 | 用法 | 说明 |
|------|------|------|
| `/setvar` | `/setvar k=v` | 设置变量 |
| `/getvar` | `/getvar k` | 读取变量 |
| `/incvar` | `/incvar k=5` | 增加数值 |
| `/decvar` | `/decvar k=3` | 减少数值 |
| `/roll` | `/roll 2d6` | 掷骰 |
| `/var` | `/var` | 列出所有变量 |
| `/help` | `/help [cmd]` | 帮助 |

**与 chat.js 集成**：`send()` 中 `input.startsWith('/')` 时调 `execute()`，若 handled 则不发送 LLM。

---

### 4. script-manager.js

**职责**：外部 JS 脚本的 CRUD、沙箱执行、生命周期管理。

**数据模型**：
```js
{
  id: string,
  name: string,
  content: string,        // JS 源代码
  enabled: boolean,
  folder: string,
  triggers: {
    onMessage: boolean,   // 每条消息后执行
    onSend: boolean,      // 发送前执行
    manual: boolean,      // 按钮触发（默认 true）
  },
  order: number,
  createdAt, updatedAt,
}
```

**持久化**：IndexedDB 新表 `scripts`。

**执行**：在受控 context 中 `new Function(...)` 执行，注入 variable-store API。

---

### 5. script-editor.js (UI)

**职责**：脚本管理面板，复用 rules-editor 的卡片式 UI 模式（展开编辑、启用切换、拖拽排序、增删）。

**功能**：
- 脚本列表（卡片式，展开即编辑器）
- 新建/删除/重命名
- 文件夹分组
- 启用/禁用切换
- 导入/导出 JSON
- 手动执行按钮

---

### 6. variable-manager.js (UI)

**职责**：可视化变量浏览器，分标签页展示各作用域变量。

**对标 JS-Slash-Runner VariableManager**：
- 标签页：全局 / 聊天 / 消息楼层
- 每个标签页显示对应作用域的所有变量
- 支持编辑值、删除变量
- JSON 路径展开（对象/数组）

---

### 7. prompt-viewer.js (UI)

**职责**：实时显示当前即将发送给 LLM 的完整 prompt 内容。

**对标 JS-Slash-Runner PromptViewer**：
- 显示组装后的 messages 数组
- 区分 role（system/user/assistant）用不同颜色
- 显示 token 估算
- 可复制完整 prompt

---

## 数据流

```
用户输入 → slash-commands 拦截?
  ├─ 是 → 执行命令 → 显示结果 → 结束
  └─ 否 ↓
assemblePrompt()
  → lorebook entries 匹配
  → replaceMacros()
  → ejs-engine.renderMessages()  ← 生成前 EJS 处理
  → 返回 messages[]
  → script-manager 触发 onSend 脚本
  → API 发送
  → 收到回复
  → ejs-engine.renderTemplate()  ← 渲染后 EJS 处理
  → script-manager 触发 onMessage 脚本
  → 保存消息 → 渲染 DOM
```

---

## 约束

- 不引入构建工具（webpack/vite），所有 JS 直接通过 `<script>` 标签加载
- ejs.js 下载 standalone 版本放到 `scripts/lib/ejs.min.js`，不走 CDN（离线可用）
- 手写简易 lodash.get/set 路径解析（约 20 行），不引入 lodash
- 新增 UI 模块使用 IIFE（与现有 `chat.js`、`rules-reader.js` 风格一致）
- 新增逻辑模块使用 ES module（与现有 `sillytavern/` 目录风格一致）

## 入口与导航

三个新面板通过侧边栏导航进入，与现有 `rules-editor`、`todo` 等面板同级：

| 面板 | 侧边栏按钮文本 | 快捷键 | data-modal |
|------|---------------|--------|------------|
| 脚本管理 | 脚本工坊 | S | script-editor |
| 变量管理 | 变量仓库 | V | variable-manager |
| 提示词查看 | 提示词 | P | prompt-viewer |

快捷键映射在 `main.js` 的全局 keydown handler 中扩展。

## EJS 安全边界

- `ejs.render()` 的 context 是白名单对象，不暴露 `window`、`document`、`fetch`、`XMLHttpRequest`
- 模板中可用函数：`getvar`、`setvar`、`incvar`、`decvar`、`print`、`console.log`
- `<#escape-ejs>...</#/escape-ejs>` 块内的 `<%` 和 `%>` 自动转义，不执行
- 执行超时默认 3 秒（通过 `Promise.race` + `setTimeout` 实现）
