'use strict';

/**
 * Ashta Koota / Guna Milan Service
 *
 * Implements the traditional 8-Koota compatibility scoring system
 * used in Vedic matrimonial astrology.
 *
 * Reference: Brihat Parashara Hora Shastra (BPHS), chapters on Ashtakuta.
 * Additional cross-reference: "Muhurta" by B.V. Raman (Chapter on Marriage).
 *
 * Configuration used (must match kundali_generator.py):
 *   Nakshatra basis: Moon Nakshatra (same as used for Rashi)
 *   Rashi basis: Moon Rashi
 *
 * ALL scores are computed from lookup tables.
 * DO NOT return hardcoded values for production profiles.
 *
 * Total maximum: 36 points.
 * Threshold for eligibility: 18 points (50% = minimum recommended by tradition).
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const GUNA_THRESHOLD = 18; // Minimum Guna score for matchmaking eligibility

const NAKSHATRAS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra',
  'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni',
  'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
  'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishtha',
  'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati',
];

const RASHI = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

// ─── Lookup tables ────────────────────────────────────────────────────────────

/**
 * 1. VARNA (Caste/Spiritual level) — max 1 point
 * Rashi → Varna: Brahmin, Kshatriya, Vaishya, Shudra
 * Score 1 if groom's Varna >= bride's Varna (or equal).
 * Score 0 if groom's Varna < bride's Varna.
 */
const VARNA_MAP = {
  'Cancer': 'Brahmin', 'Scorpio': 'Brahmin', 'Pisces': 'Brahmin',
  'Leo': 'Kshatriya', 'Aries': 'Kshatriya', 'Sagittarius': 'Kshatriya',
  'Taurus': 'Vaishya', 'Virgo': 'Vaishya', 'Capricorn': 'Vaishya',
  'Gemini': 'Shudra', 'Libra': 'Shudra', 'Aquarius': 'Shudra',
};
const VARNA_RANK = { Brahmin: 4, Kshatriya: 3, Vaishya: 2, Shudra: 1 };

/**
 * 2. VASHYA (Attraction/Dominance) — max 2 points
 * Rashi → Vashya group.
 * Full score (2) if same group or one dominates the other in a beneficial way.
 * Partial score (1) for friendly groups.
 * Score 0 for hostile groups.
 *
 * Vashya categories from BPHS:
 *   Nara (human): Gemini, Virgo, Libra, Aquarius, first half of Sagittarius (0-15°)
 *   Chatushpada (4-legged): Aries, Taurus, second half of Sagittarius, Capricorn (first half)
 *   Jalachara (water): Cancer, Scorpio, Pisces, Capricorn (second half)
 *   Vanachara (wild animals): Leo
 *   Keeta (insects/serpents): Scorpio (dual classification, primarily keeta here)
 *
 * Simplified to sign level (standard practice when pada not computed separately):
 */
const VASHYA_GROUP = {
  'Aries': 'Chatushpada', 'Taurus': 'Chatushpada',
  'Gemini': 'Nara', 'Cancer': 'Jalachara',
  'Leo': 'Vanachara', 'Virgo': 'Nara',
  'Libra': 'Nara', 'Scorpio': 'Keeta',
  'Sagittarius': 'Chatushpada', 'Capricorn': 'Jalachara',
  'Aquarius': 'Nara', 'Pisces': 'Jalachara',
};
// Beneficial dominance pairs (dominant → dominated): score 2 for both in pair
const VASHYA_DOMINATED = {
  'Aries':  ['Taurus', 'Pisces'],        // Aries dominates these
  'Taurus': ['Scorpio'],
  'Gemini': ['Virgo'],
  'Cancer': ['Scorpio', 'Capricorn'],
  'Leo':    ['Aries'],
  'Virgo':  ['Pisces', 'Gemini'],
  'Libra':  ['Capricorn'],
  'Scorpio':['Cancer'],
  'Sagittarius': ['Pisces'],
  'Capricorn': ['Aquarius'],
  'Aquarius': ['Capricorn'],
  'Pisces': ['Capricorn'],
};

