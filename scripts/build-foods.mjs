#!/usr/bin/env node
/**
 * Builds src/data/foods.json from USDA FoodData Central (public domain, U.S. Department of Agriculture).
 *
 * Inputs (download and unzip the two JSON datasets from https://fdc.nal.usda.gov/download-datasets):
 *   - Foundation Foods JSON   (FoodData_Central_foundation_food_json_*.json)
 *   - SR Legacy JSON          (FoodData_Central_sr_legacy_food_json_*.json)
 *
 * Usage:
 *   node scripts/build-foods.mjs <foundation.json> <sr_legacy.json> [out.json]
 *
 * Every number in the output is copied from the USDA files (per 100 g: energy kcal, protein, carbohydrate,
 * fat; household portions with their gram weights). Nothing is typed by hand. The script only decides WHICH
 * foods to keep, using the rules below, so the same inputs always give the same file.
 *
 * Output: { source, built, count, foods: [[fdcId, name, kcal, protein, carbs, fat, [[portionLabel, grams], ...]], ...] }
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [foundationPath, srPath, outPath = 'src/data/foods.json'] = process.argv.slice(2);
if (!foundationPath || !srPath) {
  console.error('usage: node scripts/build-foods.mjs <foundation.json> <sr_legacy.json> [out.json]');
  process.exit(1);
}

const foundation = JSON.parse(readFileSync(foundationPath, 'utf8')).FoundationFoods ?? [];
const srLegacy = JSON.parse(readFileSync(srPath, 'utf8')).SRLegacyFoods ?? [];

// --- selection rules (which foods; never which numbers) -------------------------------------------------
/**
 * Common foods, by name. A USDA food is eligible when one of these words appears in the first three comma-parts of
 * its description ("Nuts, almonds" matches "almond"). Up to `max` variants (raw, cooked, ...) are kept per word,
 * the most generic names first. The list only picks foods; every number still comes from the USDA files.
 */
const STAPLES = `
beef:ground:5 beef:steak:3 beef:roast:2 beef:brisket:1 beef:jerky:1 chicken:breast:4 chicken:thigh:2 chicken:drumstick:2 chicken:wing:1 chicken:ground:1 turkey:breast:2 turkey:ground:2 turkey:bacon:1 duck:1
pork:chop:2 pork:loin:2 spareribs:1 pork:ground:1 ham:3 bacon:3 sausage:4 hot:dog:1 salami:1 pepperoni:1 bologna:1 lamb:2
egg:6 salmon:4 tuna:3 cod:2 tilapia:2 trout:2 haddock:1 halibut:1 sardine:2 mackerel:1 herring:1 shrimp:2 crab:1 lobster:1 scallop:1 clam:1 oyster:1 catfish:1 pollock:1 anchovy:1
milk:5 yogurt:5 cheese:cheddar:2 cheese:mozzarella:2 cheese:parmesan:1 cheese:swiss:1 cheese:feta:1 cheese:cottage:2 cheese:cream:1 cheese:ricotta:1 cheese:american:1 cheese:goat:1 cheese:provolone:1 cream:3 butter:2 sour:cream:1 ice:cream:2 whey:1 kefir:1
rice:7 oats:2 oatmeal:1 pasta:3 spaghetti:2 macaroni:1 noodles:3 quinoa:2 couscous:1 barley:2 bulgur:1 millet:1 cornmeal:1 corn:4 buckwheat:1 granola:1 cereal:3
bread:6 bagel:2 tortilla:2 muffin:2 pancake:1 waffle:1 croissant:1 roll:2 pita:1 cracker:3 pretzel:1 cookie:3 cake:2 pie:2 doughnut:1 brownie:1 biscuit:1 flour:3
potato:6 sweet:potato:3 tomato:4 onion:3 garlic:1 carrot:3 broccoli:2 cauliflower:2 spinach:2 kale:1 lettuce:3 cabbage:2 cucumber:2 celery:1 pepper:3 mushroom:3 zucchini:1 squash:3 pumpkin:1 asparagus:1 beans:snap:2 peas:3 beet:1 eggplant:1 radish:1 brussels:1 avocado:2 olives:1 pickles:1 artichoke:1 leek:1
apple:3 banana:2 orange:3 grapefruit:1 grapes:2 strawberries:2 blueberries:2 raspberries:1 blackberries:1 cherries:1 peach:2 pear:2 plum:1 apricot:1 nectarine:1 pineapple:2 mango:2 papaya:1 kiwi:1 melon:2 cantaloupe:1 watermelon:1 lemon:1 lime:1 pomegranate:1 cranberries:1 dates:1 raisins:1 figs:1 prunes:1 coconut:2
beans:black:2 beans:kidney:2 beans:pinto:1 beans:navy:1 beans:white:1 beans:baked:1 chickpeas:2 hummus:1 lentils:2 tofu:2 tempeh:1 soy:2 edamame:1 peanut:butter:2 peanuts:2 almonds:2 walnuts:2 cashew:2 pecans:1 pistachio:1 hazelnuts:1 macadamia:1 sunflower:1 pumpkin:seeds:1 chia:1 flaxseed:1 sesame:1 almond:butter:1
oil:olive:1 oil:canola:1 oil:coconut:1 oil:vegetable:1 oil:sesame:1 mayonnaise:1 margarine:1 catsup:1 mustard:1 soy:sauce:1 salsa:1 barbecue:1 vinegar:1 salad:dressing:3 gravy:1 soup:4 broth:1 chili:1
juice:orange:1 juice:apple:1 juice:grape:1 juice:cranberry:1 cola:1 beer:1 wine:2 coffee:1 tea:1 lemonade:1 sports:drink:1 energy:drink:1 soymilk:1 almond:milk:1 oat:milk:1
sugar:2 honey:1 syrup:2 jam:1 jellies:1 chocolate:3 candy:2 chips:3 popcorn:2 pizza:1 burrito:1 lasagna:1 macaroni:and:cheese:1 protein:2 peanut:1
`
  .trim()
  .split(/\s+/)
  .map((t) => {
    const parts = t.split(':');
    const max = Number(parts[parts.length - 1]);
    return { words: parts.slice(0, -1), max: (Number.isFinite(max) && parts.length > 1 ? max : 1) * 2 };
  });
