import { validationResult } from 'express-validator';
export {
  PASSWORD_POLICY,
  validatePasswordPolicy,
  passwordComplexityValidator,
} from '../utils/passwordPolicy.js';

export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }
  next();
};

