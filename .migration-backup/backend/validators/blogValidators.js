import { body } from 'express-validator';

export const blogValidation = [
  body('slug').trim().toLowerCase().notEmpty().matches(/^[a-z0-9-]+$/),
  body('title').trim().notEmpty().isLength({ max: 200 }),
  body('excerpt').trim().notEmpty().isLength({ max: 500 }),
  body('body').trim().notEmpty(),
  body('author.name').trim().notEmpty(),
];

// Same field rules as blogValidation, but every field is optional — PATCH is
// a partial update, so a request that only changes e.g. `published` must not
// be rejected for omitting `slug`/`title`/etc.
export const blogUpdateValidation = [
  body('slug').optional().trim().toLowerCase().notEmpty().matches(/^[a-z0-9-]+$/),
  body('title').optional().trim().notEmpty().isLength({ max: 200 }),
  body('excerpt').optional().trim().notEmpty().isLength({ max: 500 }),
  body('body').optional().trim().notEmpty(),
  body('author.name').optional().trim().notEmpty(),
];
