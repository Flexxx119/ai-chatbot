import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Redis from "ioredis";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();

// --- CORS ---
app.use(cors({
  origin: "*",
  methods: ["GET","POST"]
}));

// --- Body Parser ---
app.use(express.json());

// --- Port ---
const port = process.env.PORT || 3000;

// --- Pfad für statische Dateien ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --- Redis ---
const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || "",
  tls: process.env.REDIS_TLS ? {} : undefined,
});

// --- OpenAI ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Chat-History Limit ---
const MAX_HISTORY = 10;

// --- Intent-Erkennung ---
function detectIntent(message) {
  const text = message.toLowerCase();
  if (text.includes("preis") || text.includes("kosten")) return "preise";
  if (text.includes("termin") || text.includes("call")) return "termin";
  return "allgemein";
}

// --- System Prompts ---
const systemPrompts = {
  preise: `Du bist ein professioneller Sales-Chatbot. Antwort kurz & direkt, immer CTA.`,
  termin: `Du bist ein AI-Assistant. Antwort freundlich & leite zu Termin.`,
  allgemein: `Du bist ein professioneller KI-Chatbot. Antwort hilfsbereit & kurz.`
};

// --- Webhook ---
app.post("/webhook", async (req, res) => {
  try {
    const userMessage = req.body.message || "Hallo Welt";

    let chatHistory = await redis.get("chatHistory");
    chatHistory = chatHistory ? JSON.parse(chatHistory) : [];
    chatHistory.push({ role: "user", content: userMessage });

    if (chatHistory.length > MAX_HISTORY)
      chatHistory = chatHistory.slice(chatHistory.length - MAX_HISTORY);

    const intent = detectIntent(userMessage);
    const systemPrompt = systemPrompts[intent];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }, ...chatHistory],
    });

    const botMessage = response.choices[0].message.content;
    chatHistory.push({ role: "assistant", content: botMessage });

    await redis.set("chatHistory", JSON.stringify(chatHistory));

    console.log("Antwort an Nutzer:", botMessage);
    res.json({ reply: botMessage });
  } catch (err) {
    console.error("Fehler im Webhook:", err);
    res.status(500).json({ reply: "Fehler im Chatbot-Server." });
  }
});

// --- Server starten ---
app.listen(port, () => {
  console.log(`✅ Server läuft auf Port ${port}`);
});


