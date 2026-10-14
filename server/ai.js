// Optional AI layer (Claude). The app works fully without it: the rule engine provides
// recommendations and the local food library provides rough estimates.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.CADENCE_AI_MODEL || 'claude-opus-5-5';

export function aiStatus() {
  const enabled = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.CADENCE_AI === '1');
  return { enabled, model: enabled ? MODEL : null, lastError: lastError };
}

let client = null;
let lastError = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

// Server-side model fallbacks are a beta. If the account can't use it (400), drop it and carry on.
let useFallbacks = process.env.CADENCE_AI_FALLBACKS !== '0';

async function send(params) {
  if (useFallbacks) {
    try {
      return await getClient().beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    } catch (e) {
      if (!(e instanceof Anthropic.BadRequestError) || isCreditError(e)) throw e;
      console.warn('[ai] request with fallbacks was rejected; retrying without them:', apiMessage(e));
      const res = await getClient().messages.create(params);
      useFallbacks = false;
      return res;
    }
  }
  return getClient().messages.create(params);
}

async function structured({ system, content, schema, effort = 'medium', maxTokens = 16000 }) {
  try {
    const res = await send({
      model: MODEL,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort, format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content }],
    });
    if (res.stop_reason === 'refusal') throw new Error('The AI service declined this request.');
    if (res.stop_reason === 'max_tokens') throw new Error('The AI response was cut short.');
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    lastError = null;
    return JSON.parse(text);
  } catch (e) {
    console.error('[ai] request failed:', e?.status ?? '', apiMessage(e));
    lastError = { message: friendly(e), at: new Date().toISOString() };
    const err = new Error(lastError.message);
    err.status = 503;
    throw err;
  }
}

/** The API's own explanation, e.g. "Your credit balance is too low…". Never contains the key. */
function apiMessage(e) {
  return String(e?.error?.error?.message || e?.error?.message || e?.message || '').slice(0, 200);
}
function isCreditError(e) {
  return /credit balance|billing|purchase credits/i.test(apiMessage(e));
}

function friendly(e) {
  if (isCreditError(e)) return 'The Anthropic account has no credit. Add credit at console.anthropic.com → Billing.';
  if (e instanceof Anthropic.AuthenticationError) return 'AI key is missing or invalid.';
  if (e instanceof Anthropic.PermissionDeniedError) return `The AI key can’t use this model (${MODEL}).`;
  if (e instanceof Anthropic.NotFoundError) return `AI model not found (${MODEL}).`;
  if (e instanceof Anthropic.RateLimitError) return 'AI service is busy (rate limited). Try again shortly.';
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach the AI service.';
  if (e instanceof Anthropic.APIError) return `AI service error (${e.status ?? 'unknown'}): ${apiMessage(e)}`;
  return e.message || 'AI request failed.';
}

const str = { type: 'string' };
const strArr = { type: 'array', items: str };
const num = { type: 'number' };

const NOTE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['note', 'focus'],
  properties: { note: str, focus: str },
};

const NOTE_SYSTEM = `You are Cadence, a personal running, walking and sports-nutrition coach. Once a day you write a short coach's note for one person working through a monthly mileage challenge.

You receive a JSON summary computed by the app: challenge progress, today's calendar, logs (activities, energy, food), the next few days of the app's plan, recent activities and patterns the app has observed.

Write:
- "note": 2–4 sentences, at most 70 words, in plain British English, speaking directly to them ("you"). React to what is actually in the data — today's plan and what they've logged, how they're tracking, their energy, how they've fuelled, what's coming up. Notice something specific; don't summarise everything. Warm and encouraging, honest when they're behind, never guilt-tripping, no exclamation-mark cheerleading.
- "focus": one short, concrete thing to do today or tonight (at most 15 words).

Rules:
- Every number you mention must appear in the data. Don't recalculate or invent distances, dates, foods or events. Distances are in the unit given as distanceUnit (miles or km) — use that unit and never convert.
- Never suggest making up missed miles with big jumps, never suggest calorie restriction, never frame exercise as earning food.
- Treat menstrual-cycle information as context only; don't assume symptoms or diagnose anything.
- If something important is missing (e.g. no energy logged), you may gently suggest logging it, but don't lecture.`;

/** A short daily note and one focus point, written from the app's structured summary. */
export async function coachNote(context) {
  return structured({
    system: NOTE_SYSTEM,
    content: `Today's data:\n\n${JSON.stringify(context)}`,
    schema: NOTE_SCHEMA,
    effort: 'medium',
    maxTokens: 8000,
  });
}

