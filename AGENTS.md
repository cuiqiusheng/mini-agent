# mini-agent — AI 编程学习项目

> 这是一个从零手写 AI Agent 的学习项目。如果你是新 session 的 AI，请先读完本文档了解全貌。

---

## 项目目标

学习 AI 编程核心概念，通过**亲手实现**来理解：
- Agent Loop（Agent 核心循环）
- Tool Calling / Function Calling
- Context Management（上下文管理）
- MCP Server（后续阶段）
- Harness Engineering / Eval（后续阶段）

## 学习者背景

- 10 年前端开发经验（TypeScript、Node.js）
- 刚学 Python
- 目标是转 AI 工程方向

## 当前阶段：阶段一 — 核心原语

正在手写一个最小 Agent，用 TypeScript + OpenAI SDK。

### 已完成的

- [x] 项目初始化（`/Users/cuiqiusheng/github/mini-agent`）
- [x] 安装依赖：`openai`、`dotenv`、`typescript`、`tsx`
- [x] 实现最小 Agent Loop（`src/index.ts`）
  - 多轮对话
  - Tool Calling 机制（3 个工具：get_weather、get_time、calculate）
  - 完整的 tool call → 执行 → 结果回传 → 再调 LLM 循环
- [x] 非交互测试脚本（`src/test-loop.ts`）
- [x] 跑通 Agent Loop 测试，验证整个流程
  - 一次性调用 3 个工具，2 轮循环完成回答
  - messages 数组最终长度：6 条（system → user → assistant+tool_calls×3 → tool_result×3）

### 当前在做

验证 Agent Loop 实际运行效果

### 下一步（按顺序）

1. 交互式运行 `npm run dev`，在终端里跟 Agent 多轮对话
2. 观察 messages 数组的增长，理解 Context 如何膨胀
3. 阶段二：给 Agent 加记忆系统（SQLite 持久化 messages）
4. 阶段三：实现 MCP Client，连接外部 MCP Server
5. 阶段四：搭建 Eval Harness，评测 Agent 质量

## 项目结构

```
mini-agent/
├── .env              # API Key 配置（不上传 git）
├── .env.example      # 配置模板
├── package.json      # type: module, npm run dev
├── tsconfig.json
└── src/
    ├── index.ts      # 主程序：交互式 Agent CLI
    └── test-loop.ts  # 测试脚本：验证 Agent Loop
```

## 核心概念速查

### Agent Loop（心脏）

```
用户输入 → messages 数组 → 调 LLM
                            ├─ 返回 text？      → 输出给用户（结束）
                            └─ 返回 tool_calls？ → 执行工具
                                                    → 结果塞回 messages
                                                    → 回到顶部，再调 LLM
```

### messages 数组 = Context

```typescript
[
  { role: "system", content: "你是助手" },          // 系统提示词
  { role: "user",   content: "北京天气怎么样？" },  // 用户输入
  { role: "assistant", content: null,                // LLM 说"我要调工具"
    tool_calls: [{ id: "call_1", function: { name: "get_weather", arguments: '{"city":"北京"}' } }] },
  { role: "tool", content: "北京：晴天 25°C",        // 工具执行结果
    tool_call_id: "call_1" },
  { role: "assistant", content: "北京天气是晴天 25°C" },  // LLM 最终回答
]
```

### Tool Calling 三步

1. 定义工具的 JSON Schema（告诉 LLM 有什么能力）
2. LLM 返回 `tool_calls`（LLM 决定调哪个工具、传什么参数）
3. 你的代码执行工具，把结果以 `role: "tool"` 塞回 messages

## 技术栈

| 用途 | 技术 |
|-----|------|
| 运行时 | Node.js v22 |
| 语言 | TypeScript |
| LLM SDK | openai (npm) |
| 配置 | dotenv |
| LLM 模型 | DeepSeek V4 Pro（通过 OpenAI 兼容 API） |

## 运行命令

```bash
# 交互式运行
npm run dev

# 非交互测试
npx tsx src/test-loop.ts
```
