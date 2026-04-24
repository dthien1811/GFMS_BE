import getOpenRouterClient, { hasOpenRouterConfig } from "./openrouter.client";

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

const safeText = (v) => String(v || "").trim();

const normalize = (v) =>
  safeText(v)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const detectReplyLanguage = (message = "") => {
  const raw = safeText(message);
  const text = normalize(raw);
  const enSignals = ["what", "can you", "find", "book", "gym", "trainer", "package", "schedule", "tomorrow", "english", "speak english"];
  const viSignals = ["toi", "ban", "minh", "dat lich", "goi tap", "phong tap", "ngay mai", "hom nay"];
  const hasViAccent = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(raw);
  const en = enSignals.reduce((n, kw) => n + (text.includes(kw) ? 1 : 0), 0);
  const vi = viSignals.reduce((n, kw) => n + (text.includes(kw) ? 1 : 0), 0) + (hasViAccent ? 2 : 0);
  return en > vi ? "English" : "Vietnamese";
};

const callOpenRouter = async ({ systemPrompt, messages, temperature = 0.4, max_tokens = 500 }) => {
  if (!hasOpenRouterConfig()) return null;

  const client = getOpenRouterClient();
  if (!client) return null;

  try {
    const completion = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature,
      max_tokens,
      messages: [
        { role: "system", content: safeText(systemPrompt) },
        ...messages
          .map((m) => ({ role: m.role, content: safeText(m.content) }))
          .filter((m) => m.content),
      ],
    });

    return safeText(completion?.choices?.[0]?.message?.content);
  } catch (error) {
    console.error("[OpenRouter] request failed:", error?.message || error);
    return null;
  }
};

export const generateReplyWithOpenRouter = async ({ systemPrompt, messages = [], temperature = 0.45, max_tokens = 500 }) => {
  return callOpenRouter({ systemPrompt, messages, temperature, max_tokens });
};

export const rewriteReplyWithOpenRouter = async ({ systemPrompt, userMessage, history = [], rawReply, contextSnapshot }) => {
  const safeHistory = (history || [])
    .filter((item) => item?.role === "user")
    .slice(-4)
    .map((item) => ({ role: item.role, content: safeText(item.content) }));

  const prompt = [
    "Tin nhắn người dùng:",
    safeText(userMessage),
    "",
    "Lịch sử gần đây của người dùng:",
    JSON.stringify(safeHistory, null, 2),
    "",
    "Ngữ cảnh hệ thống:",
    JSON.stringify(contextSnapshot || {}, null, 2),
    "",
    "Câu trả lời nghiệp vụ gốc cần viết lại cho tự nhiên hơn:",
    safeText(rawReply),
    "",
    `Ngôn ngữ bắt buộc của câu trả lời: ${detectReplyLanguage(userMessage)}.`,
    "Hãy viết lại đúng ý nghĩa, tự nhiên hơn, không bịa thêm dữ liệu. Không đổi số lượng card/dữ liệu đã nói. Nếu ngôn ngữ bắt buộc là English thì trả lời hoàn toàn bằng tiếng Anh.",
  ].join("\n");

  return callOpenRouter({
    systemPrompt,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.45,
    max_tokens: 500,
  });
};

export const classifyIntentWithOpenRouter = async ({ systemPrompt, message, labels = [] }) => {
  const result = await callOpenRouter({
    systemPrompt,
    messages: [{ role: "user", content: safeText(message) }],
    temperature: 0,
    max_tokens: 20,
  });

  const normalized = safeText(result);
  return labels.includes(normalized) ? normalized : null;
};

export default {
  generateReplyWithOpenRouter,
  rewriteReplyWithOpenRouter,
  classifyIntentWithOpenRouter,
};
