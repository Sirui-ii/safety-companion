import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AccessToken, WebhookReceiver } from "livekit-server-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(__dirname, ".env.local"));

const port = Number(process.env.PORT || 8791);
const publicDir = path.join(__dirname, "public");
const defaultPhoneNumber = "+14159085000";
const metrics = globalThis.__luluMetrics || {
  luluStarts: 0,
  callClicks: 0,
  livekitCalls: 0,
  contactSaves: 0,
  checkIns: 0,
  pageViews: 0,
  leads: 0,
  activeSessions: new Map(),
  updatedAt: null
};
globalThis.__luluMetrics = metrics;
if (!metrics.activeSessions) metrics.activeSessions = new Map();
if (typeof metrics.leads !== "number") metrics.leads = 0;
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".jpg", "image/jpeg"],
  [".vcf", "text/vcard; charset=utf-8"]
]);

const companionPrompt = `
You are Lulu, a warm emotional companion.
Use gentle listening: ask open questions, notice effort, reflect feelings, and summarize one next step.
Help people notice distress, regulate their body, reconnect with one human being, and choose one tiny safe action.
You are not a therapist, clinician, or emergency service. Never diagnose. Never suggest self-harm.
If the user may be in immediate danger or describes a plan, intent, means, or inability to stay safe, urge emergency services now and 988 in the U.S./Canada.
Keep responses warm, concise, practical, and nonjudgmental. Return only valid JSON.
`.trim();

