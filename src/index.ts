import "dotenv/config";
import OpenAI from "openai";
import * as readline from "node:readline/promises";

// ─── 1. 初始化 OpenAI 客户端 ───
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // 如果你用的是 DeepSeek，取消下面两行的注释：
  // baseURL: "https://api.deepseek.com/v1",
});

const MODEL = process.env.MODEL || "deepseek-v4-pro";

// ─── 2. 消息数组 —— 这就是 Context（上下文）的载体 ───
// 每一轮对话、每一个工具调用结果，都追加到这个数组里
// 这就是 "Context Management" 的起点
const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
  {
    role: "system",
    content: "你是一个 AI 助手。你有工具可以帮你完成任务。始终用中文回复用户。",
  },
];

// ─── 3. 工具定义（Tools） ───
// 告诉 LLM："你可以调用这些函数"
// 注意：这是"声明给 LLM 看的"，不是实际执行的函数
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function" as const,
    function: {
      name: "get_weather",
      description: "获取指定城市的天气信息",
      parameters: {
        type: "object",
        properties: {
          city: {
            type: "string",
            description: "城市名称，例如：北京、上海、深圳",
          },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_time",
      description: "获取当前时间",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "calculate",
      description: "执行数学计算",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "数学表达式，例如：2 + 3 * 4",
          },
        },
        required: ["expression"],
      },
    },
  },
];

// ─── 4. 工具的实际执行逻辑 ───
// 这是真正干活的地方：工具被调用时，这个函数执行并返回结果
async function executeToolCall(
  toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
): Promise<string> {
  const funcName = toolCall.function.name;
  const args = JSON.parse(toolCall.function.arguments || "{}");

  console.log(`\n  🔧 [调用工具] ${funcName}(${JSON.stringify(args)})`);

  switch (funcName) {
    case "get_weather": {
      // 模拟天气数据（实际项目中接 API）
      const city = args.city as string;
      const weathers = ["晴天 ☀️ 25°C", "多云 ⛅ 22°C", "小雨 🌧️ 18°C"];
      const weather = weathers[Math.floor(Math.random() * weathers.length)];
      return `${city}的天气：${weather}`;
    }

    case "get_time": {
      return `当前时间是 ${new Date().toLocaleString("zh-CN")}`;
    }

    case "calculate": {
      try {
        const result = eval(args.expression as string);
        return `${args.expression} = ${result}`;
      } catch {
        return `计算失败：无法解析表达式 "${args.expression}"`;
      }
    }

    default:
      return `未知工具：${funcName}`;
  }
}

// ═══════════════════════════════════════════════════
//  5. 核心 —— Agent Loop
//  ═══════════════════════════════════════════════════
//  这就是整个 Agent 的心脏。理解了这个循环，
//  你就理解了所有 Agent 框架（LangChain、CrewAI 等）
//  在做的事情。
//
//  流程：
//    用户输入 → messages 数组
//         ↓
//    调用 LLM
//         ↓
//    LLM 返回 text？ → 输出给用户（结束）
//    LLM 返回 tool_calls？ → 执行工具 → 结果塞回 messages → 再调 LLM
//    ↑______________________________________________|
//    这个循环会持续，直到 LLM 不再要求调用工具
// ═══════════════════════════════════════════════════
async function agentLoop() {
  while (true) {
    console.log(`\n⏳ 正在调用 ${MODEL}...`);

    const response = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools, // 告诉 LLM 有哪些工具可用
    });

    const choice = response.choices[0];
    const assistantMessage = choice.message;

    // ── 情况 A：LLM 要求调用工具 ──
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      // 把 assistant 消息（带 tool_calls）加入到 messages
      messages.push({
        role: "assistant",
        content: assistantMessage.content,
        tool_calls: assistantMessage.tool_calls,
      });

      // 逐个执行工具调用
      for (const toolCall of assistantMessage.tool_calls) {
        const result = await executeToolCall(toolCall);

        // 把工具执行结果塞回 messages
        // 关键：role 是 "tool"，不是 "user" 或 "assistant"
        // tool_call_id 必须跟上面的 tool_calls 对应
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });

        console.log(`  ✅ 工具结果: ${result}`);
      }

      // 回到循环顶部，再次调用 LLM，
      // 让 LLM 看到工具结果后决定下一步
      continue;
    }

    // ── 情况 B：LLM 返回纯文本回答 ──
    // 把 assistant 回复加入 messages（保持上下文连续性）
    messages.push(assistantMessage);

    // 返回用户
    if (assistantMessage.content) {
      console.log(`\n🤖 ${assistantMessage.content}`);
    }

    // 本次对话结束，回到外层等待下一条用户输入
    break;
  }
}

// ─── 6. 命令行交互入口 ───
async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "❌ 请设置 OPENAI_API_KEY 环境变量\n" +
        "   cp .env.example .env\n" +
        "   编辑 .env 填入你的 API Key",
    );
    process.exit(1);
  }

  console.log("╔════════════════════════════════════════╗");
  console.log("║  Minimal Agent - AI 编程学习项目      ║");
  console.log("║  TypeScript + OpenAI SDK              ║");
  console.log("╠════════════════════════════════════════╣");
  console.log("║  Features: 最小 Agent Loop            ║");
  console.log("║   - 多轮对话                          ║");
  console.log("║   - Tool Calling（工具调用）           ║");
  console.log("║   - Context Management（上下文管理）    ║");
  console.log("║                                       ║");
  console.log("║  可用工具：get_weather, get_time,      ║");
  console.log("║            calculate                  ║");
  console.log("╚════════════════════════════════════════╝");
  console.log(`\n📋 模型: ${MODEL}\n`);
  console.log("试试这些：");
  console.log('  - "北京天气怎么样？"');
  console.log('  - "现在几点了？"');
  console.log('  - "帮我算一下 128 * 37 + 42"');
  console.log('  - "北京和上海哪个城市更暖和？"');
  console.log('  输入 "exit" 退出\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  while (true) {
    const input = await rl.question("👤 你: ");

    if (input.toLowerCase() === "exit") {
      console.log("👋 再见！");
      rl.close();
      break;
    }

    if (!input.trim()) continue;

    // 用户消息加入 messages
    messages.push({
      role: "user",
      content: input,
    });

    await agentLoop();

    // 打印当前上下文大小（帮助理解 Context Management）
    const totalChars = messages.reduce(
      (sum, m) => sum + (typeof m.content === "string" ? m.content.length : 0),
      0,
    );
    console.log(
      `📊 当前上下文大小: ${messages.length} 条消息, 约 ${totalChars} 字符`,
    );
  }
}

main().catch(console.error);