/**
 * 3. TARA (Star compatibility / Birth star distance) — max 3 points
 * Count stars from bride's to groom's nakshatra and from groom's to bride's.
 * Divide each count by 9; remainder indicates Tara type.
 * Tara index 0 (9th) = inauspicious.
 *
 * Tara types by remainder (1-based mod 9):
 *   1=Janma, 2=Sampat, 3=Vipat, 4=Kshema, 5=Pratyari, 6=Sadhana, 7=Vadha, 8=Mitra, 9=Parama Mitra
 * Auspicious (score 1.5 each direction): 2,4,6,8,9 → total = 3
 * Inauspicious (score 0 each direction): 1,3,5,7
 */
const TARA_AUSPICIOUS = new Set([2, 4, 6, 8, 0]); // 0 = mod 9 result for multiple of 9 (Parama Mitra)

/**
 * 4. YONI (Animal symbol / Sexual compatibility) — max 4 points
 * Each nakshatra maps to an animal. Same animal = 4pts, friendly = 3pts, neutral = 2pts, hostile = 0pts.
 */
const YONI_MAP = {
  'Ashwini': 'Horse',      'Shatabhisha': 'Horse',
  'Bharani': 'Elephant',   'Revati': 'Elephant',
  'Krittika': 'Goat',      'Pushya': 'Goat',
  'Rohini': 'Serpent',     'Mrigashira': 'Serpent',
  'Ardra': 'Dog',          'Mula': 'Dog',
  'Punarvasu': 'Cat',      'Ashlesha': 'Cat',
  'Magha': 'Rat',          'Purva Phalguni': 'Rat',
  'Uttara Phalguni': 'Cow','Uttara Bhadrapada': 'Cow',
  'Hasta': 'Buffalo',      'Swati': 'Buffalo',
  'Chitra': 'Tiger',       'Vishakha': 'Tiger',
  'Anuradha': 'Deer',      'Jyeshtha': 'Deer',
  'Purva Ashadha': 'Monkey','Shravana': 'Monkey',
  'Uttara Ashadha': 'Mongoose', // Mongoose has no pair — unique
  'Purva Bhadrapada': 'Lion',
  'Dhanishtha': 'Lion',
};
// Friendly animal pairs (mutual): score 3
const YONI_FRIENDLY_PAIRS = [
  ['Horse', 'Deer'], ['Elephant', 'Cat'], ['Serpent', 'Mongoose'],
  ['Dog', 'Deer'], ['Cat', 'Rat'], ['Goat', 'Deer'], ['Cow', 'Buffalo'],
  ['Tiger', 'Deer'], ['Rat', 'Elephant'], ['Monkey', 'Goat'],
];
// Hostile pairs (mutual): score 0
const YONI_HOSTILE_PAIRS = [
  ['Horse', 'Buffalo'], ['Elephant', 'Lion'], ['Serpent', 'Mongoose'],
  ['Dog', 'Deer'], ['Cat', 'Rat'], // Cat-Rat hostile in some traditions
  ['Cow', 'Tiger'], ['Dog', 'Dog'], // same-same is 4 except Dog-Dog
  ['Lion', 'Elephant'], ['Buffalo', 'Lion'], ['Monkey', 'Lion'],
];
// Note: Dog-Dog = hostile per BPHS
const YONI_HOSTILE_SET = new Set(
  YONI_HOSTILE_PAIRS.map(([a, b]) => `${a}|${b}`).concat(YONI_HOSTILE_PAIRS.map(([a, b]) => `${b}|${a}`))
);
const YONI_FRIENDLY_SET = new Set(
  YONI_FRIENDLY_PAIRS.map(([a, b]) => `${a}|${b}`).concat(YONI_FRIENDLY_PAIRS.map(([a, b]) => `${b}|${a}`))
);

