import { body } from 'express-validator';

/**
 * Standard password policy requirements:
 * - Minimum 8 characters
 * - Maximum 128 characters
 * - At least one uppercase letter (A-Z)
 * - At least one lowercase letter (a-z)
 * - At least one numerical digit (0-9)
 * - At least one special character / symbol
 */
export const PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 128,
  hasUppercase: /[A-Z]/,
  hasLowercase: /[a-z]/,
  hasDigit: /[0-9]/,
  hasSpecial: /[^A-Za-z0-9]/,
};

/**
 * Validates a password string against the standard security policy.
 * Safe for use in controllers and validation logic.
 *
 * @param {any} password
 * @returns {{ isValid: boolean, message?: string }}
 */
export const validatePasswordPolicy = (password) => {
  if (typeof password !== 'string') {
    return { isValid: false, message: 'Password must be a string' };
  }
  if (password.length < PASSWORD_POLICY.minLength || password.length > PASSWORD_POLICY.maxLength) {
    return {
      isValid: false,
      message: `Password must be between ${PASSWORD_POLICY.minLength} and ${PASSWORD_POLICY.maxLength} characters`,
    };
  }
  if (!PASSWORD_POLICY.hasUppercase.test(password)) {
    return { isValid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!PASSWORD_POLICY.hasLowercase.test(password)) {
    return { isValid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!PASSWORD_POLICY.hasDigit.test(password)) {
    return { isValid: false, message: 'Password must contain at least one digit' };
  }
  if (!PASSWORD_POLICY.hasSpecial.test(password)) {
    return { isValid: false, message: 'Password must contain at least one special character' };
  }
  return { isValid: true };
};

/**
 * Express-validator middleware rule enforcing the password security policy.
 * Emits descriptive validation errors for client forms.
 *
 * @param {string} fieldName - Field to validate (e.g. 'password' or 'newPassword')
 * @returns {import('express-validator').ValidationChain}
 */
export const passwordComplexityValidator = (fieldName = 'password') => {
  const label = fieldName === 'newPassword' ? 'New password' : 'Password';
  return body(fieldName)
    .isString().withMessage(`${label} must be a string`)
    .isLength({ min: PASSWORD_POLICY.minLength, max: PASSWORD_POLICY.maxLength })
    .withMessage(`${label} must be between ${PASSWORD_POLICY.minLength} and ${PASSWORD_POLICY.maxLength} characters`)
    .matches(PASSWORD_POLICY.hasUppercase)
    .withMessage(`${label} must contain at least one uppercase letter`)
    .matches(PASSWORD_POLICY.hasLowercase)
    .withMessage(`${label} must contain at least one lowercase letter`)
    .matches(PASSWORD_POLICY.hasDigit)
    .withMessage(`${label} must contain at least one digit`)
    .matches(PASSWORD_POLICY.hasSpecial)
    .withMessage(`${label} must contain at least one special character`);
};
