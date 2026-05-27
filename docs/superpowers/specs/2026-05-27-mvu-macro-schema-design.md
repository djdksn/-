# MVU + 变量宏 + Schema 校验 — 设计文档

> 将 SillyTavern 酒馆助手的 MVU（MagVarUpdate）、`format_message_variable` 宏、Zod Schema 校验三个核心功能集成到樱栖学园

## 概述

当前项目已完成 EJS 模板、三层变量系统、斜杠命令、脚本引擎的基础设施搭建。但这三个紧密耦合的功能缺失导致无法复制用户的 ST 游戏体验：

- **变量宏** — 将当前变量状态注入 prompt，LLM 需要看到状态才能生成合理的更新
- **MVU 引擎** — 从 LLM 回复中提取 `<UpdateVariable>` 块，执行 JSONPatch 操作
- **Schema 校验** — 保护变量结构不被 LLM 脏数据破坏，做类型强制转换

三者关系：宏 → LLM 看到变量 → LLM 输出 UpdateVariable → MVU 执行更新 → Schema 保护写回 → 下一轮宏注入新状态。形成闭环。

---

## 新增文件清单

| 文件 | 说明 |
|------|------|
| `scripts/sillytavern/variable-macro.js` | 宏注册表 + `format_message_variable` 展开引擎 |
| `scripts/sillytavern/mvu-engine.js` | `<UpdateVariable>` XML 解析 + JSONPatch 执行器 |
| `scripts/sillytavern/variable-schema.js` | Schema 注册/校验/类型强制转换 |

## 修改文件清单

| 文件 | 改动 |
|------|------|
| `scripts/sillytavern/prompt-assembler.js` | `replaceMacros()` 调宏引擎展开 `{{macro}}` 语法 |
| `scripts/sillytavern/variable-store.js` | `setVar`/`setVarSync` 写入前调 schema 校验 |
| `scripts/sillytavern-store.js` | 回复后自动调 MVU 引擎处理 `<UpdateVariable>` 块 |
| `index.html` | 引入 3 个新 JS 文件 |

---

## 架构与数据流

### 模块依赖

```
variable-macro.js ──reads──→ variable-store.js
                   ──reads──→ variable-schema.js (section ordering)

mvu-engine.js      ──calls──→ variable-schema.js (coerce)
                   ──calls──→ variable-store.js (setVar/incVar/deleteVar)

variable-schema.js (standalone, no dependencies)
```

### 完整处理流水线

```
┌─ Prompt 组装阶段 ─────────────────────────────────────────┐
│                                                            │
│  assemblePrompt()                                          │
│    → replaceMacros()                                       │
│      → variable-macro.js 识别 {{format_message_variable}}   │
│        → variable-store.js 读取全量 global + chat 变量      │
│        → variable-schema.js 获取结构描述（决定输出顺序）     │
│        → 展开为【章节】式结构化文本                          │
│    → EJS 模板渲染                                          │
│    → 发送给 LLM                                            │
│                                                            │
├─ 回复处理阶段 ─────────────────────────────────────────────┤
│                                                            │
│  sendGameMessage() 收到完整回复                              │
│    → 检查 rawContent 是否包含 <UpdateVariable>              │
│    → mvu-engine.js:                                        │
│        1. 正则提取所有 <UpdateVariable> 块                    │
│        2. 解析 <JSONPatch> → JSON.parse                    │
│        3. 对每个 op:                                        │
│           a. JSON Pointer 路径转点号路径                     │
│           b. variable-schema.coerce(path, value) 类型强制     │
│           c. variable-store.setVarSync() 写入               │
│        4. 从 rawContent 中移除已处理的 <UpdateVariable> 块    │
│    → EJS 后处理渲染（处理剩余内容）                           │
│    → 保存消息到 chat（不含 XML 块）                           │
│    → 触发 onMessage 脚本                                    │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 关键设计决策

- **MVU 在 EJS 后处理之前执行** — 避免 EJS 模板渲染破坏 XML 结构，处理后从消息中移除 `<UpdateVariable>` 块
- **Schema 在 variable-store 层拦截** — 无论谁调用 setVar（脚本/EJS/MVU/命令），都走同一校验通道
- **宏展开对 LLM 透明** — LLM 看不到宏名，只看到展开后的结构化文本
- **三个新文件使用 ES module** — 与 `sillytavern/` 目录现有风格一致

---

## 模块 1：variable-macro.js

### 职责

管理系统提示词中的 `{{macro_name::arg}}` 变量宏，将变量系统当前状态展开为 LLM 可读的结构化文本。

### API

```js
// 注册新宏
registerMacro(name, handler)
// handler: (args, context) => string

