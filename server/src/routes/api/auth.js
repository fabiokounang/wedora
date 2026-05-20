const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../../middleware/auth');
const controller = require('../../controllers/api/authController');
const lifecycle = require('../../controllers/authLifecycleController');
const { loginLimiter, registerLimiter } = require('../../middleware/rateLimits');

const forgotApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too many requests, please try again later' },
});

const resetApiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too many requests, please try again later' },
});

const router = express.Router();
router.post('/login', loginLimiter, controller.login);
router.post('/register', registerLimiter, controller.register);
router.post('/logout', controller.logout);
router.get('/me', requireAuth, controller.me);
router.patch('/me', requireAuth, controller.patchMe);
router.post('/change-password', requireAuth, controller.changePassword);
router.post('/change-email', requireAuth, controller.changeEmail);
router.post('/forgot-password', forgotApiLimiter, lifecycle.forgotPasswordApi);
router.post('/reset-password', resetApiLimiter, lifecycle.resetPasswordApi);

module.exports = router;
