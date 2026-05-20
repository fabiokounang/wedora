const express = require('express');
const rateLimit = require('express-rate-limit');
const lifecycle = require('../controllers/authLifecycleController');
const google = require('../controllers/authGoogleController');

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
});

const router = express.Router();

router.get('/forgot-password', lifecycle.showForgotPassword);
router.post('/forgot-password', forgotLimiter, lifecycle.submitForgotPassword);
router.get('/reset-password', lifecycle.showResetPassword);
router.post('/reset-password', resetLimiter, lifecycle.submitResetPassword);
router.get('/auth/verify-email', lifecycle.verifyEmailFromLink);

router.get('/auth/google/debug', google.debugGoogleOAuth);
router.get('/auth/google', google.startGoogle);
router.get('/auth/google/callback', google.googleCallback);

module.exports = router;
