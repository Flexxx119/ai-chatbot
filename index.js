import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import Redis from "ioredis";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
const port = process.env.PORT || 3000;

// --- Pfad-Setup für statische Dateien ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Statische Dateien aus dem 'public'-Ordner ausliefern
app.use(express.static(path.join(__dirname, "public")));

// Root-Route liefert die index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Redis konfigurieren
const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || "",
  tls: process.env.REDIS_TLS ? {} : undefined,
});

// OpenAI konfigurieren
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Maximal 10 letzte Nachrichten speichern
const MAX_HISTORY = 10;

// --- Intent-Erkennung ---
function detectIntent(message) {
  const text = message.toLowerCase();
  if (text.includes("preis") || text.includes("kosten")) return "preise";
  if (text.includes("termin") || text.includes("call")) return "termin";
  return "allgemein";
}

// --- System-Prompts pro Intent ---
const systemPrompts = {
  preise: `
Du bist ein professioneller, empathischer Sales-Chatbot.
Antworten **klar & direkt** auf Fragen zu Preisen oder Paketen.
Leite immer zu einem Call-to-Action (z. B. Termin buchen).
Keine Emojis, kurze, präzise Sätze.
  `,
  termin: `
Du bist ein professioneller AI-Assistant.
Antworten freundlich & präzise, leite Nutzer zur Terminbuchung weiter.
CTA klar & eindeutig.
  `,
  allgemein: `
Du bist ein professioneller, empathischer KI-Chatbot für Influencer & Coaches.
Antworten kurz, freundlich, professionell, hilfsbereit.
Fallback: "Das prüfe ich gern."
Keine Emojis.
  `
};

// --- Webhook-Endpoint ---
app.post("/webhook", async (req, res) => {
  try {
    const userMessage = req.body.message || "Hallo Welt";

    // Chat-History aus Redis laden
    let chatHistory = await redis.get("chatHistory");
    chatHistory = chatHistory ? JSON.parse(chatHistory) : [];

    // Neue User-Nachricht hinzufügen
    chatHistory.push({ role: "user", content: userMessage });

    // History begrenzen
    if (chatHistory.length > MAX_HISTORY) {
      chatHistory = chatHistory.slice(chatHistory.length - MAX_HISTORY);
    }

    // Intent erkennen
    const intent = detectIntent(userMessage);
    const systemPrompt = systemPrompts[intent];

    // Anfrage an OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...chatHistory
      ],
    });

    const botMessage = response.choices[0].message.content;

    // Bot-Nachricht zur History hinzufügen
    chatHistory.push({ role: "assistant", content: botMessage });

    // Aktualisierte History speichern
    await redis.set("chatHistory", JSON.stringify(chatHistory));

    console.log("Antwort an Nutzer:", botMessage);
    res.json({ reply: botMessage });

  } catch (error) {
    console.error("Fehler im Webhook:", error);
    res.status(500).send("Fehler im Chatbot-Server.");
  }
});

// --- Server starten ---
app.listen(port, () => {
  console.log(`✅ Server läuft auf http://localhost:${port}`);
});

