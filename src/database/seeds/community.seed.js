'use strict';

/**
 * Community Categories Seed
 *
 * Seeds all 34 Primary Sects and their corresponding Sub-Sects into
 * the community_categories table.
 *
 * Rules:
 *   - Primary Sects: parent_id = NULL, category_level = 1
 *   - Sub-Sects    : parent_id = <primary_sect id>, category_level = 2
 *   - Idempotent   : uses INSERT ... ON CONFLICT (slug) DO NOTHING
 *   - Names and parent-child mappings are preserved exactly as specified.
 *
 * Slugs are generated as: kebab-case of the name.
 */

const db = require('../../config/database');

// ─── Taxonomy Data ─────────────────────────────────────────────────────────────
// Format: { name, slug, subSects: [{ name, slug }] }

const TAXONOMY = [
  // ── A. South Indian and related traditions ──────────────────────────────────

  {
    name: 'Vaidiki',
    slug: 'vaidiki',
    subSects: [
      { name: 'Velanadu',         slug: 'vaidiki-velanadu' },
      { name: 'Telaganya',        slug: 'vaidiki-telaganya' },
      { name: 'Vengi',            slug: 'vaidiki-vengi' },
      { name: 'Kasalanadu',       slug: 'vaidiki-kasalanadu' },
      { name: 'Murikinadu',       slug: 'vaidiki-murikinadu' },
      { name: 'Prathamasakha',    slug: 'vaidiki-prathamasakha' },
      { name: 'Vaidiki - Other',  slug: 'vaidiki-other' },
    ],
  },
  {
    name: 'Niyogi',
    slug: 'niyogi',
    subSects: [
      { name: 'Aaruvela Niyogi',            slug: 'niyogi-aaruvela' },
      { name: 'Pankanadu',                  slug: 'niyogi-pankanadu' },
      { name: 'Dillivallabha / Sistanana',  slug: 'niyogi-dillivallabha-sistanana' },
      { name: 'Niyogi - Other',             slug: 'niyogi-other' },
    ],
  },
  {
    name: 'Smartha & Others',
    slug: 'smartha-and-others',
    subSects: [
      { name: 'Dravula / Dravidulu', slug: 'smartha-others-dravula-dravidulu' },
      { name: 'Kavilinga',           slug: 'smartha-others-kavilinga' },
    ],
  },
  {
    name: 'Vaishnava / Madhwa',
    slug: 'vaishnava-madhwa',
    subSects: [
      { name: 'Karnataka Madhwa', slug: 'vaishnava-madhwa-karnataka' },
      { name: 'Vaikhanasa',       slug: 'vaishnava-madhwa-vaikhanasa' },
      { name: 'Pancharatra',      slug: 'vaishnava-madhwa-pancharatra' },
    ],
  },
  {
    name: 'Smartha',
    slug: 'smartha',
    subSects: [
      { name: 'Havyaka',      slug: 'smartha-havyaka' },
      { name: 'Hoysalnatha',  slug: 'smartha-hoysalnatha' },
      { name: 'Badaganadu',   slug: 'smartha-badaganadu' },
      { name: 'Sankethi',     slug: 'smartha-sankethi' },
      { name: 'Kota',         slug: 'smartha-kota' },
      { name: 'Mulukanadu',   slug: 'smartha-mulukanadu' },
    ],
  },
  {
    name: 'Madhwa',
    slug: 'madhwa',
    subSects: [
      { name: 'Deshastha Madhwa',  slug: 'madhwa-deshastha' },
      { name: 'Tulu Madhwa',       slug: 'madhwa-tulu' },
      { name: 'Shivalli Madhwa',   slug: 'madhwa-shivalli' },
      { name: 'Karanth / Charaka', slug: 'madhwa-karanth-charaka' },
    ],
  },
  {
    name: 'Sri Vaishnava',
    slug: 'sri-vaishnava',
    subSects: [
      { name: 'Hebbar',      slug: 'sri-vaishnava-hebbar' },
      { name: 'Mandyam',     slug: 'sri-vaishnava-mandyam' },
      { name: 'Ashtagrama',  slug: 'sri-vaishnava-ashtagrama' },
    ],
  },
  {
    name: 'Iyer (Smartha)',
    slug: 'iyer-smartha',
    subSects: [
      { name: 'Vadama',         slug: 'iyer-vadama' },
      { name: 'Brahacharanam',  slug: 'iyer-brahacharanam' },
      { name: 'Vathima',        slug: 'iyer-vathima' },
      { name: 'Ashtasahasram',  slug: 'iyer-ashtasahasram' },
      { name: 'Kacha Nadu',     slug: 'iyer-kacha-nadu' },
      { name: 'Dikshitar',      slug: 'iyer-dikshitar' },
    ],
  },
  {
    name: 'Iyengar (Vaishnava)',
    slug: 'iyengar-vaishnava',
    subSects: [
      { name: 'Vadakalai',  slug: 'iyengar-vadakalai' },
      { name: 'Thenkalai',  slug: 'iyengar-thenkalai' },
    ],
  },
  {
    name: 'Madhwa Diaspora',
    slug: 'madhwa-diaspora',
    subSects: [
      { name: 'Kannada / Deshastha Madhwa (TN Branch)', slug: 'madhwa-diaspora-kannada-deshastha-tn' },
    ],
  },
  {
    name: 'Namboodiri',
    slug: 'namboodiri',
    subSects: [
      { name: 'Vaidika Namboodiri',  slug: 'namboodiri-vaidika' },
      { name: 'Srauta Namboodiri',   slug: 'namboodiri-srauta' },
      { name: 'Savarna Namboodiri',  slug: 'namboodiri-savarna' },
    ],
  },
  {
    name: 'Other Groups',
    slug: 'other-groups',
    subSects: [
      { name: 'Embrandiri',       slug: 'other-groups-embrandiri' },
      { name: 'Potti',            slug: 'other-groups-potti' },
      { name: 'Pushpaka / Unni',  slug: 'other-groups-pushpaka-unni' },
    ],
  },

  // ── B. West Indian traditions ────────────────────────────────────────────────

  {
    name: 'Deshastha',
    slug: 'deshastha',
    subSects: [
      { name: 'Deshastha Rigvedi',   slug: 'deshastha-rigvedi' },
      { name: 'Deshastha Yajurvedi', slug: 'deshastha-yajurvedi' },
    ],
  },
  {
    name: 'Chitpavan / Konkanastha',
    slug: 'chitpavan-konkanastha',
    subSects: [
      { name: 'Konkanastha', slug: 'chitpavan-konkanastha-konkanastha' },
    ],
  },
  {
    name: 'Karhade & Others',
    slug: 'karhade-and-others',
    subSects: [
      { name: 'Karhade',   slug: 'karhade-and-others-karhade' },
      { name: 'Deorukhe',  slug: 'karhade-and-others-deorukhe' },
    ],
  },
  {
    name: 'Saraswat',
    slug: 'saraswat',
    subSects: [
      { name: 'Gauda Saraswat (GSB)', slug: 'saraswat-gsb' },
      { name: 'Rajapurkar',           slug: 'saraswat-rajapurkar' },
      { name: 'Kudaldeshkar',         slug: 'saraswat-kudaldeshkar' },
    ],
  },
  {
    name: 'Nagar',
    slug: 'nagar',
    subSects: [
      { name: 'Vadehra',      slug: 'nagar-vadehra' },
      { name: 'Sathodra',     slug: 'nagar-sathodra' },
      { name: 'Visnagara',    slug: 'nagar-visnagara' },
      { name: 'Prashnora',    slug: 'nagar-prashnora' },
      { name: 'Krishnapura',  slug: 'nagar-krishnapura' },
    ],
  },
  {
    name: 'Audichya',
    slug: 'audichya',
    subSects: [
      { name: 'Audichya Sahasra', slug: 'audichya-sahasra' },
      { name: 'Audichya Zalori',  slug: 'audichya-zalori' },
    ],
  },
  {
    name: 'Other Gujarati Groups',
    slug: 'other-gujarati-groups',
    subSects: [
      { name: 'Anavil',    slug: 'other-gujarati-anavil' },
      { name: 'Khedaval',  slug: 'other-gujarati-khedaval' },
      { name: 'Modh',      slug: 'other-gujarati-modh' },
      { name: 'Shrimali',  slug: 'other-gujarati-shrimali' },
      { name: 'Girnara',   slug: 'other-gujarati-girnara' },
    ],
  },

  // ── C. North Indian traditions ───────────────────────────────────────────────

  {
    name: 'Kanyakubja',
    slug: 'kanyakubja',
    subSects: [
      { name: 'Kanyakubja - Main',   slug: 'kanyakubja-main' },
      { name: 'Sarvariya branches',  slug: 'kanyakubja-sarvariya' },
    ],
  },
  {
    name: 'Saryupareen',
    slug: 'saryupareen',
    subSects: [
      { name: 'Saryupareen - Standard', slug: 'saryupareen-standard' },
    ],
  },
  {
    name: 'Gaur & Sanadhya',
    slug: 'gaur-and-sanadhya',
    subSects: [
      { name: 'Gaur',           slug: 'gaur-sanadhya-gaur' },
      { name: 'Sanad / Sanadhya', slug: 'gaur-sanadhya-sanad' },
      { name: 'Jajautia',       slug: 'gaur-sanadhya-jajautia' },
      { name: 'Brajwasi',       slug: 'gaur-sanadhya-brajwasi' },
    ],
  },
  {
    name: 'Pahari (Hill Brahmins)',
    slug: 'pahari-hill-brahmins',
    subSects: [
      { name: 'Kumaoni',    slug: 'pahari-kumaoni' },
      { name: 'Garhwali',   slug: 'pahari-garhwali' },
      { name: 'Joshi',      slug: 'pahari-joshi' },
      { name: 'Pant',       slug: 'pahari-pant' },
      { name: 'Upadhyay',   slug: 'pahari-upadhyay' },
      { name: 'Bahuguna',   slug: 'pahari-bahuguna' },
    ],
  },
  {
    name: 'Pushkarna & Shrimali',
    slug: 'pushkarna-and-shrimali',
    subSects: [
      { name: 'Pushkarna',  slug: 'pushkarna-shrimali-pushkarna' },
      { name: 'Shrimali',   slug: 'pushkarna-shrimali-shrimali' },
    ],
  },
  {
    name: 'Srigoud & Paliwal',
    slug: 'srigoud-and-paliwal',
    subSects: [
      { name: 'Srigoud / Rajgor', slug: 'srigoud-paliwal-srigoud-rajgor' },
      { name: 'Paliwal',          slug: 'srigoud-paliwal-paliwal' },
      { name: 'Dahima',           slug: 'srigoud-paliwal-dahima' },
      { name: 'Khandelwal',       slug: 'srigoud-paliwal-khandelwal' },
    ],
  },
  {
    name: 'Kashmiri Pandits',
    slug: 'kashmiri-pandits',
    subSects: [
      { name: 'Karkun',          slug: 'kashmiri-pandits-karkun' },
      { name: 'Ahori / Bhasha',  slug: 'kashmiri-pandits-ahori-bhasha' },
    ],
  },
  {
    name: 'Mohyal Brahmins',
    slug: 'mohyal-brahmins',
    subSects: [
      { name: 'Bali',     slug: 'mohyal-bali' },
      { name: 'Bhimwal',  slug: 'mohyal-bhimwal' },
      { name: 'Chhibber', slug: 'mohyal-chhibber' },
      { name: 'Datt',     slug: 'mohyal-datt' },
      { name: 'Lau',      slug: 'mohyal-lau' },
      { name: 'Mohan',    slug: 'mohyal-mohan' },
      { name: 'Vaid',     slug: 'mohyal-vaid' },
    ],
  },
  {
    name: 'North-Western Plains',
    slug: 'north-western-plains',
    subSects: [
      { name: 'Gaur',              slug: 'nwp-gaur' },
      { name: 'Taga',              slug: 'nwp-taga' },
      { name: 'Himachali / Dogra', slug: 'nwp-himachali-dogra' },
      { name: 'Sharma',            slug: 'nwp-sharma' },
      { name: 'Awasthi',           slug: 'nwp-awasthi' },
      { name: 'Dixit',             slug: 'nwp-dixit' },
    ],
  },

  // ── D. East Indian traditions ────────────────────────────────────────────────

  {
    name: 'Maithil',
    slug: 'maithil',
    subSects: [
      { name: 'Srotriya',               slug: 'maithil-srotriya' },
      { name: 'Yogabhyasi',             slug: 'maithil-yogabhyasi' },
      { name: 'Panji-verified lineages', slug: 'maithil-panji-verified' },
    ],
  },
  {
    name: 'Magahia & Kanauji',
    slug: 'magahia-and-kanauji',
    subSects: [
      { name: 'Magahia Brahmins',             slug: 'magahia-kanauji-magahia' },
      { name: 'Kanauji (Bihar Branch)',        slug: 'magahia-kanauji-kanauji-bihar' },
      { name: 'Bhimhar - Cultural Alignment',  slug: 'magahia-kanauji-bhimhar' },
    ],
  },
  {
    name: 'Radhi & Varendra',
    slug: 'radhi-and-varendra',
    subSects: [
      { name: 'Radhi',    slug: 'radhi-varendra-radhi' },
      { name: 'Varendra', slug: 'radhi-varendra-varendra' },
    ],
  },
  {
    name: 'Vaidika',
    slug: 'vaidika',
    subSects: [
      { name: 'Paschatya Vaidika',   slug: 'vaidika-paschatya' },
      { name: 'Dakshinatya Vaidika', slug: 'vaidika-dakshinatya' },
    ],
  },
  {
    name: 'Sakadwipi / Magha',
    slug: 'sakadwipi-magha',
    subSects: [
      { name: 'Sakadwipi', slug: 'sakadwipi-magha-sakadwipi' },
      { name: 'Magha',     slug: 'sakadwipi-magha-magha' },
    ],
  },
  {
    name: 'Utkala',
    slug: 'utkala',
    subSects: [
      { name: 'Jhadua',                    slug: 'utkala-jhadua' },
      { name: 'Halua',                     slug: 'utkala-halua' },
      { name: 'Sankual',                   slug: 'utkala-sankual' },
      { name: 'Jajpuria / Dakhinparsia',   slug: 'utkala-jajpuria-dakhinparsia' },
    ],
  },
];

