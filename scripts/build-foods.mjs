#!/usr/bin/env node
/**
 * Builds src/data/foods.json from USDA FoodData Central (public domain, U.S. Department of Agriculture).
 *
 * Inputs (download and unzip the three JSON datasets from https://fdc.nal.usda.gov/download-datasets):
 *   - Foundation Foods JSON   (FoodData_Central_foundation_food_json_*.json)
 *   - SR Legacy JSON          (FoodData_Central_sr_legacy_food_json_*.json)
 *   - Survey (FNDDS) JSON     (surveyDownload.json: mixed dishes, sandwiches, burritos, pizza, soft drinks)
 *
 * Usage:
 *   node scripts/build-foods.mjs <foundation.json> <sr_legacy.json> <survey.json> [out.json]
 *
 * Every number in the output is copied from the USDA files (per 100 g: energy kcal, protein, carbohydrate,
 * fat; household portions with their gram weights). Nothing is typed by hand. The script only decides WHICH
 * foods to keep, using the rules below, so the same inputs always give the same file.
 *
 * Output: { source, built, count, foods: [[fdcId, name, kcal, protein, carbs, fat, [[portionLabel, grams], ...]], ...] }
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [foundationPath, srPath, surveyPath, outPath = 'src/data/foods.json'] = process.argv.slice(2);
if (!foundationPath || !srPath || !surveyPath) {
  console.error('usage: node scripts/build-foods.mjs <foundation.json> <sr_legacy.json> <survey.json> [out.json]');
  process.exit(1);
}

const foundation = JSON.parse(readFileSync(foundationPath, 'utf8')).FoundationFoods ?? [];
const srLegacy = JSON.parse(readFileSync(srPath, 'utf8')).SRLegacyFoods ?? [];
const survey = JSON.parse(readFileSync(surveyPath, 'utf8')).SurveyFoods ?? [];

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
beef:ground:4 beef:steak:4 beef:ribeye:1 beef:sirloin:1 beef:tenderloin:1 beef:chuck:1 beef:flank:1 beef:round:1 beef:short:ribs:1 beef:roast:2 roast:beef:1 pork:chop:3 pork:loin:3 pork:tenderloin:1 pork:shoulder:1 pork:ribs:1 pork:ground:2 canadian:bacon:1 chicken:breast:6 chicken:thigh:3 chicken:drumstick:2 chicken:wing:2 chicken:leg:1 chicken:nuggets:1 chicken:tenders:1 turkey:breast:3 turkey:ground:2 turkey:thigh:1 turkey:sausage:1 sausage:4 hot:dog:2 ham:3 bacon:3 deli:1 pastrami:1 corned:beef:1
egg:6 egg:white:1 egg:yolk:1 salmon:4 tuna:4 cod:2 tilapia:2 shrimp:3 crab:2 lobster:1 scallop:1 swordfish:1 bass:1 perch:1 snapper:1 flounder:1 sole:1 catfish:1 pollock:1 sardine:1 anchovy:1 squid:1 mussel:1 fish:sticks:1 caviar:1
milk:6 buttermilk:1 evaporated:1 condensed:1 half:and:half:1 cream:heavy:1 cream:whipped:1 yogurt:6 yogurt:greek:2 cheese:cheddar:3 cheese:mozzarella:3 cheese:parmesan:1 cheese:swiss:1 cheese:feta:1 cheese:cottage:2 cheese:cream:2 cheese:ricotta:1 cheese:american:1 cheese:colby:1 cheese:monterey:1 cheese:blue:1 cheese:gouda:1 cheese:brie:1 cheese:provolone:1 cheese:mexican:1 butter:3 ghee:1 sour:cream:2
rice:8 rice:brown:2 rice:white:2 oats:3 oatmeal:2 pasta:4 spaghetti:2 noodles:3 ramen:1 quinoa:2 couscous:1 cereal:6 granola:2 bread:8 bagel:2 tortilla:3 naan:1 pita:1 english:muffin:1 rolls:hamburger:1 rolls:dinner:1 bun:2 crackers:3 pizza:crust:1 flour:6 cornstarch:1 baking:soda:1 baking:powder:1 yeast:1 bread:crumbs:1 taco:shells:1 tostada:1 waffles:1 pancakes:1 stuffing:1 pie:crust:1
tomatoes:4 tomato:sauce:2 tomato:paste:1 tomato:puree:1 onions:3 scallions:1 garlic:2 ginger:1 peppers:6 jalapeno:2 chili:peppers:2 broccoli:3 cauliflower:2 spinach:2 kale:1 lettuce:4 romaine:1 arugula:1 cabbage:2 cucumber:2 celery:1 carrots:3 mushrooms:3 zucchini:1 squash:3 asparagus:1 snap:beans:2 corn:5 peas:3 beets:1 eggplant:1 radishes:1 brussels:1 avocados:2 olives:2 pickles:2 sauerkraut:1 artichokes:1 leeks:1 turnips:1 parsnips:1 okra:1 cilantro:1 coriander:1 parsley:1 basil:1 mint:1 dill:1 sprouts:1 seaweed:1 yam:1 plantains:1 cassava:1 hash:brown:1 potatoes:french:fried:2 potatoes:mashed:1 potatoes:baked:2 potatoes:red:1 potatoes:white:2 potatoes:russet:1 potato:chips:1 sweet:potato:3
apples:4 bananas:2 oranges:3 grapefruit:1 grapes:2 strawberries:2 blueberries:2 raspberries:1 blackberries:1 cherries:1 peaches:2 pears:2 plums:1 apricots:1 nectarines:1 pineapple:2 mangos:2 papayas:1 kiwifruit:1 melons:2 cantaloupe:1 watermelon:1 lemons:1 limes:1 pomegranate:1 cranberries:1 dates:1 raisins:1 figs:1 prunes:1 coconut:3 applesauce:1 fruit:cocktail:1 juice:orange:2 juice:apple:2 juice:grape:1 juice:cranberry:1 juice:pineapple:1 juice:tomato:1 juice:lemon:1 juice:lime:1
beans:black:2 beans:kidney:2 beans:pinto:2 beans:navy:1 beans:white:1 beans:baked:1 beans:refried:2 beans:lima:1 beans:cannellini:1 chickpeas:2 hummus:1 lentils:2 tofu:2 tempeh:1 edamame:1 peanut:butter:2 peanuts:2 almonds:3 walnuts:2 cashew:2 pecans:1 pistachio:1 hazelnuts:1 macadamia:1 sunflower:1 pumpkin:seeds:1 chia:1 flaxseed:1 sesame:1 almond:butter:1 tahini:1 trail:mix:1 nuts:mixed:1 seeds:2
oil:olive:1 oil:canola:1 oil:coconut:1 oil:vegetable:1 oil:peanut:1 oil:avocado:1 shortening:1 lard:1 mayonnaise:2 margarine:1 catsup:1 mustard:2 soy:sauce:1 salsa:3 barbecue:2 vinegar:2 salad:dressing:5 gravy:1 sauce:hot:2 sauce:pasta:2 sauce:pesto:1 sauce:worcestershire:1 sauce:teriyaki:1 sauce:hoisin:1 sauce:fish:1 sauce:tartar:1 sauce:cheese:1 sauce:enchilada:1 sauce:pizza:1 sauce:barbecue:1 sauce:cranberry:1 sauce:oyster:1 guacamole:1 relish:1 horseradish:1 wasabi:1
salt:1 spices:cinnamon:1 spices:pepper:black:1 spices:pepper:red:1 spices:paprika:1 spices:cumin:1 spices:chili:powder:1 spices:garlic:powder:1 spices:onion:powder:1 spices:oregano:1 spices:basil:1 spices:ginger:1 spices:turmeric:1 spices:curry:1 spices:nutmeg:1 spices:cloves:1 spices:parsley:1 spices:thyme:1 spices:rosemary:1 spices:dill:1 vanilla:1 cocoa:2 sugars:brown:1 sugars:powdered:1 sugars:granulated:1 syrups:maple:1 syrups:corn:1 molasses:1 marshmallows:1 candies:3 gelatin:1 pudding:2 frosting:1 sprinkles:1
carbonated:6 cola:2 beer:2 wine:3 coffee:2 tea:2 lemonade:1 sports:drink:1 energy:drink:2 whey:1 protein:3 soymilk:2 almond:milk:2 oat:milk:1 coconut:milk:2 coconut:water:1 water:2 liquor:2 vodka:1 whiskey:1 rum:1
pizza:2 burrito:2 taco:2 nachos:1 lasagna:1 macaroni:and:cheese:1 muffin:2 cookie:3 cake:3 pie:3 doughnut:1 brownie:1 ice:cream:3 popcorn:2 chips:3 pretzel:1 granola:bars:2 snacks:6 soup:5 broth:2 chili:1 stew:1 sandwich:2 hamburger:2 cheeseburger:2 french:toast:1
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
  /babyfood|baby food|commodity|school lunch|ns as to|imitation|dehydrated|freeze-dried|infant|formula|unprepared|alaska native|navajo|hopi|apache|shoshone|pima|oriental|bison|elk\b|deer|moose|goat meat|horse|whale|seal\b|walrus|beaver|squirrel|rabbit|opossum|raccoon|bear\b|ostrich|emu\b|game meat|mollusks|\bUSDA\b|\bnfs\b|variety meats|by-products|dietetic|low calorie sweetener|substitute|giblets|\bskin only|organ|liver|tongue|gizzard|heart\b/i;
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
function portionLabel(p, survey = false) {
  if (survey && p.portionDescription) return p.portionDescription.trim().replace(/\s+/g, ' '); // Survey (FNDDS) rows
  const unit = p.measureUnit?.name ?? '';
  const unitless = !unit || unit === 'undetermined';
  const qty = p.amount ?? p.value ?? 1;
  const modifier = (p.modifier ?? '').trim();
  if (unit === 'RACC') return undefined;
  const q = Number.isInteger(qty) ? String(qty) : String(round1(qty));
  const label = unitless ? `${q} ${modifier}` : `${q} ${unit}${modifier ? `, ${modifier}` : ''}`;
  return label.trim().replace(/\s+/g, ' ');
}

/** A cup, tablespoon, teaspoon or fluid ounce with no preparation: the app derives ml and the other volumes from it. */
const PLAIN_VOLUME = /^(\d+(\.\d+)?|\d+\/\d+) ?(cup|tbsp|tablespoon|tsp|teaspoon|fl oz|fluid ounce)s?( \(.*\))?$/i;
const VOLUME_ORDER = ['cup', 'fl', 'tbsp', 'tablespoon', 'tsp', 'teaspoon', 'fluid'];
/** Weights (the app has g and oz for every food), counts of nothing, and survey bookkeeping rows. */
const SKIP_PORTION = /^[\d./ ]+ ?(oz|ounce|g|gram|lb|pound)s?\b|^\d+(\.\d+)? (undetermined|quantity not specified)|quantity not specified|cubic inch|surface inch|guideline|yields|\bNFS\b|NS as to/i;

