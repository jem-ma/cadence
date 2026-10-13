// Nutrition: a local food reference for rough estimates, plus a rule-based fuelling coach.
// All numbers are estimates per typical portion — always shown as approximate.
import { timeToMin, minToTime } from './dates.js';

// kcal, protein, carbs, fat (g) per typical portion
const F = (keys, name, portion, kcal, p, c, f, tags = []) => ({ keys, name, portion, kcal, p, c, f, tags });
export const FOOD_LIBRARY = [
  F(['porridge', 'oats', 'oatmeal'], 'Porridge (oats with milk)', '1 bowl', 280, 11, 42, 7, ['carb', 'veg']),
  F(['overnight oats'], 'Overnight oats', '1 jar', 320, 13, 48, 8, ['carb', 'veg', 'portable']),
  F(['granola'], 'Granola', '45 g', 210, 5, 30, 8, ['carb', 'veg']),
  F(['cereal', 'cornflakes', 'weetabix', 'bran flakes'], 'Breakfast cereal with milk', '1 bowl', 220, 8, 38, 4, ['carb', 'veg']),
  F(['toast', 'slice of bread', 'slices of bread', 'bread'], 'Toast / bread', '1 slice', 90, 3, 16, 1, ['carb', 'veg', 'vegan']),
  F(['bagel'], 'Bagel', '1 bagel', 250, 9, 48, 2, ['carb', 'veg', 'vegan', 'portable']),
  F(['crumpet'], 'Crumpet', '1', 95, 3, 19, 0.5, ['carb', 'veg', 'vegan']),
  F(['peanut butter', 'pb'], 'Peanut butter', '1 tbsp', 95, 4, 3, 8, ['fat', 'protein', 'veg', 'vegan']),
  F(['jam', 'honey'], 'Jam or honey', '1 tbsp', 55, 0, 14, 0, ['carb', 'veg']),
  F(['banana'], 'Banana', '1 medium', 105, 1, 27, 0.4, ['carb', 'veg', 'vegan', 'portable', 'prerun']),
  F(['apple'], 'Apple', '1 medium', 80, 0.4, 21, 0.3, ['carb', 'veg', 'vegan', 'portable']),
  F(['orange', 'satsuma', 'clementine'], 'Orange / satsuma', '1', 50, 1, 12, 0, ['carb', 'veg', 'vegan', 'portable']),
  F(['berries', 'blueberries', 'strawberries', 'raspberries'], 'Berries', '1 handful', 40, 0.5, 9, 0.3, ['veg', 'vegan']),
  F(['grapes'], 'Grapes', '1 handful', 60, 0.5, 15, 0, ['veg', 'vegan', 'portable']),
  F(['dried fruit', 'raisins', 'dates'], 'Dried fruit', '30 g', 90, 1, 22, 0, ['carb', 'veg', 'vegan', 'portable', 'prerun']),
  F(['protein yoghurt', 'protein yogurt', 'skyr', 'high protein yoghurt'], 'High-protein yoghurt', '1 pot', 130, 17, 10, 1.5, ['protein', 'veg']),
  F(['greek yoghurt', 'greek yogurt'], 'Greek yoghurt', '150 g', 150, 9, 6, 10, ['protein', 'veg']),
  F(['yoghurt', 'yogurt'], 'Yoghurt', '1 pot', 110, 6, 14, 3, ['veg']),
  F(['eggs', 'egg'], 'Egg', '1 large', 75, 6.5, 0.5, 5, ['protein', 'veg']),
  F(['omelette', 'omelet'], 'Omelette (2 eggs)', '1', 200, 14, 2, 15, ['protein', 'veg']),
  F(['avocado'], 'Avocado', '½ fruit', 120, 1.5, 6, 11, ['fat', 'veg', 'vegan']),
  F(['chicken wrap'], 'Chicken wrap', '1 wrap', 430, 28, 45, 14, ['protein', 'carb', 'portable']),
  F(['wrap', 'tortilla'], 'Tortilla wrap', '1 wrap', 180, 5, 30, 4, ['carb', 'veg', 'vegan']),
  F(['sandwich'], 'Sandwich', '1 sandwich', 400, 18, 45, 15, ['carb', 'protein', 'portable']),
  F(['crisps', 'chips (crisps)'], 'Crisps', '1 bag (25 g)', 130, 1.5, 13, 8, ['veg', 'vegan']),
  F(['chicken'], 'Chicken breast', '1 fillet (~150 g)', 240, 45, 0, 5, ['protein']),
  F(['salmon'], 'Salmon fillet', '1 fillet (~120 g)', 250, 25, 0, 16, ['protein']),
  F(['tuna'], 'Tuna', '1 small tin', 110, 25, 0, 1, ['protein', 'portable']),
  F(['beef mince', 'mince', 'bolognese'], 'Beef mince (cooked)', '125 g', 280, 28, 0, 18, ['protein']),
  F(['tofu'], 'Tofu', '150 g', 180, 20, 3, 10, ['protein', 'veg', 'vegan']),
  F(['beans', 'baked beans'], 'Baked beans', '½ tin', 165, 10, 28, 1, ['carb', 'protein', 'veg', 'vegan']),
  F(['lentils', 'dal', 'dhal'], 'Lentils / dal', '1 bowl', 230, 15, 35, 3, ['carb', 'protein', 'veg', 'vegan']),
  F(['chickpeas', 'hummus', 'houmous'], 'Hummus / chickpeas', '3 tbsp', 120, 4, 9, 8, ['veg', 'vegan']),
  F(['pasta', 'spaghetti', 'penne'], 'Pasta (cooked)', '1 plate (~200 g)', 310, 11, 62, 2, ['carb', 'veg', 'vegan']),
  F(['tomato sauce', 'pasta sauce', 'marinara'], 'Tomato sauce', '1 portion', 70, 2, 10, 2, ['veg', 'vegan']),
  F(['pesto'], 'Pesto', '1 tbsp', 80, 1, 1, 8, ['fat', 'veg']),
  F(['parmesan', 'cheese', 'cheddar'], 'Cheese', '30 g', 115, 7, 0, 9, ['protein', 'fat', 'veg']),
  F(['rice'], 'Rice (cooked)', '1 portion (~180 g)', 230, 5, 50, 0.5, ['carb', 'veg', 'vegan']),
  F(['potato', 'potatoes', 'jacket potato'], 'Potato', '1 medium', 160, 4, 36, 0.2, ['carb', 'veg', 'vegan']),
  F(['sweet potato'], 'Sweet potato', '1 medium', 115, 2, 27, 0, ['carb', 'veg', 'vegan']),
  F(['chips', 'fries'], 'Chips', '1 portion', 350, 4, 45, 17, ['carb', 'veg', 'vegan']),
  F(['noodles', 'ramen'], 'Noodles', '1 portion', 300, 9, 55, 4, ['carb', 'veg']),
  F(['curry'], 'Curry', '1 portion', 450, 25, 25, 25, ['protein']),
  F(['stir fry', 'stir-fry'], 'Stir fry', '1 portion', 400, 25, 40, 14, ['protein', 'carb']),
  F(['pizza'], 'Pizza', '½ medium', 550, 22, 65, 22, ['carb']),
  F(['burger'], 'Burger in a bun', '1', 520, 28, 40, 26, ['protein']),
  F(['soup'], 'Soup', '1 bowl', 180, 6, 22, 6, ['veg']),
  F(['salad'], 'Mixed salad', '1 bowl', 120, 3, 10, 7, ['veg', 'vegan']),
  F(['vegetables', 'veg', 'broccoli', 'peppers', 'spinach'], 'Vegetables', '1 portion', 50, 3, 8, 0.5, ['veg', 'vegan']),
  F(['milk'], 'Milk', '250 ml', 120, 8, 12, 4.5, ['protein', 'veg']),
  F(['chocolate milk'], 'Chocolate milk', '330 ml', 220, 11, 34, 4, ['carb', 'protein', 'veg', 'postrun']),
  F(['protein shake', 'protein powder', 'whey'], 'Protein shake', '1 scoop', 120, 24, 3, 1.5, ['protein', 'veg']),
  F(['nuts', 'almonds', 'cashews', 'peanuts'], 'Nuts', '30 g', 175, 6, 5, 15, ['fat', 'veg', 'vegan', 'portable']),
  F(['cereal bar', 'flapjack', 'granola bar', 'oat bar'], 'Cereal bar / flapjack', '1 bar', 180, 3, 26, 7, ['carb', 'veg', 'portable', 'prerun']),
  F(['protein bar'], 'Protein bar', '1 bar', 200, 20, 18, 7, ['protein', 'veg', 'portable']),
  F(['rice cake', 'rice cakes'], 'Rice cakes', '2 cakes', 70, 1.5, 15, 0.5, ['carb', 'veg', 'vegan', 'portable', 'prerun']),
  F(['chocolate'], 'Chocolate', '1 bar (45 g)', 240, 3, 26, 14, ['veg']),
  F(['biscuit', 'biscuits', 'cookie'], 'Biscuits', '2 biscuits', 140, 2, 20, 6, ['veg']),
  F(['cake', 'muffin'], 'Cake / muffin', '1 slice', 350, 5, 45, 17, ['veg']),
  F(['latte', 'cappuccino', 'flat white'], 'Milky coffee', '1 medium', 130, 7, 11, 6, ['veg']),
  F(['coffee', 'tea'], 'Coffee / tea (black or splash of milk)', '1 cup', 10, 0.5, 1, 0.3, ['veg', 'vegan']),
  F(['juice', 'orange juice'], 'Fruit juice', '200 ml', 90, 1, 20, 0, ['carb', 'veg', 'vegan']),
  F(['wine'], 'Wine', '1 glass (175 ml)', 160, 0, 4, 0, ['veg', 'vegan']),
  F(['beer', 'lager', 'pint'], 'Beer', '1 pint', 210, 2, 18, 0, ['veg', 'vegan']),
  F(['sports drink', 'electrolyte'], 'Sports drink', '500 ml', 120, 0, 30, 0, ['carb', 'veg', 'vegan', 'prerun']),
  F(['gel', 'energy gel'], 'Energy gel', '1 gel', 90, 0, 22, 0, ['carb', 'veg', 'vegan', 'prerun']),
];