// 展开模板中所有宏（匹配 {{...}} 语法）
expandMacros(template, context) => string
```

### 内置宏

| 宏语法 | 说明 |
|--------|------|
| `{{format_message_variable}}` | 全量展开所有作用域变量，按顶层 key 分段 |
| `{{format_message_variable::stat_data}}` | ST 兼容别名，等效于无参数版本 |

### 展开格式

按变量顶层 key 分段，每段一个 `【标题】`。处理规则：

- **基本类型**（字符串/数字/布尔）→ 直接显示 `key: value`
- **嵌套对象** → 缩进递归展开，最多 4 层深度
- **Record（NPC花名册等）** → 每个 entry 用 `■ name` 标记，下挂子字段
- **数组** → 逐项列出，编号前缀
- **null / undefined / 空对象 / 空数组** → 跳过不显示

### 展开示例（对齐用户选择的 A 方案）

```
【系统信息】
  （纯文本原样输出）

【当前状态】
  地点: 樱丘大学校门口 | 日期: 4月7日-周一 | 时间: 上午07:30

【玩家信息】
  姓名: 程励行 | 年龄: 18 | 所属部门: 樱丘大学 | 职务: 大一生
  性交总次数: 5 | 接受性交次数: 3 | 接受口交次数: 1 | 发生性关系总人数: 2

【NPC花名册】
  ■ 藤原雅美
    好感度: 45 | 关系: 同班同学
    [经历] 性行为次数: 2 | 性交次数: 1 | 口交次数: 1
  ■ 佐藤真希
    好感度: 30 | 关系: 学生会前辈
    [经历] 性行为次数: 0

【学校情况】
  （纯文本原样输出）

【校内组织】
  ■ 学生会
    会长: 佐藤真希 | 成员数: 12 | 活动室: 学生会馆201

【校内设施】
  旧馆图书室: 开放 | 保健室: 开放 | 体育馆: 开放

【校外组织】
  （空则不渲染此段）

【课程】
  ■ 性教育基础
    时间: 周一·上午 | 教室: 3A | 讲师: 武田教授
```

### 与 Schema 的关系

Schema 注册时的顶层 key 顺序决定了输出段落的顺序。未注册 schema 时按 `Object.keys()` 的自然顺序。

---

## 模块 2：mvu-engine.js

### 职责

从 LLM 回复中提取 `<UpdateVariable>` 标签块，解析其中的 XML 内容，执行 JSONPatch 操作更新变量。

### API

```js
// 扫描文本，查找所有 <UpdateVariable> 块，解析并应用
processUpdateVariables(rawContent, context) => ProcessResult[]

// ProcessResult = {
//   success: boolean,
//   patchesApplied: number,
//   analysis: string | null,    // <Analysis> 内容
//   errors: string[],
// }

// context = { chat, msgId }
```

### 目标 XML 结构

LLM 回复中的 `<UpdateVariable>` 块格式（由世界书条目 variable update rules 和 variable output format 约束）：

```xml
<UpdateVariable>
  <Analysis>玩家主动发起对话，增加了好感度</Analysis>
  <JSONPatch>
    [
      {"op": "replace", "path": "/NPC花名册/藤原雅美/动态数据/好感度", "value": 48},
      {"op": "delta", "path": "/User信息/性交总次数", "value": 1}
    ]
  </JSONPatch>
</UpdateVariable>
```

### 解析策略

**不使用 DOMParser**（避免 XXE 漏洞和浏览器差异）。用正则手动提取：

1. 正则匹配 `<UpdateVariable>([\s\S]*?)</UpdateVariable>` — 找到所有块
2. 每个块内提取 `<JSONPatch>([\s\S]*?)</JSONPatch>` → `JSON.parse()`
3. 可选提取 `<Analysis>` — 仅用于日志

一行 LLM 回复可包含多个 `<UpdateVariable>` 块，按出现顺序依次处理。

### 支持的 Patch 操作

| op | 说明 | 处理函数 |
|----|------|---------|
| `replace` | 替换路径上的值 | `setVarSync(path, value)` |
| `add` | 在路径上设值（不存在则创建） | `setVarSync(path, value, {flags:'n'})` |
| `remove` | 删除路径 | `deleteVar(path)` |
| `move` | 从 from 移到 path（先 get 再 add + remove） | `setVarSync` + `deleteVar` |
| `copy` | 从 from 复制到 path | `getVarSync` + `setVarSync` |
| `delta` | **非标准扩展**，对数值路径做增量 | `incVarSync(path, value)` |

标准 RFC 6902 操作和 ST 的 `delta` 扩展都支持。

### 路径转换

JSONPatch 使用 RFC 6901 JSON Pointer 格式，需转换为 variable-store 的点号路径：

```
/NPC花名册/藤原雅美/动态数据/好感度
→ NPC花名册.藤原雅美.动态数据.好感度
```

转换规则：去掉首 `/`，所有 `/` 替换为 `.`。

### 安全边界

- **路径穿越防护**：拒绝含 `..` 的路径，拒绝空路径
- **数量限制**：单次处理最多 100 个 op（跨所有块累计），超出的忽略并 warn
- **JSON 解析错误**：不阻断对话，console.warn + 跳过该块，不对变量做任何修改
- **执行顺序**：同一 JSONPatch 数组中的 op 按顺序执行（遵循 RFC 6902 语义）

---

## 模块 3：variable-schema.js

### 职责

为变量树定义类型规则，在写入时做类型强制转换，保护数据结构不被 LLM 脏数据破坏。仿 ST 的 Zod + `registerMvuSchema()` 模式但手写实现，零外部依赖。

### API

```js
// 注册 Schema（可多次调用，merge 到已有规则）
registerSchema(schema)