function portions(food) {
  const out = [];
  const seen = new Set();
  const sorted = [...(food.foodPortions ?? [])].sort((a, b) => (a.sequenceNumber ?? 99) - (b.sequenceNumber ?? 99));
  const all = [];
  for (const p of sorted) {
    if (!(p.gramWeight >= 0.5)) continue;
    const label = portionLabel(p, food.dataType === 'Survey (FNDDS)')?.replace(/, any size$/i, '');
    if (!label || label.length > 40 || SKIP_PORTION.test(label)) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    all.push([label, round1(p.gramWeight)]);
  }
  // Plain volumes first (largest unit first), so a cap never drops the one the app converts from.
  const volume = (l) => VOLUME_ORDER.findIndex((u) => l.toLowerCase().replace(/^[\d./ ]+/, '').startsWith(u));
  const plain = all.filter(([l]) => PLAIN_VOLUME.test(l)).sort((a, b) => volume(a[0]) - volume(b[0])).slice(0, 2);
  const rest = all.filter((x) => !plain.includes(x));
  for (const x of [...plain, ...rest]) {
    out.push(x);
    if (out.length >= 8) break;
  }
  // Smallest first, so the chips read small to large.
  return out.sort((a, b) => a[1] - b[1]);
}

/** True when the food has any usable household portion; only used to rank foods so the selection stays stable. */
function hadHousehold(food) {
  return (food.foodPortions ?? []).some((p) => {
    if (!(p.gramWeight > 0)) return false;
    const label = portionLabel(p);
    return !!label && label.length <= 40 && !/^\d+(\.\d+)? (undetermined|quantity not specified)/i.test(label);
  });
}

