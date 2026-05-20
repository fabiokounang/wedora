const express = require('express');
const { requireAuth, ensureSiteOwnership } = require('../../middleware/auth');
const controller = require('../../controllers/api/collectionController');

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

router.get('/:siteId/collections/:table', ensureSiteOwnership, controller.validateTable, controller.list);
router.post('/:siteId/collections/:table', ensureSiteOwnership, controller.validateTable, controller.create);
router.patch('/:siteId/collections/:table/:id', ensureSiteOwnership, controller.validateTable, controller.update);
router.delete('/:siteId/collections/:table/:id', ensureSiteOwnership, controller.validateTable, controller.remove);

module.exports = router;
