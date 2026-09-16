'use strict';

const { body, validationResult } = require('express-validator');

const registerValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.'),
  body('profile_managed_by')
    .isIn(['Self', 'Parent', 'Sibling', 'Joint'])
    .withMessage('Invalid profile managed by value.'),
];

const loginValidation = [
  body('email').trim().isEmail().withMessage('Valid email required.').normalizeEmail(),
  body('password').notEmpty().withMessage('Password required.'),
];

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

module.exports = { registerValidation, loginValidation, validate };
