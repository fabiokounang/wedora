const express = require('express');
const { requireAuth, requireRole, ensureSiteOwnership } = require('../../middleware/auth');
const controller = require('../../controllers/api/siteController');

const router = express.Router();
router.use(requireAuth);

router.get('/', controller.list);
router.get('/themes', controller.listThemes);
router.get('/themes/:key', controller.getTheme);
router.post('/', requireRole('super_admin'), controller.create);

router.get('/:id', ensureSiteOwnership, controller.detail);
router.patch('/:id', ensureSiteOwnership, controller.update);
router.patch('/:id/content', ensureSiteOwnership, controller.patchContent);
router.patch('/:id/sections', ensureSiteOwnership, controller.patchSections);
router.get('/:id/rsvps', ensureSiteOwnership, controller.listRsvps);
router.get('/:id/wishes', ensureSiteOwnership, controller.listWishes);

module.exports = router;
