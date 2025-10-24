// testRedis.js
import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redis = new Redis({
  host: process.env.REDIS_URL,
  port: 6379,
  password: process.env.REDIS_TOKEN,
  tls: {},
  maxRetriesPerRequest: 2,
});

redis.on("error", (err) => console.error("Redis Fehler:", err));

async function testSession() {
  try {
    const session = await redis.get("session:test1");
    console.log("Vorhandene Session:", session);

    const newMessage = { user: "test1", message: "Hallo Redis!" };
    let sessionArray = [];

    if (session) sessionArray = JSON.parse(session);
    sessionArray.push(newMessage);

    await redis.set("session:test1", JSON.stringify(sessionArray));
    console.log("Neue Testnachricht gespeichert");

    const updatedSession = await redis.get("session:test1");
    console.log("Aktualisierte Session:", updatedSession);
  } catch (error) {
    console.error("Fehler beim Test:", error);
  } finally {
    redis.disconnect();
  }
}

testSession();
