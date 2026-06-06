/**
 * 非交互测试脚本 —— 验证 Agent Loop 核心流程
 * 运行：npx tsx src/test-loop.ts
 */
import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.MODEL || "deepseek-v4-pro";

// 工具定义
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function" as const,
    function: {
      name: "get_weather",
      description: "获取指定城市的天气信息",
      parameters: {
        type: "object",
        properties: { city: { type: "string", description: "城市名称" } },
        required: ["city"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_time",
      description: "获取当前时间",
      parameters: { type: "object", properties: {} },
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
          expression: { type: "string", description: "数学表达式" },
        },
        required: ["expression"],
      },
    },
  },
];

async function executeToolCall(toolCall: any): Promise<string> {
  const args = JSON.parse(toolCall.function.arguments || "{}");
  switch (toolCall.function.name) {
    case "get_weather":
      return `${args.city}的天气：晴天 ☀️ 25°C`;
    case "get_time":
      return `当前时间是 ${new Date().toLocaleString("zh-CN")}`;
    case "calculate":
      try {
        return `${args.expression} = ${eval(args.expression)}`;
      } catch {
        return `计算失败`;
      }
    default:
      return "未知工具";
  }
}

async function runTest() {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: "你是一个助手，可以用工具。请用中文回答。" },
    { role: "user", content: "北京天气怎么样？现在几点了？帮我算一下 128 * 37" },
  ];

  let turn = 0;
  const MAX_TURNS = 5; // 防止无限循环

  // ═══════════════════════════════════════════════════
  //  Agent Loop — 这就是核心
  // ═══════════════════════════════════════════════════
  while (turn < MAX_TURNS) {
    turn++;
    console.log(`\n━━━ 第 ${turn} 轮 ━━━`);

    const response = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools,
    });

    const msg = response.choices[0].message;

    // 情况 A：LLM 要调工具
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      console.log(`  📞 LLM 要求调用 ${msg.tool_calls.length} 个工具:`);
      for (const tc of msg.tool_calls) {
        console.log(`     → ${tc.function.name}(${tc.function.arguments})`);
      }

      // 加入 assistant 消息（带 tool_calls）
      messages.push({
        role: "assistant",
        content: msg.content,
        tool_calls: msg.tool_calls,
      });

      // 执行工具并塞回结果
      for (const tc of msg.tool_calls) {
        const result = await executeToolCall(tc);
        console.log(`     ← 结果: ${result}`);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }
      continue; // 回到循环顶部，再调 LLM
    }

    // 情况 B：纯文本回答
    console.log(`  💬 LLM 最终回答:`);
    console.log(`     ${msg.content}`);
    console.log(`\n✅ Agent Loop 完成！共 ${turn} 轮`);
    console.log(`📊 最终 messages 数组长度: ${messages.length}`);
    console.log(`\n📋 完整 messages 数组结构:`);
    for (const m of messages) {
      const content =
        typeof m.content === "string"
          ? m.content.substring(0, 80) + (m.content.length > 80 ? "..." : "")
          : JSON.stringify(m.content);
      const tc =
        "tool_calls" in m && m.tool_calls
          ? ` [tool_calls: ${m.tool_calls.length}]`
          : "";
      console.log(
        `   [${m.role.padEnd(10)}] ${content}${tc}`
      );
    }
    return;
  }

  console.log("⚠️ 达到最大轮次限制");
}

runTest().catch(console.error);