export async function handleRequest(req, res) {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, {
        status: "ok",
        livekit: Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET),
        gateway: Boolean(process.env.AI_GATEWAY_BASE_URL && process.env.AI_GATEWAY_API_KEY),
        phoneNumber: process.env.LIVEKIT_PHONE_NUMBER || defaultPhoneNumber
      });
    }

    if (req.method === "GET" && url.pathname === "/api/metrics") {
      metrics.pageViews += 1;
      metrics.updatedAt = new Date().toISOString();
      return sendJson(res, 200, publicMetrics());
    }

    if (req.method === "POST" && url.pathname === "/api/metrics/call") {
      metrics.callClicks += 1;
      metrics.luluStarts += 1;
      metrics.updatedAt = new Date().toISOString();
      return sendJson(res, 200, publicMetrics());
    }

    if (req.method === "POST" && url.pathname === "/api/metrics/check-in") {
      metrics.checkIns += 1;
      metrics.luluStarts += 1;
      metrics.updatedAt = new Date().toISOString();
      return sendJson(res, 200, publicMetrics());
    }

    if (req.method === "POST" && url.pathname === "/api/metrics/contact") {
      metrics.contactSaves += 1;
      metrics.updatedAt = new Date().toISOString();
      return sendJson(res, 200, publicMetrics());
    }

    if (req.method === "POST" && url.pathname === "/api/metrics/active") {
      const body = await readJson(req);
      const sessionId = cleanSessionId(body.sessionId || "");
      if (sessionId) {
        metrics.activeSessions.set(sessionId, Date.now());
        pruneActiveSessions();
      }
      metrics.updatedAt = new Date().toISOString();
      return sendJson(res, 200, publicMetrics());
    }

    if (req.method === "POST" && url.pathname === "/api/leads") {
      const body = await readJson(req);
      const lead = normalizeLead(body);
      const validation = validateLead(lead);
      if (validation) return sendJson(res, 400, { error: validation });
      const notion = await saveLeadToNotion(lead);
      metrics.leads += 1;
      metrics.updatedAt = new Date().toISOString();
      return sendJson(res, 200, { ok: true, notion, metrics: publicMetrics() });
    }

    if (req.method === "POST" && url.pathname === "/api/livekit-webhook") {
      const event = await receiveLiveKitWebhook(req);
      if (event.event === "room_started") {
        metrics.livekitCalls += 1;
        metrics.luluStarts = Math.max(metrics.luluStarts, metrics.livekitCalls);
        metrics.updatedAt = new Date().toISOString();
      }
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/api/livekit-config") {
      return sendJson(res, 200, {
        url: process.env.LIVEKIT_URL || "",
        phoneNumber: process.env.LIVEKIT_PHONE_NUMBER || defaultPhoneNumber,
        ready: Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET)
      });
    }

    if (req.method === "GET" && url.pathname === "/lulu.vcf") {
      const vcard = await createLuluVcard();
      res.writeHead(200, {
        "Content-Type": "text/vcard; charset=utf-8",
        "Content-Disposition": 'attachment; filename="Lulu.vcf"',
        "Cache-Control": "public, max-age=3600"
      });
      res.end(vcard);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/livekit-token") {
      const body = await readJson(req);
      const room = cleanRoomName(body.room || "safety-companion");
      const identity = cleanIdentity(body.identity || `guest-${Date.now()}`);
      if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
        return sendJson(res, 503, { error: "LiveKit credentials are not configured." });
      }

      const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
        identity,
        ttl: "1h"
      });
      token.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });
      return sendJson(res, 200, { token: await token.toJwt(), room, identity, url: process.env.LIVEKIT_URL || "" });
    }

    if (req.method === "POST" && url.pathname === "/api/generate") {
      const body = await readJson(req);
      const checkIn = normalizeCheckIn(body);
      const plan = await generateSafetyPlan(checkIn);
      return sendJson(res, 200, plan);
    }

    if (req.method === "POST" && url.pathname === "/api/evaluate") {
      const body = await readJson(req);
      const transcript = String(body.transcript || "").trim().slice(0, 6000);
      const plan = pickPlan(body);
      if (!transcript) return sendJson(res, 400, { error: "Write or say what is happening first." });
      const reflection = await reflectOnDistress(transcript, plan);
      return sendJson(res, 200, reflection);
    }

    if (req.method === "POST" && url.pathname === "/api/ask") {
      const body = await readJson(req);
      const question = String(body.question || "").trim().slice(0, 1600);
      const plan = pickPlan(body);
      const persona = String(body.persona || "support-companion").trim().slice(0, 80);
      if (!question) return sendJson(res, 400, { error: "Message is required." });
      const answer = await answerCompanion(question, plan, persona);
      return sendJson(res, 200, answer);
    }

    if (req.method === "POST" && url.pathname === "/api/context-summary") {
      const body = await readJson(req);
      const checkIn = normalizeCheckIn(body.checkIn || body);
      const plan = pickPlan(body);
      const summary = await summarizeContext(checkIn, plan);
      return sendJson(res, 200, summary);
    }

    if (req.method !== "GET") return sendText(res, 405, "Method not allowed");

    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.normalize(path.join(publicDir, pathname));
    if (!filePath.startsWith(publicDir)) return sendText(res, 403, "Forbidden");

    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes.get(path.extname(filePath)) || "application/octet-stream" });
    res.end(data);
  } catch (error) {
    if (error.code === "ENOENT") return sendText(res, 404, "Not found");
    console.error(error);
    sendJson(res, 500, { error: error.message || "Server error." });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = http.createServer(handleRequest);
  server.listen(port, () => {
    console.log(`Lulu Friend & Companion running at http://localhost:${port}`);
  });
}

function normalizeCheckIn(body) {
  return {
    name: String(body.name || "friend").trim().slice(0, 120),
    feeling: String(body.feeling || "").trim().slice(0, 1400),
    risk: String(body.risk || "low").trim().slice(0, 80),
    helps: String(body.helps || "").trim().slice(0, 700),
    contact: String(body.contact || "").trim().slice(0, 700),
    socialFear: String(body.socialFear || "").trim().slice(0, 700),
    language: String(body.language || "English").trim().slice(0, 80),
    vibe: String(body.vibe || "gentle, grounded, hopeful").trim().slice(0, 140)
  };
}

function pickPlan(body) {
  if (body.plan && typeof body.plan === "object") return body.plan;
  if (body.legacyPlan && typeof body.legacyPlan === "object") return body.legacyPlan;
  return {};
}

function publicMetrics() {
  pruneActiveSessions();
  return {
    luluStarts: metrics.luluStarts,
    callClicks: metrics.callClicks,
    livekitCalls: metrics.livekitCalls,
    contactSaves: metrics.contactSaves,
    checkIns: metrics.checkIns,
    pageViews: metrics.pageViews,
    leads: metrics.leads,
    activeNow: metrics.activeSessions.size,
    updatedAt: metrics.updatedAt
  };
}

