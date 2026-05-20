const express = require('express');
const { requireAuth, ensureSiteOwnership } = require('../../middleware/auth');
const { upload } = require('../../services/storage');
const controller = require('../../controllers/api/mediaController');

const router = express.Router();
router.use(requireAuth);

router.post('/:siteId/media', ensureSiteOwnership, upload.single('file'), controller.upload);
router.get('/:siteId/media', ensureSiteOwnership, controller.list);

module.exports = router;