// ─── Seed Function ──────────────────────────────────────────────────────────────

async function seedCommunityCategories(client) {
  const runner = client || db;

  console.log('[seed:community] Starting community_categories seed...');

  let primaryCount = 0;
  let subSectCount = 0;

  for (let i = 0; i < TAXONOMY.length; i++) {
    const sect = TAXONOMY[i];

    // Insert Primary Sect (level 1), ignore if slug already exists
    const primRes = await runner.query(
      `
      INSERT INTO community_categories (name, slug, parent_id, category_level, display_order)
      VALUES ($1, $2, NULL, 1, $3)
      ON CONFLICT (slug) DO NOTHING
      RETURNING id
      `,
      [sect.name, sect.slug, (i + 1) * 10]
    );

    // Retrieve the id (whether just inserted or pre-existing)
    const parentRow = await runner.query(
      'SELECT id FROM community_categories WHERE slug = $1',
      [sect.slug]
    );
    const parentId = parentRow.rows[0]?.id;
    if (!parentId) {
      console.error(`[seed:community] Could not find/insert primary sect: ${sect.slug}`);
      continue;
    }

    if (primRes.rowCount > 0) primaryCount++;

    // Insert Sub-Sects (level 2)
    for (let j = 0; j < sect.subSects.length; j++) {
      const sub = sect.subSects[j];
      const subRes = await runner.query(
        `
        INSERT INTO community_categories (name, slug, parent_id, category_level, display_order)
        VALUES ($1, $2, $3, 2, $4)
        ON CONFLICT (slug) DO NOTHING
        `,
        [sub.name, sub.slug, parentId, (j + 1) * 10]
      );
      if (subRes.rowCount > 0) subSectCount++;
    }
  }

  console.log(
    `[seed:community] Done. Inserted ${primaryCount} primary sects, ${subSectCount} sub-sects.`
  );

  return { primaryCount, subSectCount };
}

module.exports = { seedCommunityCategories, TAXONOMY };

if (require.main === module) {
  require('dotenv').config();
  const { closePool } = require('../../config/database');
  seedCommunityCategories()
    .then((res) => {
      console.log('[seed:community] Completed successfully:', res);
      return closePool();
    })
    .catch((err) => {
      console.error('[seed:community] Failed:', err);
      process.exitCode = 1;
      return closePool();
    });
}
