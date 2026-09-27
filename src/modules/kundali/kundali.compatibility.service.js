'use strict';

/**
 * Kundali Compatibility Service
 *
 * Deterministic structural compatibility analysis between two Kundalis.
 * This is separate from Guna Milan (Ashta Koota) — it analyses Rashi,
 * Nakshatra, and planetary relationships.
 *
 * RULE: This module does NOT call an LLM. All outputs are calculated from
 * the structured Kundali data using documented rules.
 *
 * The AI explanation layer consumes the output of this service —
 * it does NOT produce these values.
 */

// ─── Rashi relationship table ─────────────────────────────────────────────────
// Based on standard Vedic rashi friendship classifications

const RASHI_LIST = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

const RASHI_ELEMENT = {
  Aries: 'Fire', Taurus: 'Earth', Gemini: 'Air', Cancer: 'Water',
  Leo: 'Fire', Virgo: 'Earth', Libra: 'Air', Scorpio: 'Water',
  Sagittarius: 'Fire', Capricorn: 'Earth', Aquarius: 'Air', Pisces: 'Water',
};

const RASHI_QUALITY = {
  Aries: 'Cardinal', Taurus: 'Fixed', Gemini: 'Mutable',
  Cancer: 'Cardinal', Leo: 'Fixed', Virgo: 'Mutable',
  Libra: 'Cardinal', Scorpio: 'Fixed', Sagittarius: 'Mutable',
  Capricorn: 'Cardinal', Aquarius: 'Fixed', Pisces: 'Mutable',
};

// Nakshatra lords (in the sequence of Vimshottari dasha)
const NAKSHATRA_LORDS = {
  Ketu: ['Ashwini','Magha','Mula'],
  Venus: ['Bharani','Purva Phalguni','Purva Ashadha'],
  Sun: ['Krittika','Uttara Phalguni','Uttara Ashadha'],
  Moon: ['Rohini','Hasta','Shravana'],
  Mars: ['Mrigashira','Chitra','Dhanishtha'],
  Rahu: ['Ardra','Swati','Shatabhisha'],
  Jupiter: ['Punarvasu','Vishakha','Purva Bhadrapada'],
  Saturn: ['Pushya','Anuradha','Uttara Bhadrapada'],
  Mercury: ['Ashlesha','Jyeshtha','Revati'],
};

function getNakshatraLord(nakshatra) {
  for (const [lord, naks] of Object.entries(NAKSHATRA_LORDS)) {
    if (naks.includes(nakshatra)) return lord;
  }
  return null;
}

function getRashiIndex(rashi) {
  return RASHI_LIST.indexOf(rashi);
}

function getRashiInterval(rashiA, rashiB) {
  const ia = getRashiIndex(rashiA);
  const ib = getRashiIndex(rashiB);
  if (ia === -1 || ib === -1) return null;
  return Math.min((ib - ia + 12) % 12, (ia - ib + 12) % 12);
}

// ─── Rashi compatibility ──────────────────────────────────────────────────────

function analyzeRashi(rashiA, rashiB) {
  const elemA = RASHI_ELEMENT[rashiA];
  const elemB = RASHI_ELEMENT[rashiB];
  const qualA = RASHI_QUALITY[rashiA];
  const qualB = RASHI_QUALITY[rashiB];

  // Same element = harmonious
  const sameElement = elemA === elemB;
  // Complementary element pairs
  const ELEM_COMPLEMENT = { Fire: 'Air', Air: 'Fire', Earth: 'Water', Water: 'Earth' };
  const complementaryElement = ELEM_COMPLEMENT[elemA] === elemB;

  // Interval-based harmony (trine = 5th/9th = very harmonious, square = 4th/8th = challenging)
  const interval = getRashiInterval(rashiA, rashiB);
  const isTrine = interval === 4 || interval === 0;
  const isSquare = interval === 3 || interval === 9;

  let harmonyLevel;
  if (sameElement || isTrine)       harmonyLevel = 'high';
  else if (complementaryElement)    harmonyLevel = 'moderate';
  else if (isSquare)                harmonyLevel = 'challenging';
  else                               harmonyLevel = 'neutral';

  return {
    rashiA,
    rashiB,
    elementA: elemA,
    elementB: elemB,
    qualityA: qualA,
    qualityB: qualB,
    sameElement,
    harmonyLevel,
    detail: `${rashiA}(${elemA}/${qualA}) ↔ ${rashiB}(${elemB}/${qualB}) — ${harmonyLevel}`,
  };
}