function pruneActiveSessions() {
  const cutoff = Date.now() - 90_000;
  for (const [sessionId, lastSeen] of metrics.activeSessions.entries()) {
    if (lastSeen < cutoff) metrics.activeSessions.delete(sessionId);
  }
}

function cleanSessionId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

function normalizeLead(body) {
  return {
    firstName: cleanText(body.firstName, 80),
    lastName: cleanText(body.lastName, 80),
    phone: cleanPhone(body.phone),
    email: cleanText(body.email, 160).toLowerCase(),
    smsOptIn: Boolean(body.smsOptIn),
    emailOptIn: Boolean(body.emailOptIn),
    sessionId: cleanSessionId(body.sessionId || ""),
    createdAt: new Date().toISOString(),
    source: "Lulu landing page"
  };
}

function validateLead(lead) {
  if (!lead.firstName) return "First name is required.";
  if (!lead.lastName) return "Last name is required.";
  if (!/^\+?[0-9 .()/-]{7,24}$/.test(lead.phone)) return "Enter a valid phone number.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return "Enter a valid email address.";
  return "";
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanPhone(value) {
  return cleanText(value, 32).replace(/[^\d+ .()/-]/g, "");
}

async function saveLeadToNotion(lead) {
  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_LEADS_DATABASE_ID;
  if (!apiKey || !databaseId) return { saved: false, reason: "missing_notion_env" };

  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28"
    },
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: {
        Name: { title: [{ text: { content: `${lead.firstName} ${lead.lastName}` } }] },
        "First Name": { rich_text: [{ text: { content: lead.firstName } }] },
        "Last Name": { rich_text: [{ text: { content: lead.lastName } }] },
        Phone: { phone_number: lead.phone },
        Email: { email: lead.email },
        "SMS Opt In": { checkbox: lead.smsOptIn },
        "Email Opt In": { checkbox: lead.emailOptIn },
        Source: { rich_text: [{ text: { content: lead.source } }] },
        "Session ID": { rich_text: [{ text: { content: lead.sessionId } }] },
        "Created At": { date: { start: lead.createdAt } }
      }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Notion lead save failed", data?.message || response.status);
    return { saved: false, reason: "notion_error" };
  }
  return { saved: true, pageId: data.id };
}

async function createLuluVcard() {
  const imagePath = path.join(publicDir, "lulu-contact.jpg");
  const photo = existsSync(imagePath) ? (await readFile(imagePath)).toString("base64") : "";
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "N:Lulu;;;;",
    "FN:Lulu",
    "ORG:Friend & Companion",
    "TITLE:AI Emotional Companion",
    `TEL;TYPE=CELL,VOICE:${process.env.LIVEKIT_PHONE_NUMBER || defaultPhoneNumber}`,
    "URL:https://safety-companion-siruis-projects-98fae10c.vercel.app",
    "NOTE:Lulu is an AI friend and emotional companion. Lulu does not record calls or save what you say."
  ];
  if (photo) {
    lines.push(...foldVcardLine(`PHOTO;ENCODING=b;TYPE=JPEG:${photo}`));
  }
  lines.push("END:VCARD");
  return `${lines.join("\r\n")}\r\n`;
}

async function receiveLiveKitWebhook(req) {
  const body = await readRaw(req);
  if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
    const parsed = JSON.parse(body || "{}");
    return { event: parsed.event || "" };
  }
  const receiver = new WebhookReceiver(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
  return receiver.receive(body, req.headers.authorization || "");
}

