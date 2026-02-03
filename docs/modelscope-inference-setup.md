# AI 推理：DeepSeek API 跑通

**项目 AI 策略**：当前需要 AI 的地方统一调用 DeepSeek（`/api/ai/complete`）；`ai-language-service` 目录保留，作为将来扩展（自建翻译/润色等服务）用。

目标：**Stratos（或 curl）→ DeepSeek API → 返回文本**。简单、方便，无需自管算力。

---

## 一、为什么用 DeepSeek

- API 直接可用，OpenAI 兼容格式
- 按调用量计费，无需容器/GPU
- 中文表现好，适合翻译、润色等

---

## 二、Step by Step

### Step 1：获取 API Key

1. 打开 <https://platform.deepseek.com/>
2. 登录/注册，在「API Keys」里创建并复制 Key（形如 `sk-...`）
3. 在 Stratos 项目根目录的 **`.env.local`** 里配置（不要提交到 Git）：

```env
DEEPSEEK_API_KEY=sk-你的key
```

### Step 2：用 curl 验收 DeepSeek 直连

```bash
curl -X POST "https://api.deepseek.com/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_DEEPSEEK_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"deepseek-chat\",\"messages\":[{\"role\":\"user\",\"content\":\"请用一句话介绍你自己\"}]}"
```

验收标准：响应里 `choices[0].message.content` 有模型生成的文本即可。

### Step 3：验收 Stratos 整条链路

本地先 `npm run dev`，并确保 `.env.local` 里已设置 `DEEPSEEK_API_KEY`，然后：

```bash
curl -X POST "http://localhost:3000/api/ai/complete" \
  -H "Content-Type: application/json" \
  -d "{\"input\":\"请用一句话介绍你自己\"}"
```

验收标准：响应 JSON 中有 `result` 且为模型返回的文本。  
链路：**Stratos → DeepSeek API → 返回文本**。

---

## 三、环境变量（Stratos）

| 变量 | 必填 | 说明 |
|------|------|------|
| `DEEPSEEK_API_KEY` | 是 | DeepSeek 平台获取的 API Key |
| `AI_INFERENCE_MODEL` | 否 | 默认 `deepseek-chat`，可改为 `deepseek-reasoner` 等 |

未配置 `DEEPSEEK_API_KEY` 时，`/api/ai/complete` 会返回 503。

**Vercel 部署**：在 Vercel 控制台 → 项目 → Settings → Environment Variables 里添加 `DEEPSEEK_API_KEY`（Production / Preview 按需勾选），部署后 AI 推理才会可用。

---

## 四、API 说明

- **接口**：`POST /api/ai/complete`
- **请求体**：`{ "input": "用户输入文本" }`
- **响应**：`{ "result": "模型生成的文本" }`

---

## 五、后续可做的

- 统一 prompt 模板、包一层 Adapter
- 存训练/推理日志，尝试微调
- 需要时再切到魔塔/自建，只需改配置或适配层，不写死模型名即可