// ─── Nakshatra compatibility ──────────────────────────────────────────────────

function analyzeNakshatra(nakA, padaA, nakB, padaB) {
  const lordA = getNakshatraLord(nakA);
  const lordB = getNakshatraLord(nakB);
  const sameLord = lordA === lordB;
  const samePada = padaA === padaB;

  return {
    nakshatraA: nakA,
    nakshatraB: nakB,
    lordA,
    lordB,
    sameLord,
    padaA,
    padaB,
    samePada,
    note: sameLord
      ? `Both nakshatras share lord ${lordA} — similar temperament`
      : `Different nakshatra lords: ${lordA} and ${lordB}`,
  };
}

// ─── Planetary relationship analysis ─────────────────────────────────────────

function analyzePlanetaryRelations(planetsA, planetsB) {
  if (!planetsA || !planetsB) return null;

  const buildPlanetMap = (planets) =>
    Object.fromEntries(planets.map((p) => [p.planet, p]));

  const mapA = buildPlanetMap(planetsA);
  const mapB = buildPlanetMap(planetsB);

  // Key relationship: whose Jupiter aspects whose Moon (benefic influence)
  const jupA = mapA['Jupiter'];
  const moonB = mapB['Moon'];
  const jupB = mapB['Jupiter'];
  const moonA = mapA['Moon'];

  const TRINE_HOUSES = [1, 5, 9];
  const ASPECT_HOUSES = [1, 4, 7, 10];

  function housesAspect(fromHouse, toHouse) {
    const diff = Math.abs(toHouse - fromHouse);
    return TRINE_HOUSES.includes(diff + 1) || ASPECT_HOUSES.includes(diff + 1);
  }

  const notes = [];
  if (jupA && moonB && housesAspect(jupA.house, moonB.house)) {
    notes.push(`Person A's Jupiter (house ${jupA.house}) harmoniously relates to Person B's Moon (house ${moonB.house})`);
  }
  if (jupB && moonA && housesAspect(jupB.house, moonA.house)) {
    notes.push(`Person B's Jupiter (house ${jupB.house}) harmoniously relates to Person A's Moon (house ${moonA.house})`);
  }

  return {
    notes,
    lagnaHouseRelation: {
      lagnaA: mapA['Sun']?.sign || null,
      lagnaB: mapB['Sun']?.sign || null,
    },
  };
}

// ─── Warnings / doshas ────────────────────────────────────────────────────────

function detectWarnings(kundaliA, kundaliB) {
  const warnings = [];

  // Kuja Dosha (Mangal Dosha): Mars in 1,2,4,7,8,12 from Lagna or Moon
  const MANGAL_DOSHA_HOUSES = new Set([1, 2, 4, 7, 8, 12]);
  for (const [label, kundali] of [['Person A', kundaliA], ['Person B', kundaliB]]) {
    if (!kundali.planets) continue;
    const mars = kundali.planets.find((p) => p.planet === 'Mars');
    if (mars && MANGAL_DOSHA_HOUSES.has(mars.house)) {
      warnings.push(`${label} has Kuja Dosha (Mars in house ${mars.house}). Please consult a qualified astrologer.`);
    }
  }

  return warnings;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Calculate deterministic compatibility between two StandardKundali objects.
 *
 * @param {object} kundaliA
 * @param {object} kundaliB
 * @returns {object} CompatibilityResult
 */
function calculateCompatibility(kundaliA, kundaliB) {
  if (!kundaliA || !kundaliB) {
    throw new Error('Both Kundalis are required for compatibility calculation.');
  }

  const rashi    = analyzeRashi(kundaliA.chart.rashi, kundaliB.chart.rashi);
  const nakshatra = analyzeNakshatra(
    kundaliA.chart.nakshatra, kundaliA.chart.nakshatra_pada,
    kundaliB.chart.nakshatra, kundaliB.chart.nakshatra_pada,
  );
  const planetary = analyzePlanetaryRelations(kundaliA.planets, kundaliB.planets);
  const warnings  = detectWarnings(kundaliA, kundaliB);

  // Overall compatibility signal (heuristic for display, not for ranking)
  const highHarmony = rashi.harmonyLevel === 'high';
  const challenging = rashi.harmonyLevel === 'challenging';
  const compatible = highHarmony || rashi.harmonyLevel === 'moderate';

  return {
    compatible,
    harmonyLevel: rashi.harmonyLevel,
    rashi,
    nakshatra,
    planetary,
    warnings,
  };
}

module.exports = { calculateCompatibility };