async function readRaw(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

function foldVcardLine(line) {
  const chunks = [];
  for (let index = 0; index < line.length; index += 74) {
    chunks.push(`${index === 0 ? "" : " "}${line.slice(index, index + 74)}`);
  }
  return chunks;
}

async function generateSafetyPlan(checkIn) {
  const fallback = buildFallbackPlan(checkIn);
  const ai = await callGateway({
    task: "generate_behavioral_change_safety_plan",
    checkIn,
    requiredJsonShape: {
      oneLiner: "string",
      supportScript: "string",
      groundingScript: "string",
      questions: ["string"],
      steps: [{ title: "string", actions: ["string"], note: "string" }],
      orsLoop: [{ label: "string", target: "string" }]
    }
  });
  return mergePlan(fallback, ai);
}

async function reflectOnDistress(transcript, plan) {
  const heuristic = scoreDistressReflection(transcript, plan);
  const ai = await callGateway({
    task: "gentle_reflection_and_safety_next_step",
    transcript,
    plan,
    requiredJsonShape: {
      score: 0,
      level: "string",
      strongestMoment: "string",
      fixFirst: "string",
      nextVersion: "string",
      drills: ["string"]
    }
  });
  return { ...heuristic, ...(ai && typeof ai === "object" ? ai : {}) };
}

async function answerCompanion(question, plan, persona) {
  const fallback = answerCompanionFallback(question, plan, persona);
  const ai = await callGateway({
    task: "answer_as_warm_safety_companion",
    persona,
    question,
    plan,
    requiredJsonShape: {
      answer: "string",
      confidence: "string",
      followUp: "string"
    }
  });
  return { ...fallback, ...(ai && typeof ai === "object" ? ai : {}) };
}

async function summarizeContext(checkIn, plan) {
  const fallback = summarizeContextFallback(checkIn, plan);
  const ai = await callGateway({
    task: "plain_safety_context_note",
    checkIn,
    plan,
    requiredJsonShape: {
      distressSignal: "string",
      need: "string",
      helpers: "string",
      riskNote: "string",
      nextSafeBehavior: "string",
      memoryNote: "string"
    }
  });
  return { ...fallback, ...(ai && typeof ai === "object" ? ai : {}) };
}

async function callGateway(payload) {
  const baseUrl = process.env.AI_GATEWAY_BASE_URL;
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  const model = process.env.AI_GATEWAY_MODEL || "gpt-4.1-mini";
  if (!baseUrl || !apiKey) return null;

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      messages: [
        { role: "system", content: companionPrompt },
        { role: "user", content: JSON.stringify(payload) }
      ]
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `AI gateway failed with ${response.status}`);
  return parseJsonLoose(data?.choices?.[0]?.message?.content || "");
}

function buildFallbackPlan(checkIn) {
  const highRisk = checkIn.risk === "high" || detectsCrisis(checkIn.feeling);
  const name = checkIn.name || "friend";
  const helps = checkIn.helps || "music, water, walking, a warm shower, or texting someone safe";
  const contact = checkIn.contact || "one trusted person or 988";
  const socialFear = checkIn.socialFear || "reaching out when it feels awkward";
  const languageNote = checkIn.language === "English" ? "" : ` Use ${checkIn.language} if that feels safer or more natural.`;

  return {
    oneLiner: highRisk
      ? `${name}, your first task is staying alive and not being alone with this. Contact emergency support now.`
      : `${name}, we are going to make this smaller: calm the body, name the distress, reach one person, and choose one doable action.`,
    supportScript: highRisk
      ? "This sounds urgent. Please call emergency services now, or call/text 988 in the U.S. and Canada. If you can, move away from anything you could use to hurt yourself and get near another person. You do not have to explain everything perfectly; just say, 'I might not be safe alone right now.'"
      : `First, unclench your jaw and put both feet on the floor. You do not need to solve your whole life in this moment. We are only making the next few minutes softer.${languageNote}\n\nGentle check-in:\nWhat feels loudest right now?\nIt took effort to name this instead of hiding it.\nPart of you is tired, and another part is still looking for help.\nFor the next 10 minutes: breathe slowly, contact ${contact}, and try one small thing that has helped before: ${helps}.`,
    groundingScript:
      "Breathe in for four, hold for two, out for six. Name five things you see, four things you feel, three sounds, two colors, and one thing you can do in the next minute.",
    questions: [
      "What happened right before the distress got louder?",
      "Where do you feel this in your body?",
      "What would make the next 10 minutes 1% safer?",
      `Who is the least scary person to contact: ${contact}?`,
      `What tiny social move could practice ${socialFear} without overwhelming you?`
    ],
    steps: [
      step("Safety First", highRisk
        ? ["Call emergency services now if there is immediate danger.", "Call or text 988 in the U.S. and Canada.", "Move away from means and get near another person."]
        : ["Say out loud: I am having a difficult moment, not a permanent truth.", "Move away from anything risky.", "Put one barrier between you and impulsive action."],
        "The first behavior change is reducing danger and increasing connection."),
      step("Regulate", ["Drink water.", "Breathe out longer than you breathe in.", "Stand, stretch, or step outside for two minutes."], "Body first; insight comes easier after the nervous system softens."),
      step("Name It", ["Write one sentence: I feel ___ because ___.", "Circle the strongest need: rest, contact, repair, meaning, safety.", "Do not argue with the feeling; label it."], "Naming distress lowers the pressure without pretending it is gone."),
      step("Reach", [`Text or call: ${contact}.`, "Use a tiny script: Can you stay with me for 10 minutes?", "If no one is available, use 988 or a local crisis line."], "A social bridge can be very small and still count."),
      step("Activity", [`Try one known helper: ${helps}.`, "Choose something near home: shower, snack, tidy one surface, walk to the corner.", "Set a 10-minute timer, then reassess."], "The goal is not happiness on command. It is movement."),
      step("Social Skill Rep", [`Practice: ${socialFear}.`, "Send one low-pressure message.", "Ask one simple question instead of performing a whole personality."], "Social confidence grows from tiny reps, not perfect conversations."),
      step("Meaning", ["Ask: what value is being hurt here?", "Ask: what kind of person am I trying to become?", "Pick one action that agrees with that value."], "Motivation often returns after action, not before."),
      step("Review", ["What helped 1%?", "What made it worse?", "What should the companion remember for next time?"], "Summaries turn a hard moment into usable information.")
    ],
    orsLoop: [
      { label: "Ask gently", target: "Let the person describe what is happening in their own words." },
      { label: "Notice effort", target: "Name the courage it took to reach for support." },
      { label: "Reflect back", target: "Say the feeling plainly so it feels less lonely." },
      { label: "Choose one step", target: "Keep the next action small, safe, and doable." }
    ]
  };
}