const FOOD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'totals', 'confidence', 'assumptions', 'note'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'portion', 'kcal', 'protein', 'carbs', 'fat'],
        properties: { name: str, portion: str, kcal: num, protein: num, carbs: num, fat: num },
      },
    },
    totals: {
      type: 'object',
      additionalProperties: false,
      required: ['kcal', 'protein', 'carbs', 'fat'],
      properties: { kcal: num, protein: num, carbs: num, fat: num },
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    assumptions: strArr,
    note: str,
  },
};

export async function parseFood({ text, portion, notes, photo }) {
  const content = [];
  if (photo && /^data:image\/(jpeg|png|webp|gif);base64,/.test(photo)) {
    const [head, data] = photo.split(',');
    content.push({ type: 'image', source: { type: 'base64', media_type: head.slice(5, head.indexOf(';')), data } });
  }
  content.push({
    type: 'text',
    text: `Food entry: "${text}"${portion ? `\nPortion: ${portion}` : ''}${notes ? `\nNotes: ${notes}` : ''}\n\nIdentify the likely foods and estimate typical UK portion nutrition. Round kcal to the nearest 10 and macros to whole grams. State portion assumptions. Confidence should be "low" when portions are vague or the photo is unclear.`,
  });
  return structured({
    system:
      'You estimate nutrition for a food journal. Your numbers are estimates, never exact. Do not moralise about food or suggest restriction. Only list foods that are mentioned or clearly visible.',
    content,
    schema: FOOD_SCHEMA,
    effort: 'low',
    maxTokens: 4000,
  });
}

const MEAL_SCHEMA = {
  ...FOOD_SCHEMA,
  required: [...FOOD_SCHEMA.required, 'coach_response'],
  properties: { ...FOOD_SCHEMA.properties, coach_response: str },
};

const MEAL_SYSTEM = `You are Cadence, a sports-nutrition coach for someone training for a monthly running/walking mileage challenge. They have just logged what they ate. Do two things:

1. Estimate its nutrition for a food journal. Your numbers are estimates, never exact: say so through the "confidence" and "assumptions" fields. Only list foods that are mentioned or clearly visible. Round kcal to the nearest 10 and macros to whole grams.

2. Write "coach_response": 2–4 sentences, at most 75 words, plain British English, speaking to them as "you". You get JSON with their intake today and yesterday (with estimated totals), their training today, yesterday and the 3 days before, and what is still planned today and tomorrow. Use it like a good sports dietitian would:
   - Connect food to training. Name the actual sessions (type, distance, when) — e.g. refuelling after yesterday's run, carbohydrate ahead of tonight's planned run, protein for repair after a heavier few days, or lighter needs on a rest day.
   - Look across today AND yesterday plus this meal. Point out the one thing that matters most: e.g. carbohydrate low for the distance done or coming up, protein spread thin or low, little logged before a session, few fruit/veg, or long gaps between meals. Quote an approximate figure from the data when it helps (use "about" or "≈").
   - End with one concrete next step: specific foods, an amount and a time (e.g. "before you leave at 17:30, have a banana and a slice of toast with honey"). Prefer foods from their pantry and respect their nutrition preferences.

Rules for coach_response:
- Be specific to this person's data. Never use generic praise or filler ("great choice", "nice and balanced", "well done", "stay hydrated", "listen to your body") — every sentence must contain a fact from the data or a concrete action.
- If yesterday or today has little or nothing logged, don't pretend to know their intake: say advice is based on what's logged, and still give the training-based advice.
- Never suggest eating less, never mention weight loss, never frame exercise as earning food. Under-fuelling is the bigger risk; say so if intake looks low for the training.
- Don't moralise about food choices. No exclamation marks.
- Only use facts from the context; don't invent activities, plans, times or foods. Distances are in the unit given as distanceUnit (miles or km); never convert.
- Treat menstrual-cycle information as context only.`;

/** Estimate a meal AND give a short coach response, in one call. */
export async function logMeal({ text, portion, notes, photo, context }) {
  const content = [];
  if (photo && /^data:image\/(jpeg|png|webp|gif);base64,/.test(photo)) {
    const [head, data] = photo.split(',');
    content.push({ type: 'image', source: { type: 'base64', media_type: head.slice(5, head.indexOf(';')), data } });
  }
  content.push({
    type: 'text',
    text: `They just logged: "${text}"${portion ? `\nPortion: ${portion}` : ''}${notes ? `\nNotes: ${notes}` : ''}\n\nContext (JSON):\n${JSON.stringify(context)}`,
  });
  return structured({ system: MEAL_SYSTEM, content, schema: MEAL_SCHEMA, effort: 'medium', maxTokens: 8000 });
}