/**
 * 5. GRAHA MAITRI (Planetary friendship) — max 5 points
 * Based on friendship between the lords of bride's and groom's Moon signs.
 */
const SIGN_LORD = {
  'Aries': 'Mars', 'Taurus': 'Venus', 'Gemini': 'Mercury',
  'Cancer': 'Moon', 'Leo': 'Sun', 'Virgo': 'Mercury',
  'Libra': 'Venus', 'Scorpio': 'Mars', 'Sagittarius': 'Jupiter',
  'Capricorn': 'Saturn', 'Aquarius': 'Saturn', 'Pisces': 'Jupiter',
};
// Planetary friendship table: Friend(2), Neutral(1), Enemy(0)
const PLANET_FRIENDSHIP = {
  Sun:     { friend: ['Moon', 'Mars', 'Jupiter'], neutral: ['Mercury'], enemy: ['Venus', 'Saturn'] },
  Moon:    { friend: ['Sun', 'Mercury'], neutral: ['Mars', 'Jupiter', 'Venus', 'Saturn'], enemy: [] },
  Mars:    { friend: ['Sun', 'Moon', 'Jupiter'], neutral: ['Venus', 'Saturn'], enemy: ['Mercury'] },
  Mercury: { friend: ['Sun', 'Venus'], neutral: ['Mars', 'Jupiter', 'Saturn'], enemy: ['Moon'] },
  Jupiter: { friend: ['Sun', 'Moon', 'Mars'], neutral: ['Saturn'], enemy: ['Mercury', 'Venus'] },
  Venus:   { friend: ['Mercury', 'Saturn'], neutral: ['Mars', 'Jupiter'], enemy: ['Sun', 'Moon'] },
  Saturn:  { friend: ['Mercury', 'Venus'], neutral: ['Jupiter'], enemy: ['Sun', 'Moon', 'Mars'] },
  Rahu:    { friend: ['Saturn', 'Mercury', 'Venus'], neutral: ['Jupiter'], enemy: ['Sun', 'Moon', 'Mars'] },
  Ketu:    { friend: ['Mars', 'Venus', 'Saturn'], neutral: ['Jupiter'], enemy: ['Sun', 'Moon', 'Mercury'] },
};

function getPlanetRelation(lord1, lord2) {
  const f = PLANET_FRIENDSHIP[lord1];
  if (!f) return 'neutral';
  if (f.friend.includes(lord2)) return 'friend';
  if (f.enemy.includes(lord2)) return 'enemy';
  return 'neutral';
}

/**
 * 6. GANA (Nature temperament) — max 6 points
 * Nakshatra → Gana: Deva, Manushya, Rakshasa
 */
const GANA_MAP = {
  'Ashwini': 'Deva', 'Mrigashira': 'Deva', 'Punarvasu': 'Deva',
  'Pushya': 'Deva', 'Hasta': 'Deva', 'Swati': 'Deva',
  'Anuradha': 'Deva', 'Shravana': 'Deva', 'Revati': 'Deva',
  'Bharani': 'Manushya', 'Rohini': 'Manushya', 'Ardra': 'Manushya',
  'Purva Phalguni': 'Manushya', 'Uttara Phalguni': 'Manushya', 'Purva Ashadha': 'Manushya',
  'Uttara Ashadha': 'Manushya', 'Purva Bhadrapada': 'Manushya', 'Uttara Bhadrapada': 'Manushya',
  'Krittika': 'Rakshasa', 'Ashlesha': 'Rakshasa', 'Magha': 'Rakshasa',
  'Chitra': 'Rakshasa', 'Vishakha': 'Rakshasa', 'Jyeshtha': 'Rakshasa',
  'Mula': 'Rakshasa', 'Dhanishtha': 'Rakshasa', 'Shatabhisha': 'Rakshasa',
};
// Gana scoring matrix [boy_gana][girl_gana] → points (0–6)
const GANA_SCORE = {
  Deva:     { Deva: 6, Manushya: 5, Rakshasa: 0 },
  Manushya: { Deva: 0, Manushya: 6, Rakshasa: 0 },
  Rakshasa: { Deva: 0, Manushya: 0, Rakshasa: 6 },
};