function answerCompanionFallback(question, plan, persona) {
  const q = question.toLowerCase();
  const crisis = detectsCrisis(q);
  let answer;

  if (crisis) {
    answer = "I am really glad you said this out loud. If you might hurt yourself or cannot stay safe, call emergency services now, or call/text 988 in the U.S. and Canada. Move away from anything you could use to hurt yourself and get near another person. You can say: 'I might not be safe alone right now. Please stay with me.'";
  } else if (/10 minute|ten minute|right now|overwhel/i.test(q)) {
    answer = "Let us make the next 10 minutes very small. Put both feet on the floor. Exhale slowly three times. Drink water. Then send one text: 'Can you sit with me for 10 minutes? I do not need advice.' After that, do one near-home action: shower, step outside, or tidy one tiny surface.";
  } else if (/friend|social|awkward|alone|lonely|text|call/i.test(q)) {
    answer = "Who feels safest, even if they are not perfect? Wanting contact while scared is a brave move. It sounds like you want connection, but the awkwardness is loud. Try one low-pressure message: 'Thinking of you. No need to fix anything, but can we talk for a few minutes?'";
  } else if (/why|reason|meaning|motivation|purpose/i.test(q)) {
    answer = "Let us not force a grand reason. Ask smaller: what pain is this feeling trying to protect you from? What value feels blocked: belonging, rest, dignity, freedom, repair, love? Pick one action that protects that value for 10 minutes.";
  } else {
    answer = "What I hear is that something feels too heavy to hold alone. You are not required to solve the whole thing right now. Tell me: what happened before the feeling spiked, where do you feel it in your body, and what would make the next few minutes 1% safer?";
  }

  return {
    answer,
    confidence: crisis ? "crisis support needed" : "supportive response",
    followUp: crisis
      ? "Please contact emergency help now if you are in immediate danger."
      : "Reply with what feels most true: body sensation, thought, person to contact, or tiny action."
  };
}