const NUMBER_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, half: 0.5, couple: 2 };

/**
 * Rough local estimate from free text. Returns matched items, unmatched fragments and a
 * confidence level. This is only a fallback when AI parsing isn't configured.
 */
export function estimateFromText(text) {
  const raw = (text || '').toLowerCase();
  const segments = raw
    .replace(/[.;]/g, ',')
    .split(/,|\band\b|\bwith\b|\bplus\b|\+|&/)
    .map((s) => s.trim())
    .filter(Boolean);
  const items = [];
  const unmatched = [];
  const sorted = [...FOOD_LIBRARY].sort((a, b) => Math.max(...b.keys.map((k) => k.length)) - Math.max(...a.keys.map((k) => k.length)));
  for (const seg of segments) {
    let rest = seg;
    let hit = false;
    for (const food of sorted) {
      const key = food.keys.find((k) => new RegExp(`\\b${k.replace(/[()]/g, '')}s?\\b`).test(rest));
      if (!key) continue;
      const qtyMatch = rest.match(/(\d+(?:\.\d+)?|\b(?:a|an|one|two|three|four|five|half|couple)\b)\s*(?:x\s*)?(?:of\s+)?(?:slices?|pieces?|scoops?|tbsp|bowls?|pots?|cups?|glass(?:es)?|portions?)?\s*(?:of\s+)?/);
      let qty = 1;
      if (qtyMatch) {
        const q = qtyMatch[1];
        qty = isNaN(Number(q)) ? NUMBER_WORDS[q] ?? 1 : Number(q);
        if (qty > 6) qty = 1; // probably grams, not a count
      }
      if (/\b(large|big)\b/.test(rest)) qty *= 1.3;
      if (/\b(small|light)\b/.test(rest)) qty *= 0.7;
      items.push({
        name: food.name,
        portion: food.portion,
        qty: Math.round(qty * 10) / 10,
        kcal: Math.round(food.kcal * qty),
        protein: Math.round(food.p * qty),
        carbs: Math.round(food.c * qty),
        fat: Math.round(food.f * qty),
      });
      rest = rest.replace(new RegExp(`\\b${key}s?\\b`), ' ');
      hit = true;
      // a compound like "chicken wrap" should not also count "wrap" + "chicken"
      if (food.keys.some((k) => k.includes(' '))) break;
    }
    if (!hit && seg.length > 2) unmatched.push(seg);
  }
  const totals = items.reduce(
    (t, i) => ({ kcal: t.kcal + i.kcal, protein: t.protein + i.protein, carbs: t.carbs + i.carbs, fat: t.fat + i.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const confidence = !items.length ? 'none' : unmatched.length ? 'low' : items.length >= 1 && !/\d/.test(raw) ? 'medium' : 'medium';
  return {
    items,
    unmatched,
    totals,
    confidence,
    source: 'library',
    note: items.length
      ? 'Rough estimate from typical portions. Edit if your portion was different.'
      : "Couldn't recognise these foods — add numbers yourself if you want them tracked.",
  };
}

export function dayNutritionTotals(foods) {
  let known = 0;
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const f of foods) {
    const e = f.estimate?.totals;
    if (!e || f.estimate?.confidence === 'none') continue;
    known++;
    t.kcal += e.kcal || 0;
    t.protein += e.protein || 0;
    t.carbs += e.carbs || 0;
    t.fat += e.fat || 0;
  }
  return { ...t, entries: foods.length, estimatedEntries: known, complete: foods.length > 0 && known === foods.length };
}

// ---------------- Meal & snack ideas ----------------
const IDEA = (name, slot, tags, ingredients, minutes = 5, diet = ['veg']) => ({ name, slot, tags, ingredients, minutes, diet });
export const MEAL_IDEAS = [
  IDEA('Banana and a pot of yoghurt', 'snack', ['prerun', 'portable'], ['banana', 'yoghurt']),
  IDEA('Bagel with peanut butter and honey', 'snack', ['prerun', 'carb'], ['bagel', 'peanut butter', 'honey'], 5, ['veg', 'vegan']),
  IDEA('Toast with jam', 'snack', ['prerun', 'light'], ['bread', 'jam'], 3, ['veg', 'vegan']),
  IDEA('Rice cakes with banana', 'snack', ['prerun', 'light', 'portable'], ['rice cakes', 'banana'], 2, ['veg', 'vegan']),
  IDEA('Flapjack or oat bar and an apple', 'snack', ['portable', 'prerun'], ['oat bar', 'apple'], 0, ['veg']),
  IDEA('Handful of nuts and dried fruit', 'snack', ['portable'], ['nuts', 'dried fruit'], 0, ['veg', 'vegan']),
  IDEA('Protein yoghurt with berries', 'snack', ['postrun', 'protein'], ['protein yoghurt', 'berries'], 2, ['veg']),
  IDEA('Chocolate milk and a banana', 'snack', ['postrun', 'portable'], ['chocolate milk', 'banana'], 0, ['veg']),
  IDEA('Hummus with pitta and carrot sticks', 'snack', ['portable'], ['hummus', 'pitta', 'carrots'], 5, ['veg', 'vegan']),
  IDEA('Porridge with banana and peanut butter', 'breakfast', ['carb', 'prerun'], ['oats', 'milk', 'banana', 'peanut butter'], 8, ['veg']),
  IDEA('Overnight oats with berries and yoghurt', 'breakfast', ['portable', 'prep'], ['oats', 'yoghurt', 'berries', 'milk'], 5, ['veg']),
  IDEA('Eggs on toast', 'breakfast', ['protein'], ['eggs', 'bread'], 10, ['veg']),
  IDEA('Bagel with cream cheese and smoked salmon', 'breakfast', ['protein', 'carb'], ['bagel', 'cream cheese', 'smoked salmon'], 5, []),
  IDEA('Chicken, rice and veg box', 'lunch', ['portable', 'prep', 'protein', 'carb'], ['chicken', 'rice', 'vegetables'], 25, []),
  IDEA('Wholemeal wrap with hummus, falafel and salad', 'lunch', ['portable', 'carb'], ['wraps', 'hummus', 'falafel', 'salad'], 10, ['veg', 'vegan']),
  IDEA('Pasta salad with tuna, sweetcorn and peppers', 'lunch', ['portable', 'prep', 'carb', 'protein'], ['pasta', 'tuna', 'sweetcorn', 'peppers'], 15, []),
  IDEA('Lentil and vegetable soup with a roll', 'lunch', ['prep', 'carb'], ['lentils', 'vegetables', 'stock', 'bread roll'], 30, ['veg', 'vegan']),
  IDEA('Jacket potato with beans and cheese', 'lunch', ['carb', 'protein'], ['potato', 'baked beans', 'cheese'], 10, ['veg']),
  IDEA('Pasta with tomato sauce, chicken and parmesan', 'dinner', ['carb', 'protein', 'postrun'], ['pasta', 'tomato sauce', 'chicken', 'parmesan'], 20, []),
  IDEA('Salmon, new potatoes and green veg', 'dinner', ['protein', 'carb', 'postrun'], ['salmon', 'potatoes', 'green veg'], 25, []),
  IDEA('Chicken stir-fry with noodles', 'dinner', ['protein', 'carb', 'postrun'], ['chicken', 'noodles', 'stir-fry veg', 'soy sauce'], 15, []),
  IDEA('Chickpea and spinach curry with rice', 'dinner', ['carb', 'prep', 'postrun'], ['chickpeas', 'spinach', 'chopped tomatoes', 'curry paste', 'rice'], 25, ['veg', 'vegan']),
  IDEA('Turkey chilli with rice', 'dinner', ['protein', 'carb', 'prep', 'postrun'], ['turkey mince', 'kidney beans', 'chopped tomatoes', 'rice'], 30, []),
  IDEA('Tofu and veg rice bowl', 'dinner', ['protein', 'carb'], ['tofu', 'rice', 'vegetables', 'soy sauce'], 20, ['veg', 'vegan']),
  IDEA('Egg fried rice with peas', 'dinner', ['carb', 'protein', 'quick'], ['rice', 'eggs', 'peas', 'soy sauce'], 12, ['veg']),
];

const singular = (w) => w.toLowerCase().trim().replace(/(es|s)$/, '');
/** True when the pantry holds this ingredient (exact or more specific match, never a looser one). */
export function pantryHas(ing, pantry) {
  const i = singular(ing);
  return pantry.some((p) => {
    const q = singular(p);
    return q === i || ` ${q} `.includes(` ${i} `);
  });
}

function dietOk(idea, prefs = {}) {
  const diet = (prefs.diet || '').toLowerCase();
  if (diet.includes('vegan') && !idea.diet.includes('vegan')) return false;
  if (diet.includes('vegetarian') && !idea.diet.includes('veg')) return false;
  const avoid = [...(prefs.allergies || []), ...(prefs.dislikes || [])].map((s) => s.toLowerCase().trim()).filter(Boolean);
  if (avoid.some((a) => idea.ingredients.some((i) => i.includes(a)) || idea.name.toLowerCase().includes(a))) return false;
  if (prefs.maxCookMin && idea.minutes > prefs.maxCookMin && !idea.tags.includes('prep')) return false;
  return true;
}

export function pickIdeas({ slot, tags = [], prefs = {}, pantry = [], n = 2 }) {
  return MEAL_IDEAS.filter((i) => (!slot || i.slot === slot) && dietOk(i, prefs))
    .map((i) => ({
      ...i,
      score: tags.filter((t) => i.tags.includes(t)).length * 2 + i.ingredients.filter((ing) => pantryHas(ing, pantry)).length,
      haveAll: i.ingredients.every((ing) => pantryHas(ing, pantry)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

/**
 * Rule-based next-meal recommendation.
 * ctx: { nowMin, foodsToday, todayPlan (sessions), doneToday (activities), tomorrow (resolved day), prefs, pantry, energy }
 */
export function nutritionAdvice(ctx) {
  const { nowMin, foodsToday = [], todaySessions = [], doneToday = [], tomorrow, prefs = {}, pantry = [], energy } = ctx;
  const has = (meal) => foodsToday.some((f) => f.meal === meal);
  const lastFood = foodsToday.map((f) => timeToMin(f.time || '00:00')).sort((a, b) => b - a)[0];
  const sinceLast = lastFood != null ? nowMin - lastFood : null;
  const ranMi = doneToday.filter((a) => a.type === 'run').reduce((s, a) => s + Number(a.distanceMi), 0);
  const totalMi = doneToday.reduce((s, a) => s + Number(a.distanceMi), 0);
  const lastRunEnd = doneToday
    .filter((a) => a.type === 'run' && a.startTime)
    .map((a) => timeToMin(a.startTime) + Number(a.durationMin || 0))
    .sort((a, b) => b - a)[0];
  const upcomingRun = todaySessions.find((s) => s.type === 'run' && s.time && timeToMin(s.time) > nowMin && !s.optional);
  const minsToRun = upcomingRun ? timeToMin(upcomingRun.time) - nowMin : null;
  const lunchLight = foodsToday.filter((f) => f.meal === 'lunch').reduce((s, f) => s + (f.estimate?.totals?.kcal || 0), 0);
  const totals = dayNutritionTotals(foodsToday);

  const lines = [];
  let headline = '';
  let ideas = [];

  if (ranMi > 0 && (lastRunEnd == null || nowMin - lastRunEnd < 150) && !(lastFood != null && lastRunEnd != null && lastFood > lastRunEnd)) {
    headline = ranMi >= 5 ? 'Refuel after your long run' : 'Recover from your run';
    lines.push(
      ranMi >= 5
        ? `You've run ${ranMi.toFixed(1)} miles today. Prioritise a meal with carbohydrates and protein, and drink regularly through the afternoon. You don't need to add another session to compensate for anything.`
        : `You've run ${ranMi.toFixed(1)} miles. A meal or snack with carbohydrates and some protein in the next hour or two will help you recover.`
    );
    ideas = pickIdeas({ slot: nowMin > 17 * 60 ? 'dinner' : nowMin < 10.5 * 60 ? 'breakfast' : 'lunch', tags: ['postrun', 'protein', 'carb'], prefs, pantry });
    if (nowMin < 17 * 60 && nowMin > 10.5 * 60) ideas = [...pickIdeas({ slot: 'snack', tags: ['postrun'], prefs, pantry, n: 1 }), ...ideas.slice(0, 1)];
  } else if (upcomingRun && minsToRun <= 60 && minsToRun > 0) {
    headline = 'Light fuel before you run';
    lines.push(
      sinceLast != null && sinceLast < 120
        ? `You ate recently and your run is in about ${minsToRun} minutes — you're probably fuelled. Sip some water.`
        : `Your run is in about ${minsToRun} minutes. If you're hungry, keep it small and easy to digest.`
    );
    ideas = pickIdeas({ slot: 'snack', tags: ['prerun', 'light'], prefs, pantry });
  } else if (upcomingRun && minsToRun <= 240) {
    headline = 'Fuel for this evening';
    const lightLunch = has('lunch') && lunchLight > 0 && lunchLight < 450;
    lines.push(
      `You have a ${upcomingRun.distanceMi}-mile run at ${upcomingRun.time}${lightLunch ? ' and lunch was relatively light' : ''}. Have a carb-based snack about 1–2 hours before, then eat a proper meal afterwards.`
    );
    ideas = pickIdeas({ slot: 'snack', tags: ['prerun', 'portable'], prefs, pantry });
  } else if (nowMin < 10.5 * 60 && !has('breakfast')) {
    headline = 'Breakfast';
    lines.push(
      todaySessions.some((s) => s.type === 'run' && !s.optional)
        ? 'A carbohydrate-based breakfast sets you up for the run later today.'
        : 'Start with something that keeps you going until lunch.'
    );
    ideas = pickIdeas({ slot: 'breakfast', tags: ['carb'], prefs, pantry });
  } else if (nowMin >= 12.5 * 60 && nowMin < 15 * 60 && !has('lunch')) {
    headline = 'Lunch';
    lines.push('No lunch logged yet. Aim for carbohydrate, protein and some veg.');
    ideas = pickIdeas({ slot: 'lunch', tags: ['carb', 'protein'], prefs, pantry });
  } else if (nowMin >= 15 * 60 && nowMin < 17.5 * 60) {
    headline = 'Afternoon snack';
    lines.push('A snack now keeps energy steady through the end of the day and your journey home.');
    ideas = pickIdeas({ slot: 'snack', tags: ['portable'], prefs, pantry });
  } else if (nowMin >= 18.5 * 60 && !has('dinner')) {
    headline = 'Dinner';
    lines.push(
      totalMi >= 3
        ? `You've covered ${totalMi.toFixed(1)} miles today. Make dinner a proper meal with carbohydrates and protein.`
        : 'A balanced dinner with carbohydrates, protein and veg.'
    );
    ideas = pickIdeas({ slot: 'dinner', tags: totalMi >= 3 ? ['postrun'] : ['quick'], prefs, pantry });
  } else {
    headline = 'Next meal';
    lines.push('Nothing urgent. Eat regularly — consistent fuelling matters more than precision.');
    const slot = nowMin < 11 * 60 ? 'breakfast' : nowMin < 15 * 60 ? 'lunch' : nowMin < 18 * 60 ? 'snack' : 'dinner';
    ideas = pickIdeas({ slot, tags: [], prefs, pantry });
  }

  if (energy != null && energy <= 4 && foodsToday.length <= 1 && nowMin > 12 * 60) {
    lines.push("Energy is low and you haven't logged much food — it may help to eat something substantial before deciding about exercise.");
  }

  const hydration = ranMi > 0 || upcomingRun ? 'Drink regularly today — especially around your run.' : null;

  // Preparation for tomorrow
  const prep = [];
  if (tomorrow) {
    if (tomorrow.dayType === 'office' && tomorrow.status !== 'unavailable') {
      prep.push('Tomorrow is an office day: prepare breakfast and lunch tonight and pack a portable snack so you are not relying on whatever is available.');
    }
  }
  return { headline, lines, ideas, hydration, prep, totals };
}

/**
 * Recovery guidance — only returned when a run has been logged today.
 * ctx: { doneToday, foodsToday, nowMin, prefs, pantry }
 */
export function recoveryAdvice({ doneToday = [], foodsToday = [], nowMin, prefs = {}, pantry = [] }) {
  const runs = doneToday.filter((a) => a.type === 'run');
  if (!runs.length) return null;
  const mi = runs.reduce((s, a) => s + Number(a.distanceMi), 0);
  const ends = runs.filter((a) => a.startTime).map((a) => timeToMin(a.startTime) + Number(a.durationMin || 0));
  const runEnd = ends.length ? Math.max(...ends) : null;
  const since = runEnd != null ? nowMin - runEnd : null;
  const eatenAfter = runEnd != null ? foodsToday.filter((f) => f.time && timeToMin(f.time) >= runEnd) : [];
  const long = mi >= 5;
  const ideas = pickIdeas({ slot: nowMin >= 17 * 60 ? 'dinner' : 'snack', tags: ['postrun', 'protein', 'carb'], prefs, pantry, n: 2 }).map((i) => i.name);
  const lines = [];
  if (eatenAfter.length) {
    lines.push(`You've eaten since your run (${eatenAfter.map((f) => f.text).join('; ')}). Keep meals regular for the rest of the day.`);
  } else if (since == null || since <= 120) {
    lines.push(`In the next hour or two, have carbohydrate with some protein — for example ${ideas.join(' or ').toLowerCase()}.`);
  } else {
    lines.push("Nothing logged since your run — have a proper meal with carbohydrate and protein soon.");
  }
  if (long) lines.push("After a longer run it's normal to be hungrier this evening and tomorrow. Eat to appetite — there's nothing to make up for.");
  lines.push('Drink regularly over the next few hours.');
  return {
    headline: long ? 'Recover from your long run' : 'Recover from your run',
    summary: `${mi.toFixed(1)} mi run today${since != null && since >= 0 ? ` · finished ${since < 60 ? `${since} min` : `${Math.floor(since / 60)} h ${since % 60} min`} ago` : ''}`,
    lines,
  };
}

/**
 * Fuelling steps ahead of the next planned run.
 * run: { date, time, distanceMi, durationMin, kind, label }; isToday tells us which steps have passed.
 */
export function fuellingPlan({ run, isToday, nowMin, prefs = {}, pantry = [] }) {
  if (!run) return null;
  const start = run.time ? timeToMin(run.time) : null;
  const long = run.kind === 'long' || run.distanceMi >= 6;
  const snack = pickIdeas({ slot: 'snack', tags: ['prerun', 'light'], prefs, pantry, n: 2 }).map((i) => i.name.toLowerCase());
  const steps = [];
  if (long && !isToday) steps.push({ when: 'The evening before', text: 'A carbohydrate-based dinner — pasta, rice or potatoes — and some water before bed.' });
  if (start != null && start < 10 * 60) {
    steps.push({ when: `${minToTime(start - 45)}`, at: start - 45, text: `It's an early run: a small snack such as ${snack[0]} is enough. Eat a proper breakfast afterwards.` });
  } else if (start != null) {
    const meal = start - 180;
    steps.push({ when: `By ${minToTime(meal)}`, at: meal, text: `A normal meal with carbohydrate, about 2–3 hours before the run.` });
    const snackAt = start - 75;
    steps.push({
      when: `Around ${minToTime(snackAt)}`,
      at: snackAt,
      text: `A light snack such as ${snack.join(' or ')}${run.kind === 'nans' ? ' — pack it to take with you' : ''}.`,
    });
  } else {
    steps.push({ when: 'Before', text: `A carb-based meal 2–3 hours before, or a light snack such as ${snack[0]} an hour before.` });
  }
  if ((run.durationMin || 0) > 75) steps.push({ when: 'During', text: 'Take water, plus a gel or some sweets for the second half.' });
  steps.push({ when: 'Afterwards', text: 'Carbohydrate and protein within about 2 hours — plan what you will eat before you head out.' });
  return {
    headline: 'Fuel for your next run',
    steps: steps.map((s) => ({ ...s, past: isToday && s.at != null && s.at < nowMin })),
  };
}
