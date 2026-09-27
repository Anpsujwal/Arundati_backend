/**
 * backfill_kundali.js - Run from backend/ directory
 * Geocodes missing birth coordinates and triggers kundali generation
 * for all approved users.
 *
 * Usage: node backfill_kundali.js
 */
"use strict";

const Database = require("./node_modules/better-sqlite3");
const path = require("path");

const DB_PATH = path.resolve(__dirname, "data/arundhati.db");
const ASTRO_URL = process.env.ASTRO_SERVICE_URL || "http://localhost:8000";

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const KUNDALI_STATUS = {
  NOT_GENERATED:         "NOT_GENERATED",
  GENERATING:            "GENERATING",
  GENERATED:             "GENERATED",
  FAILED:                "FAILED",
  INCOMPLETE_BIRTH_DATA: "INCOMPLETE_BIRTH_DATA",
};

async function geocode(place) {
  try {
    const url = `${ASTRO_URL}/geocode?place=${encodeURIComponent(place)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const d = await r.json();
    return d.found ? { latitude: d.latitude, longitude: d.longitude } : null;
  } catch { return null; }
}

function upsertKundali(userId, status, extra = {}) {
  const row = db.prepare("SELECT kundali_id FROM kundalis WHERE user_id = ?").get(userId);
  if (row) {
    const sets = ["kundali_status = ?", "updated_at = CURRENT_TIMESTAMP"];
    const vals = [status];
    for (const [k, v] of Object.entries(extra)) { sets.push(`${k} = ?`); vals.push(v ?? null); }
    vals.push(userId);
    db.prepare(`UPDATE kundalis SET ${sets.join(", ")} WHERE user_id = ?`).run(...vals);
  } else {
    db.prepare(`INSERT INTO kundalis (user_id,kundali_status,lagna,rashi,nakshatra,nakshatra_pada,birth_data,planetary_data,house_data,provider,provider_version,calculation_config,failure_reason,generated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(userId, status, extra.lagna??null, extra.rashi??null, extra.nakshatra??null, extra.nakshatra_pada??null, extra.birth_data??null, extra.planetary_data??null, extra.house_data??null, extra.provider??null, extra.provider_version??null, extra.calculation_config??null, extra.failure_reason??null, extra.generated_at??null);
  }
}

async function generate(userId, bd) {
  upsertKundali(userId, KUNDALI_STATUS.GENERATING);
  try {
    const r = await fetch(`${ASTRO_URL}/kundali/generate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bd), signal: AbortSignal.timeout(30000)
    });
    if (!r.ok) { const b = await r.json().catch(()=>({})); throw new Error(`HTTP ${r.status}: ${b.detail||b.error}`); }
    const k = await r.json();
    upsertKundali(userId, KUNDALI_STATUS.GENERATED, {
      lagna: k.chart.lagna, rashi: k.chart.rashi, nakshatra: k.chart.nakshatra, nakshatra_pada: k.chart.nakshatra_pada,
      birth_data: JSON.stringify(k.birth), planetary_data: JSON.stringify(k.planets), house_data: JSON.stringify(k.houses),
      provider: k.meta.provider, provider_version: k.meta.provider_version,
      calculation_config: JSON.stringify({ ayanamsa: k.meta.ayanamsa, house_system: k.meta.house_system }),
      failure_reason: null, generated_at: k.meta.generated_at
    });
    console.log(`  OK  user ${userId}: Lagna=${k.chart.lagna} Rashi=${k.chart.rashi} Nakshatra=${k.chart.nakshatra}`);
  } catch(e) {
    upsertKundali(userId, KUNDALI_STATUS.FAILED, { failure_reason: e.message });
    console.log(`  ERR user ${userId}: ${e.message}`);
  }
}

async function main() {
  console.log("Kundali Backfill | DB:", DB_PATH, "| Service:", ASTRO_URL);
  try {
    const hc = await fetch(`${ASTRO_URL}/health`, { signal: AbortSignal.timeout(5000) });
    if (!hc.ok) throw new Error();
    console.log("Astrology service: OK\n");
  } catch { console.error("ERROR: Astrology service unreachable at", ASTRO_URL); process.exit(1); }

  const users = db.prepare(`
    SELECT u.user_id, u.email, p.date_of_birth,
           a.birth_time, a.birth_place, a.latitude, a.longitude, a.timezone,
           k.kundali_status
    FROM users u
    JOIN profiles p ON p.user_id = u.user_id
    LEFT JOIN astro_data a ON a.profile_id = p.profile_id
    LEFT JOIN kundalis k ON k.user_id = u.user_id
    WHERE u.account_status = 'Approved' ORDER BY u.user_id
  `).all();
  console.log(`Found ${users.length} approved users.\n`);

  console.log("Step 1: Geocoding missing coordinates");
  for (const u of users) {
    if (u.birth_place && (u.latitude == null || u.longitude == null)) {
      console.log(`  User ${u.user_id}: geocoding "${u.birth_place}"...`);
      const c = await geocode(u.birth_place);
      if (c) {
        db.prepare("UPDATE astro_data SET latitude=?,longitude=? WHERE profile_id=(SELECT profile_id FROM profiles WHERE user_id=?)").run(c.latitude, c.longitude, u.user_id);
        u.latitude = c.latitude; u.longitude = c.longitude;
        console.log(`    -> (${c.latitude}, ${c.longitude})`);
      } else { console.log("    -> geocoding failed, no coords"); }
    }
  }

  console.log("\nStep 2: Generating kundalis");
  for (const u of users) {
    if (u.kundali_status === "GENERATED") { console.log(`  User ${u.user_id}: already GENERATED, skip`); continue; }
    const astro = db.prepare("SELECT a.* FROM astro_data a JOIN profiles p ON p.profile_id=a.profile_id WHERE p.user_id=?").get(u.user_id);
    const lat = astro?.latitude, lng = astro?.longitude;
    const missing = [];
    if (!u.date_of_birth) missing.push("date_of_birth");
    if (!astro?.birth_time) missing.push("birth_time");
    if (!astro?.birth_place) missing.push("birth_place");
    if (lat==null) missing.push("latitude");
    if (lng==null) missing.push("longitude");
    if (!astro?.timezone) missing.push("timezone");
    if (missing.length) {
      console.log(`  User ${u.user_id}: INCOMPLETE (${missing.join(", ")})`);
      upsertKundali(u.user_id, KUNDALI_STATUS.INCOMPLETE_BIRTH_DATA, { failure_reason: "Missing: "+missing.join(", ") });
      continue;
    }
    process.stdout.write(`  User ${u.user_id}: generating... `);
    await generate(u.user_id, { date_of_birth: u.date_of_birth, birth_time: astro.birth_time, birth_place: astro.birth_place, latitude: Number(lat), longitude: Number(lng), timezone: astro.timezone });
  }
  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