function scoreDistressReflection(transcript, plan) {
  const text = transcript.toLowerCase();
  const words = transcript.split(/\s+/).filter(Boolean);
  const crisis = detectsCrisis(text);
  const namesFeeling = /feel|sad|angry|scared|alone|lonely|numb|overwhelmed|anxious|depressed|ashamed|tired/i.test(text);
  const namesNeed = /need|want|wish|safe|rest|help|connection|friend|family|talk|sleep/i.test(text);
  const hasNextStep = /text|call|walk|water|shower|breathe|outside|eat|sleep|988|friend|therapist/i.test(text);
  const hasReason = /because|when|after|since|trigger|happened/i.test(text);

  let score = crisis ? 18 : 42;
  if (namesFeeling) score += 16;
  if (namesNeed) score += 14;
  if (hasReason) score += 12;
  if (hasNextStep) score += 16;
  if (words.length >= 20) score += 8;
  score = Math.max(1, Math.min(100, score));

  return {
    score,
    level: crisis ? "Immediate support" : score >= 78 ? "Grounded next step" : score >= 58 ? "Starting to name it" : "Needs safety and support",
    strongestMoment: namesFeeling ? "You named part of what is happening instead of carrying it silently." : "You reached toward support, and that matters.",
    fixFirst: crisis ? "Contact emergency support and do not stay alone." : "Name the feeling, the body sensation, and one safe person or action.",
    nextVersion: crisis
      ? "I might not be safe alone. I need someone with me now. Please call/text me or help me contact emergency support."
      : "I feel ___. It got louder after ___. For the next 10 minutes I will ___ and contact ___.",
    drills: crisis
      ? ["Call/text 988 or emergency services.", "Move away from means.", "Get near another person."]
      : ["One long exhale cycle.", "Send one low-pressure text.", "Do one near-home activity for 10 minutes."],
    stats: { words: words.length, crisisDetected: crisis }
  };
}

function summarizeContextFallback(checkIn, plan) {
  const crisis = checkIn.risk === "high" || detectsCrisis(checkIn.feeling);
  const helpers = checkIn.helps || "music, water, walking, warm shower, texting someone kind";
  const contact = checkIn.contact || "one trusted person or 988";
  const feeling = checkIn.feeling || "distress is present, but the person has not named it yet";

  return {
    distressSignal: crisis
      ? "Possible immediate danger or inability to stay safe. Escalate before coaching."
      : feeling,
    need: inferNeed(feeling),
    helpers,
    riskNote: crisis
      ? "Emergency support first: emergency services, 988 in the U.S./Canada, move away from means, get near another person."
      : "No immediate-danger language selected, but continue checking for plan, intent, means, and ability to stay safe.",
    nextSafeBehavior: crisis
      ? "Call emergency services or 988 now; do not stay alone."
      : `Regulate for two minutes, contact ${contact}, then do one helper: ${helpers.split(",")[0] || helpers}.`,
    memoryNote:
      "Saved note: use this next time so Lulu can remember the pattern, helpers, risk notes, and next step without making the person repeat everything."
  };
}

function inferNeed(value) {
  const text = String(value || "").toLowerCase();
  if (/alone|lonely|isolated|friend|social/.test(text)) return "connection and low-pressure social contact";
  if (/tired|burn|exhaust|sleep/.test(text)) return "rest and reduced demands";
  if (/scared|panic|unsafe|anxious/.test(text)) return "safety, grounding, and reassurance";
  if (/angry|unfair|mad/.test(text)) return "validation, dignity, and a non-destructive outlet";
  if (/grief|lost|miss/.test(text)) return "space to grieve and one gentle anchor";
  return "safety, connection, and one doable next step";
}

function detectsCrisis(value) {
  return /\b(kill myself|suicide|suicidal|end my life|hurt myself|harm myself|can't stay safe|cannot stay safe|have a plan|goodbye|overdose|jump|hang myself)\b/i.test(String(value || ""));
}

function step(title, actions, note) {
  return { title, actions, note };
}

function mergePlan(fallback, ai) {
  if (!ai || typeof ai !== "object") return fallback;
  return {
    ...fallback,
    ...ai,
    steps: Array.isArray(ai.steps) && ai.steps.length ? ai.steps : fallback.steps,
    questions: Array.isArray(ai.questions) && ai.questions.length ? ai.questions : fallback.questions,
    orsLoop: Array.isArray(ai.orsLoop) && ai.orsLoop.length ? ai.orsLoop : fallback.orsLoop
  };
}

function cleanRoomName(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 80) || "safety-companion";
}

function cleanIdentity(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || `guest-${Date.now()}`;
}

function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function loadEnv(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2];
  }
}