/**
 * 7. BHAKOOT (Rashi interval) — max 7 points
 * Count sign intervals. Certain intervals indicate dosha; others are auspicious.
 * Inauspicious (0 pts): 2/12, 5/9, 6/8 counted from girl to boy and vice versa.
 * Auspicious (7 pts): all other combinations.
 */
const BHAKOOT_INAUSPICIOUS = new Set([2, 12, 5, 9, 6, 8]);

/**
 * 8. NADI (Life force / Constitution) — max 8 points
 * Nakshatra → Nadi: Adi (Vata), Madhya (Pitta), Antya (Kapha)
 * Same Nadi = 0 pts (Nadi Dosha — serious incompatibility).
 * Different Nadi = 8 pts.
 */
const NADI_MAP = {
  'Ashwini': 'Adi',   'Ardra': 'Adi',   'Punarvasu': 'Adi',
  'Uttara Phalguni': 'Adi', 'Hasta': 'Adi', 'Jyeshtha': 'Adi',
  'Mula': 'Adi',     'Shatabhisha': 'Adi', 'Purva Bhadrapada': 'Adi',

  'Bharani': 'Madhya', 'Mrigashira': 'Madhya', 'Pushya': 'Madhya',
  'Purva Phalguni': 'Madhya', 'Chitra': 'Madhya', 'Anuradha': 'Madhya',
  'Purva Ashadha': 'Madhya', 'Dhanishtha': 'Madhya', 'Uttara Bhadrapada': 'Madhya',

  'Krittika': 'Antya', 'Rohini': 'Antya', 'Ashlesha': 'Antya',
  'Magha': 'Antya',   'Swati': 'Antya',  'Vishakha': 'Antya',
  'Uttara Ashadha': 'Antya', 'Shravana': 'Antya', 'Revati': 'Antya',
};

// ─── Helper: Nakshatra index ──────────────────────────────────────────────────

function nakIndex(name) {
  const i = NAKSHATRAS.indexOf(name);
  if (i === -1) throw new Error(`Unknown nakshatra: "${name}"`);
  return i;
}

function rashiIndex(name) {
  const i = RASHI.indexOf(name);
  if (i === -1) throw new Error(`Unknown rashi: "${name}"`);
  return i;
}

// ─── Individual Koota calculators ─────────────────────────────────────────────

function calcVarna(boyRashi, girlRashi) {
  const boyVarna = VARNA_MAP[boyRashi];
  const girlVarna = VARNA_MAP[girlRashi];
  const score = boyVarna && girlVarna && VARNA_RANK[boyVarna] >= VARNA_RANK[girlVarna] ? 1 : 0;
  return { obtained: score, maximum: 1, detail: `Boy=${boyVarna}, Girl=${girlVarna}` };
}

function calcVashya(boyRashi, girlRashi) {
  if (boyRashi === girlRashi) return { obtained: 2, maximum: 2, detail: 'Same Rashi' };
  const boyGroup = VASHYA_GROUP[boyRashi];
  const girlGroup = VASHYA_GROUP[girlRashi];
  if (boyGroup === girlGroup) return { obtained: 2, maximum: 2, detail: 'Same Vashya group' };
  const boyDom = VASHYA_DOMINATED[boyRashi] || [];
  const girlDom = VASHYA_DOMINATED[girlRashi] || [];
  if (boyDom.includes(girlRashi) || girlDom.includes(boyRashi)) {
    return { obtained: 2, maximum: 2, detail: 'Domination pair' };
  }
  // Partial: friendly groups
  return { obtained: 1, maximum: 2, detail: `Boy=${boyGroup}, Girl=${girlGroup}` };
}

