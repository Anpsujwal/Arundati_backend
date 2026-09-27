'use strict';

/**
 * Kundali Explanation Service — AI Layer
 *
 * ARCHITECTURE RULE:
 *   This service is called AFTER all deterministic calculations are complete.
 *   It receives a structured MatchResult and produces a human-readable explanation.
 *
 *   The AI must NOT:
 *     - Calculate planetary positions
 *     - Compute Guna Milan points
 *     - Decide Gotra eligibility
 *     - Invent astrological data
 *
 *   The AI MUST:
 *     - Explain what the structured results mean in plain language
 *     - Frame interpretations as traditional astrology observations
 *     - Include a disclaimer that these are not scientific predictions
 *
 * CURRENT STATE: Stubbed — returns a structured template explanation
 * until an AI provider is configured.
 *
 * TO ACTIVATE:
 *   1. Set AI_PROVIDER=gemini (or openai) in .env
 *   2. Set AI_API_KEY in .env
 *   3. Replace the stub implementation below with provider call.
 */

const env = require('../../config/env');

const DISCLAIMER = [
  'This interpretation is based on traditional Vedic astrology principles.',
  'It is provided for informational and cultural purposes only.',
  'It is not a scientific prediction and should not be the sole basis for matrimonial decisions.',
  'Please consult a qualified Vedic astrologer for a detailed reading.',
].join(' ');

/**
 * Build a structured text explanation from a match result.
 * Stub implementation — does not call any LLM.
 *
 * @param {object} matchResult — complete structured match result
 * @returns {Promise<object>} { explanation: string, disclaimer: string, generatedBy: string }
 */
async function generateExplanation(matchResult) {
  const { gunaMilan, kundali, preferences } = matchResult;

  // ── Stub: template-based explanation ────────────────────────────────────────
  // This produces a useful explanation even without an AI provider.
  // When an AI provider is configured, replace this block with the provider call.

  const lines = [];

  // Guna Milan summary
  if (gunaMilan) {
    const total = gunaMilan.total;
    const max = gunaMilan.maximum;
    let gunaInterpretation;
    if (total >= 32)       gunaInterpretation = 'an excellent match with very high compatibility';
    else if (total >= 28)  gunaInterpretation = 'a very good match';
    else if (total >= 24)  gunaInterpretation = 'a good match with solid compatibility';
    else if (total >= 18)  gunaInterpretation = 'an acceptable match (above the traditional minimum threshold)';
    else                   gunaInterpretation = 'a match that falls below the traditional minimum threshold';

    lines.push(
      `**Ashta Koota Score: ${total}/${max}** — According to traditional Vedic astrology, this indicates ${gunaInterpretation}.`
    );

    if (gunaMilan.doshas?.length > 0) {
      lines.push(
        `Note: The following doshas have been identified — ${gunaMilan.doshas.join(', ')}. ` +
        'These are traditional compatibility concerns and should be discussed with a qualified astrologer.'
      );
    }
  }

  // Kundali compatibility summary
  if (kundali?.compatibility) {
    const comp = kundali.compatibility;
    if (comp.rashi) {
      lines.push(
        `**Rashi Compatibility**: The Moon signs (${comp.rashi.rashiA} and ${comp.rashi.rashiB}) ` +
        `share ${comp.rashi.sameElement ? 'the same element' : `different elements (${comp.rashi.elementA} and ${comp.rashi.elementB})`}. ` +
        `Harmony level is rated as **${comp.rashi.harmonyLevel}**.`
      );
    }
    if (comp.nakshatra) {
      lines.push(
        `**Nakshatra**: Birth stars are ${comp.nakshatra.nakshatraA} (${comp.nakshatra.lordA}) ` +
        `and ${comp.nakshatra.nakshatraB} (${comp.nakshatra.lordB}). ` +
        (comp.nakshatra.sameLord ? 'Both share the same nakshatra lord, suggesting similar temperament.' : '')
      );
    }
    if (comp.warnings?.length > 0) {
      lines.push(`**Points to note**: ${comp.warnings.join(' | ')}`);
    }
  }

  // Preferences
  if (preferences) {
    const prefNotes = [];
    if (preferences.age?.score >= 0.8)       prefNotes.push('age preferences align well');
    if (preferences.location?.score >= 0.8)   prefNotes.push('location preferences align');
    if (preferences.subSect?.score >= 0.8)    prefNotes.push('sub-sect preferences match');
    if (prefNotes.length > 0) {
      lines.push(`**Profile Preferences**: ${prefNotes.join(', ')}.`);
    }
  }

  const explanation = lines.join('\n\n');

  return {
    explanation,
    disclaimer: DISCLAIMER,
    generatedBy: 'template', // Change to 'gemini' or 'openai' when provider configured
  };
}

// ─── Future: AI provider integration ─────────────────────────────────────────
// When ready, implement one of these:
//
// async function _callGemini(prompt) { ... }
// async function _callOpenAI(prompt) { ... }
//
// And replace the stub in generateExplanation() with:
//   const prompt = buildPrompt(matchResult);
//   const response = await _callGemini(prompt);
//   return { explanation: response, disclaimer: DISCLAIMER, generatedBy: 'gemini' };

module.exports = { generateExplanation };
