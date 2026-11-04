'use strict';

const svc = require('./community.service');

async function getSects(req, res, next) {
  try {
    const sects = await svc.getAllSects();
    res.json({ success: true, data: sects });
  } catch (err) {
    next(err);
  }
}

async function getSubSects(req, res, next) {
  try {
    const { parentId } = req.query;
    const result = await svc.getSubSects(parentId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function searchCommunity(req, res, next) {
  try {
    const { q } = req.query;
    const results = await svc.search(q);
    res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
}

async function validateSelection(req, res, next) {
  try {
    const { primarySectId, subSectId } = req.body;
    const result = await svc.validateCommunitySelection(primarySectId, subSectId);
    if (!result.valid) {
      return res.status(400).json({ success: false, message: result.reason });
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSects, getSubSects, searchCommunity, validateSelection };