// 校验并强制转换一个值
coerce(path, value) => { coerced: any, warning?: string }

// 校验整个变量树
validate(tree) => { path: string, warning: string }[]

// 获取已注册的所有规则
getSchema() => Record<string, Rule>
```

### Rule 定义

```ts
type Rule = {
  type: 'string' | 'number' | 'boolean' | 'any';
  min?: number;       // number 最小值
  max?: number;       // number 最大值
}
```

所有字段默认 optional。未注册规则的路径等同于 `{ type: 'any' }`（直接通过）。

### Schema 注册格式

```js
registerSchema({
  '当前地点':          { type: 'string' },
  '当前时间.日期':      { type: 'string' },
  '当前时间.时间':      { type: 'string' },
  'User信息.姓名':      { type: 'string' },
  'User信息.年龄':      { type: 'number', min: 0, max: 120 },
  'User信息.性交总次数': { type: 'number', min: 0 },
  'User信息.接受性交次数': { type: 'number', min: 0 },
  'User信息.接受口交次数': { type: 'number', min: 0 },
  'User信息.接受肛交次数': { type: 'number', min: 0 },
  'User信息.接受色情按摩次数': { type: 'number', min: 0 },
  'User信息.发生性关系总人数': { type: 'number', min: 0 },
  // Record 通配符：匹配 NPC花名册 下任意 NPC
  'NPC花名册.*.动态数据.经历.性行为次数': { type: 'number', min: 0 },
  'NPC花名册.*.动态数据.经历.性交次数': { type: 'number', min: 0 },
  'NPC花名册.*.动态数据.经历.口交次数': { type: 'number', min: 0 },
  'NPC花名册.*.动态数据.经历.肛交次数': { type: 'number', min: 0 },
  'NPC花名册.*.动态数据.经历.足交次数': { type: 'number', min: 0 },
})
```

`*` 通配符匹配 Record 中任意单一 key（不递归）。通配符规则优先级低于精确匹配的规则。

### 强制转换逻辑

| Schema type | 输入 `"5"` | 输入 `5` | 输入 `"hello"` | 输入 `null` / `undefined` |
|-------------|-----------|---------|----------------|--------------------------|
| `number` | → `5` | → `5` | → 返回原值 + warn | → 跳过（返回 undefined，不写入） |
| `string` | → `"5"` | → `"5"` (String()) | → `"hello"` | → 跳过 |
| `boolean` | → `true` | → `true` | → `false` | → 跳过 |
| `any` | → `"5"` | → `5` | → `"hello"` | → `null` |

**min/max 约束**：仅在 `type: 'number'` 时生效，转换后 clamp 到范围内。

### 与 variable-store 集成

在 `setVar` 和 `setVarSync` 中，写入前插入一行校验调用：

```js
// variable-store.js 中
setVarSync(key, value, rawOpts, chat, msgId) {
  // Schema check — pass-through if no schema registered
  if (window.__varSchema) {
    const result = window.__varSchema.coerce(key, value);
    if (result.warning) console.warn('[Schema]', result.warning);
    if (result.coerced === undefined) return undefined; // invalid, skip write
    value = result.coerced;
  }
  // ... 原有逻辑不变
}
```

Schema 可选注册——未注册时变量系统照常工作，零性能开销。

### ST Zod Schema 导入

支持从 ST 的 script JSON 中提取 schema 定义并自动转换：

- `z.string()` → `{ type: 'string' }`
- `z.coerce.number()` → `{ type: 'number' }`
- `z.any()` → `{ type: 'any' }`
- `.passthrough()` → 默认行为（未知字段放行），无需额外处理
- `.optional()` → 默认行为（所有字段可选），无需额外处理
- `.prefault(x)` → 忽略（初始值由变量初始化决定，非 schema 职责）

提供 `importStSchema(stScriptJson)` 函数，解析酒馆助手脚本 JSON 中的 Zod 定义。

---

## 约束

- 不引入外部依赖（zod、fast-json-patch 等），全部手写
- ES module 风格，与 `sillytavern/` 目录一致
- `<UpdateVariable>` 解析不依赖浏览器 DOMParser（防 XXE）
- Schema 可选，未注册时变量系统行为不变（向后兼容）
- Schema 校验失败不抛异常，只 console.warn + 跳过写入

## 初始 Schema 注册

应用启动时，从世界书的 "initial variables" 条目（若存在）自动提取变量结构注册 Schema。同时暴露 `registerSchema()` 供脚本调用，用户可在 onMessage 脚本中动态添加规则。
