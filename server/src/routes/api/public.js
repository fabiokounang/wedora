const express = require('express');
const controller = require('../../controllers/api/publicController');
const { publicRsvpWishWriteLimiter, publicWishesReadLimiter } = require('../../middleware/rateLimits');

const router = express.Router();

router.post('/public/site/:slug/rsvps', publicRsvpWishWriteLimiter, controller.createRsvpForSlug);
router.post('/public/site/:slug/wishes', publicRsvpWishWriteLimiter, controller.createWishForSlug);
router.get('/public/site/:slug/wishes', publicWishesReadLimiter, controller.listWishesBySlug);

module.exports = router;