/** Names that are brand products, institutional, game meats or not something eaten as written. */
const EXCLUDE =
  /restaurant|fast food|babyfood|baby food|commodity|school lunch|ns as to|imitation|dehydrated|freeze-dried|infant|formula|unprepared|alaska native|navajo|hopi|apache|shoshone|pima|oriental|bison|elk\b|deer|moose|goat meat|horse|whale|seal\b|walrus|beaver|squirrel|rabbit|opossum|raccoon|bear\b|ostrich|emu\b|game meat|mollusks|\bUSDA\b|\bnfs\b|variety meats|by-products|dietetic|low calorie sweetener|substitute|giblets|\bskin only|organ|liver|tongue|gizzard|heart\b/i;
/** Brand names are written in capitals in USDA data ("KRAFT", "RALSTON"). Allow common short initialisms. */
const BRAND = /archway|pillsbury|campbell|kellogg|nabisco|oscar mayer|hormel|usda|trader joe/i;
const BRAND_CAPS = /[A-Z]{3,}/;

const NUTRIENT = { kcal: ['208'], protein: ['203'], fat: ['204'], carbs: ['205'] };
// Foundation Foods sometimes store energy only as Atwater values (957 general, 958 specific factors).
const KCAL_FALLBACK = ['958', '957'];

const round1 = (n) => Math.round(n * 10) / 10;

function amount(food, numbers) {
  for (const num of numbers) {
    const n = (food.foodNutrients ?? []).find((x) => x.nutrient?.number === num && typeof x.amount === 'number');
    if (n) return n.amount;
  }
  return undefined;
}

function macros(food) {
  const kcal = amount(food, NUTRIENT.kcal) ?? amount(food, KCAL_FALLBACK);
  const protein = amount(food, NUTRIENT.protein);
  const fat = amount(food, NUTRIENT.fat);
  const carbs = amount(food, NUTRIENT.carbs);
  if ([kcal, protein, fat, carbs].some((v) => v === undefined)) return undefined;
  return { kcal: Math.round(kcal), protein: round1(protein), carbs: round1(carbs), fat: round1(fat) };
}

