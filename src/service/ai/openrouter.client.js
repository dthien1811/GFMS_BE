import OpenAI from "openai";

let cachedClient = null;

export const hasOpenRouterConfig = () => Boolean(process.env.OPENROUTER_API_KEY);

export const getOpenRouterClient = () => {
  if (!hasOpenRouterConfig()) return null;
  if (cachedClient) return cachedClient;

  cachedClient = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_APP_NAME || "GFMS AI Assistant",
    },
  });

  return cachedClient;
};

export default getOpenRouterClient;