function calcTara(boyNak, girlNak) {
  const boyIdx = nakIndex(boyNak);
  const girlIdx = nakIndex(girlNak);

  // Count from girl's to boy's (1-based modulo 9)
  const girlToBoy = ((boyIdx - girlIdx + 27) % 27) % 9 || 9;
  // Count from boy's to girl's
  const boyToGirl = ((girlIdx - boyIdx + 27) % 27) % 9 || 9;

  const a1 = TARA_AUSPICIOUS.has(girlToBoy % 9);
  const a2 = TARA_AUSPICIOUS.has(boyToGirl % 9);
  const score = (a1 ? 1.5 : 0) + (a2 ? 1.5 : 0);
  return {
    obtained: score,
    maximum: 3,
    detail: `Girl→Boy Tara=${girlToBoy} (${a1 ? 'auspicious' : 'inauspicious'}), Boy→Girl Tara=${boyToGirl} (${a2 ? 'auspicious' : 'inauspicious'})`,
  };
}

function calcYoni(boyNak, girlNak) {
  const boyAnimal = YONI_MAP[boyNak];
  const girlAnimal = YONI_MAP[girlNak];
  if (!boyAnimal || !girlAnimal) return { obtained: 2, maximum: 4, detail: 'Unknown nakshatra animal, defaulting neutral' };

  if (boyAnimal === girlAnimal) {
    // Same animal is 4 EXCEPT Dog-Dog which is hostile
    const score = (boyAnimal === 'Dog') ? 0 : 4;
    return { obtained: score, maximum: 4, detail: `Same animal: ${boyAnimal}` };
  }

  const pairKey = `${boyAnimal}|${girlAnimal}`;
  if (YONI_HOSTILE_SET.has(pairKey)) return { obtained: 0, maximum: 4, detail: `Hostile: ${boyAnimal} vs ${girlAnimal}` };
  if (YONI_FRIENDLY_SET.has(pairKey)) return { obtained: 3, maximum: 4, detail: `Friendly: ${boyAnimal} vs ${girlAnimal}` };
  return { obtained: 2, maximum: 4, detail: `Neutral: ${boyAnimal} vs ${girlAnimal}` };
}

function calcGrahaMaitri(boyRashi, girlRashi) {
  const boyLord = SIGN_LORD[boyRashi];
  const girlLord = SIGN_LORD[girlRashi];
  if (boyLord === girlLord) return { obtained: 5, maximum: 5, detail: 'Same lord' };

  const r1 = getPlanetRelation(boyLord, girlLord);
  const r2 = getPlanetRelation(girlLord, boyLord);

  let score;
  if (r1 === 'friend' && r2 === 'friend')       score = 5;
  else if (r1 === 'friend' && r2 === 'neutral')  score = 4;
  else if (r1 === 'neutral' && r2 === 'friend')  score = 4;
  else if (r1 === 'neutral' && r2 === 'neutral') score = 3;
  else if (r1 === 'friend' && r2 === 'enemy')    score = 2;
  else if (r1 === 'enemy' && r2 === 'friend')    score = 2;
  else if (r1 === 'neutral' && r2 === 'enemy')   score = 1;
  else if (r1 === 'enemy' && r2 === 'neutral')   score = 1;
  else score = 0; // both enemy

  return { obtained: score, maximum: 5, detail: `Boy lord=${boyLord}(${r1}), Girl lord=${girlLord}(${r2})` };
}

function calcGana(boyNak, girlNak) {
  const boyGana = GANA_MAP[boyNak];
  const girlGana = GANA_MAP[girlNak];
  if (!boyGana || !girlGana) return { obtained: 0, maximum: 6, detail: 'Unknown Gana' };

  const score = GANA_SCORE[boyGana]?.[girlGana] ?? 0;
  return { obtained: score, maximum: 6, detail: `Boy=${boyGana}, Girl=${girlGana}` };
}