/** "1 cup, chopped", "1 medium", "3 oz". Unitless USDA rows ("undetermined") use their modifier. */
function portionLabel(p) {
  const unit = p.measureUnit?.name ?? '';
  const unitless = !unit || unit === 'undetermined';
  const qty = p.amount ?? p.value ?? 1;
  const modifier = (p.modifier ?? '').trim();
  if (unit === 'RACC') return undefined;
  const q = Number.isInteger(qty) ? String(qty) : String(round1(qty));
  const label = unitless ? `${q} ${modifier}` : `${q} ${unit}${modifier ? `, ${modifier}` : ''}`;
  return label.trim().replace(/\s+/g, ' ');
}

function portions(food) {
  const out = [];
  const seen = new Set();
  const sorted = [...(food.foodPortions ?? [])].sort((a, b) => (a.sequenceNumber ?? 99) - (b.sequenceNumber ?? 99));
  for (const p of sorted) {
    if (!(p.gramWeight > 0)) continue;
    const label = portionLabel(p);
    if (!label || label.length > 40 || /^\d+(\.\d+)? (undetermined|quantity not specified)/i.test(label)) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([label, round1(p.gramWeight)]);
    if (out.length >= 4) break;
  }
  return out;
}

function candidate(food) {
  const name = (food.description ?? '').trim();
  const category = food.foodCategory?.description ?? '';
  const m = macros(food);
  if (!name || !m || EXCLUDE.test(name) || BRAND_CAPS.test(name.replace(/\bUSDA\b/g, '')) || BRAND.test(name)) return undefined;
  return { id: food.fdcId, name, category, kind: food.dataType, m, portions: portions(food) };
}

const cands = [...foundation.map(candidate), ...srLegacy.map(candidate)].filter(Boolean);

// Rank: Foundation first, foods with household portions, fewer commas (more generic names), shorter names.
/** Butcher-cut detail and imports rank after plain names. */
const fussy = (s) => (/separable|trimmed to|imported|external fat|fat only|prime|select|choice/i.test(s) ? 1 : 0);
const commas = (s) => (s.match(/,/g) ?? []).length;
cands.sort((a, b) => {
  const ka = [a.kind === 'Foundation' ? 0 : 1, a.portions.length ? 0 : 1, fussy(a.name), commas(a.name), a.name.length, a.id];
  const kb = [b.kind === 'Foundation' ? 0 : 1, b.portions.length ? 0 : 1, fussy(b.name), commas(b.name), b.name.length, b.id];
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
  return 0;
});

/** True when every word of the staple appears (singular or plural) in the first three comma-parts of the name. */
function matches(name, words) {
  const head = name.split(',').slice(0, 3).join(' ').toLowerCase();
  return words.every((w) => new RegExp(`(^|[^a-z])${w}(s|es)?([^a-z]|$)`).test(head));
}

const seenIds = new Set();
const seenNames = new Set();
const picked = [];
const taken = {};
for (const staple of STAPLES) {
  let n = 0;
  for (const c of cands) {
    if (n >= staple.max) break;
    if (seenIds.has(c.id) || seenNames.has(c.name.toLowerCase()) || !matches(c.name, staple.words)) continue;
    seenIds.add(c.id);
    seenNames.add(c.name.toLowerCase());
    picked.push(c);
    n += 1;
  }
  taken[staple.words.join(' ')] = n;
}

picked.sort((a, b) => a.name.localeCompare(b.name, 'en'));

const out = {
  source: 'USDA FoodData Central, Foundation Foods and SR Legacy (public domain). Values per 100 g.',
  built: 'scripts/build-foods.mjs',
  count: picked.length,
  foods: picked.map((c) => [c.id, c.name, c.m.kcal, c.m.protein, c.m.carbs, c.m.fat, c.portions]),
};
writeFileSync(outPath, JSON.stringify(out));
console.log(`${picked.length} foods written to ${outPath}`);
console.log('no match for:', Object.entries(taken).filter(([, v]) => v === 0).map(([k]) => k).join(', ') || 'none');
