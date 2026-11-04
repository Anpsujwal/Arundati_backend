'use strict';

const db = require('../../config/database');

// ─── GET all Primary Sects (level 1) ─────────────────────────────────────────

async function getAllSects() {
  const rows = await db.queryRows(`
    SELECT id, name, slug, display_order
    FROM community_categories
    WHERE category_level = 1 AND is_active = TRUE
    ORDER BY display_order ASC, name ASC
  `);
  return rows;
}

// ─── GET Sub-Sects by parent Primary Sect id ──────────────────────────────────

async function getSubSects(parentId) {
  if (!parentId) {
    const err = new Error('parentId is required.');
    err.statusCode = 400;
    throw err;
  }

  // Validate parentId is an integer
  const pid = parseInt(parentId, 10);
  if (isNaN(pid)) {
    const err = new Error('parentId must be a valid integer.');
    err.statusCode = 400;
    throw err;
  }

  // Confirm parent exists and is a Primary Sect
  const parent = await db.queryOne(
    'SELECT id, name, slug FROM community_categories WHERE id = $1 AND category_level = 1 AND is_active = TRUE',
    [pid]
  );
  if (!parent) {
    const err = new Error('Primary Sect not found or inactive.');
    err.statusCode = 404;
    throw err;
  }

  const rows = await db.queryRows(`
    SELECT id, name, slug, parent_id, display_order
    FROM community_categories
    WHERE parent_id = $1 AND category_level = 2 AND is_active = TRUE
    ORDER BY display_order ASC, name ASC
  `, [pid]);

  return { parent, subSects: rows };
}

// ─── Unified Search (Primary Sect + Sub-Sect) ─────────────────────────────────

async function search(query) {
  if (!query || !query.trim()) {
    return [];
  }

  const q = query.trim();
  const likePattern = `%${q}%`;

  // Search across both levels; join sub-sects with their parent name
  const rows = await db.queryRows(`
    SELECT
      c.id,
      c.name,
      c.slug,
      c.category_level,
      c.parent_id,
      p.id   AS parent_id_val,
      p.name AS primary_sect_name,
      p.slug AS primary_sect_slug
    FROM community_categories c
    LEFT JOIN community_categories p
      ON c.parent_id = p.id AND p.category_level = 1
    WHERE c.is_active = TRUE
      AND c.name ILIKE $1
    ORDER BY
      c.category_level ASC,
      c.display_order ASC,
      c.name ASC
    LIMIT 30
  `, [likePattern]);

  return rows.map((r) => ({
    id:               r.id,
    name:             r.name,
    slug:             r.slug,
    categoryLevel:    r.category_level,
    parentId:         r.parent_id,
    primarySectName:  r.category_level === 1 ? r.name : r.primary_sect_name,
    primarySectSlug:  r.category_level === 1 ? r.slug : r.primary_sect_slug,
    primarySectId:    r.category_level === 1 ? r.id   : r.parent_id,
  }));
}

// ─── Validate a Primary Sect + Sub-Sect combination ──────────────────────────

async function validateCommunitySelection(primarySectId, subSectId) {
  if (!primarySectId || !subSectId) {
    return { valid: false, reason: 'Both primarySectId and subSectId are required.' };
  }

  const pid = parseInt(primarySectId, 10);
  const sid = parseInt(subSectId, 10);
  if (isNaN(pid) || isNaN(sid)) {
    return { valid: false, reason: 'IDs must be valid integers.' };
  }

  const sub = await db.queryOne(
    `SELECT id, name, parent_id FROM community_categories
     WHERE id = $1 AND category_level = 2 AND is_active = TRUE`,
    [sid]
  );

  if (!sub) return { valid: false, reason: 'Sub-Sect not found or inactive.' };
  if (sub.parent_id !== pid) {
    return { valid: false, reason: 'Sub-Sect does not belong to the selected Primary Sect.' };
  }

  return { valid: true };
}

// ─── Submit a custom "Other / Not Listed" community entry ─────────────────────

async function submitCustomCommunity(userId, { customName, level, parentId }) {
  // Store the custom value on the profile row and flag for admin review
  if (level === 'primary') {
    await db.query(
      `UPDATE profiles SET
         primary_sect              = NULL,
         sub_sect                  = NULL,
         community_custom_name     = $1,
         community_custom_pending  = TRUE,
         updated_at                = CURRENT_TIMESTAMP
       WHERE user_id = $2`,
      [customName, userId]
    );
  } else {
    // sub-sect level — keep the selected primary sect, custom sub-sect
    await db.query(
      `UPDATE profiles SET
         sub_sect                  = NULL,
         community_custom_name     = $1,
         community_custom_pending  = TRUE,
         updated_at                = CURRENT_TIMESTAMP
       WHERE user_id = $2`,
      [customName, userId]
    );
  }
  return { success: true, pending: true, message: 'Custom community entry submitted for admin review.' };
}

module.exports = {
  getAllSects,
  getSubSects,
  search,
  validateCommunitySelection,
  submitCustomCommunity,
};