function candidate(food) {
  const name = (food.description ?? '').trim();
  const category = food.foodCategory?.description ?? '';
  const m = macros(food);
  if (!name || !m || EXCLUDE.test(name) || BRAND_CAPS.test(name.replace(/\bUSDA\b/g, '')) || BRAND.test(name)) return undefined;
  return { id: food.fdcId, name, category, kind: food.dataType, m, portions: portions(food), ranked: hadHousehold(food) };
}

const cands = [...foundation.map(candidate), ...srLegacy.map(candidate)].filter(Boolean);

// Rank: Foundation first, foods with household portions, fewer commas (more generic names), shorter names.
/** Butcher-cut detail and imports rank after plain names. */
const fussy = (s) => (/separable|trimmed to|imported|external fat|fat only|prime|select|choice/i.test(s) ? 1 : 0);
const commas = (s) => (s.match(/,/g) ?? []).length;
cands.sort((a, b) => {
  const ka = [a.kind === 'Foundation' ? 0 : 1, a.ranked ? 0 : 1, fussy(a.name), commas(a.name), a.name.length, a.id];
  const kb = [b.kind === 'Foundation' ? 0 : 1, b.ranked ? 0 : 1, fussy(b.name), commas(b.name), b.name.length, b.id];
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
  taken[staple.words.join(' ')] = 0;
}

// Generic fast-food and restaurant items from SR Legacy ("Fast foods, ...", "Restaurant, Mexican, ..."): all of them.
// Brand-named rows (written in capitals in USDA data) were already dropped in `candidate`.
for (const c of cands) {
  if (!/^(Fast Foods|Restaurant Foods)$/.test(c.category) || seenIds.has(c.id) || seenNames.has(c.name.toLowerCase())) continue;
  seenIds.add(c.id);
  seenNames.add(c.name.toLowerCase());
  picked.push(c);
}
const fromSr = picked.length;

// Survey (FNDDS): everything people actually eat as written, minus baby food, formula and human milk.
// "NFS" / "NS as to ..." (not further specified) is dropped from the name; the first row of each cleaned name is kept.
const SURVEY_SKIP_CATEGORY = /^(baby|formula|human milk|not included)/i;
const SURVEY_SKIP_NAME = /infant|formula|baby|human milk|breast milk/i;
const cleanSurveyName = (name) =>
  name
    .replace(/,? ?\bNS as to [^,]*/gi, '')
    .replace(/,? ?\bNFS\b/g, '')
    .replace(/\s+,/g, ',')
    .replace(/^[,\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
let fromSurvey = 0;
for (const food of [...survey].sort((a, b) => a.fdcId - b.fdcId)) {
  const category = food.wweiaFoodCategory?.wweiaFoodCategoryDescription ?? '';
  const name = cleanSurveyName((food.description ?? '').trim());
  const m = macros(food);
  if (!name || !m || SURVEY_SKIP_CATEGORY.test(category) || SURVEY_SKIP_NAME.test(name) || seenNames.has(name.toLowerCase())) continue;
  seenNames.add(name.toLowerCase());
  picked.push({ id: food.fdcId, name, category, kind: 'Survey', m, portions: portions(food) });
  fromSurvey += 1;
}

picked.sort((a, b) => a.name.localeCompare(b.name, 'en'));

const out = {
  source: 'USDA FoodData Central, Foundation Foods, SR Legacy and Survey (FNDDS) (public domain). Values per 100 g.',
  built: 'scripts/build-foods.mjs',
  count: picked.length,
  foods: picked.map((c) => [c.id, c.name, c.m.kcal, c.m.protein, c.m.carbs, c.m.fat, c.portions]),
};
writeFileSync(outPath, JSON.stringify(out));
console.log(`${picked.length} foods written to ${outPath} (${fromSr} from Foundation and SR Legacy, ${fromSurvey} from Survey)`);
for (const staple of STAPLES) taken[staple.words.join(' ')] = Math.max(taken[staple.words.join(' ')] ?? 0, picked.filter((c) => matches(c.name, staple.words)).length);
console.log('no food for:', Object.entries(taken).filter(([, v]) => v === 0).map(([k]) => k).join(', ') || 'none');