function calcBhakoot(boyRashi, girlRashi) {
  const boyIdx = rashiIndex(boyRashi);
  const girlIdx = rashiIndex(girlRashi);

  if (boyIdx === girlIdx) return { obtained: 7, maximum: 7, detail: 'Same Rashi' };

  const girlToBoy = (boyIdx - girlIdx + 12) % 12 || 12;
  const boyToGirl = (girlIdx - boyIdx + 12) % 12 || 12;

  const dosha = BHAKOOT_INAUSPICIOUS.has(girlToBoy) || BHAKOOT_INAUSPICIOUS.has(boyToGirl);
  const score = dosha ? 0 : 7;
  return {
    obtained: score,
    maximum: 7,
    detail: `Girl→Boy interval=${girlToBoy}, Boy→Girl interval=${boyToGirl}${dosha ? ' (Bhakoot Dosha)' : ''}`,
  };
}

function calcNadi(boyNak, girlNak) {
  const boyNadi = NADI_MAP[boyNak];
  const girlNadi = NADI_MAP[girlNak];
  if (!boyNadi || !girlNadi) return { obtained: 8, maximum: 8, detail: 'Unknown Nadi, defaulting compatible' };

  const score = boyNadi === girlNadi ? 0 : 8;
  return {
    obtained: score,
    maximum: 8,
    detail: `Boy=${boyNadi}, Girl=${girlNadi}${score === 0 ? ' — Nadi Dosha (same Nadi)' : ''}`,
  };
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Calculate full Ashta Koota / Guna Milan between two users.
 *
 * @param {object} kundaliA — StandardKundali for user A (boy perspective for Varna/Gana)
 * @param {object} kundaliB — StandardKundali for user B (girl perspective for Varna/Gana)
 * @param {string} genderA  — 'Male' | 'Female'
 * @param {string} genderB  — 'Male' | 'Female'
 * @returns {object} GunaMilanResult
 */
function calculateGunaMilan(kundaliA, genderA, kundaliB, genderB) {
  // Assign boy/girl perspective (affects Varna and Gana scoring direction)
  const [boyKundali, girlKundali] = genderA === 'Male'
    ? [kundaliA, kundaliB]
    : [kundaliB, kundaliA];

  const boyRashi = boyKundali.chart.rashi;
  const girlRashi = girlKundali.chart.rashi;
  const boyNak = boyKundali.chart.nakshatra;
  const girlNak = girlKundali.chart.nakshatra;

  const varna       = calcVarna(boyRashi, girlRashi);
  const vashya      = calcVashya(boyRashi, girlRashi);
  const tara        = calcTara(boyNak, girlNak);
  const yoni        = calcYoni(boyNak, girlNak);
  const grahaMaitri = calcGrahaMaitri(boyRashi, girlRashi);
  const gana        = calcGana(boyNak, girlNak);
  const bhakoot     = calcBhakoot(boyRashi, girlRashi);
  const nadi        = calcNadi(boyNak, girlNak);

  const total = varna.obtained + vashya.obtained + tara.obtained + yoni.obtained
              + grahaMaitri.obtained + gana.obtained + bhakoot.obtained + nadi.obtained;

  // Identify special doshas
  const doshas = [];
  if (nadi.obtained === 0)    doshas.push('Nadi Dosha');
  if (bhakoot.obtained === 0) doshas.push('Bhakoot Dosha');
  if (gana.obtained === 0)    doshas.push('Gana Dosha');

  return {
    varna,
    vashya,
    tara,
    yoni,
    grahaMaitri,
    gana,
    bhakoot,
    nadi,
    total,
    maximum: 36,
    isEligible: total >= GUNA_THRESHOLD,
    doshas,
  };
}

module.exports = { calculateGunaMilan, GUNA_THRESHOLD };
