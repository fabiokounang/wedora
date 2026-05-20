const express = require('express');
const controller = require('../controllers/adminController');
const { requireAuth, requireRole, requireActivePlan, requireVerifiedEmailForClient } = require('../middleware/auth');
const { loginLimiter, registerLimiter, resendVerifyEmailLimiter } = require('../middleware/rateLimits');
const { uploadAudio, upload } = require('../services/storage');

/**
 * Hanya untuk koleksi gift_accounts: parse multipart + isi req.file.
 * Memakai single('qr_image_file') supaya stabil di browser (vs .any() + mapping manual).
 * Koleksi lain tetap application/x-www-form-urlencoded — middleware ini di-skip.
 */
function giftAccountsMultipart(req, res, next) {
  if (req.params.table !== 'gift_accounts') return next();
  upload.single('qr_image_file')(req, res, (err) => {
    if (err) return uploadImageError(err, req, res, next);
    console.log('[admin gift] multer selesai', {
      route: `${req.method} ${req.originalUrl || req.path}`,
      contentType: req.get('content-type'),
      hasFile: !!req.file,
      file: req.file
        ? {
            fieldname: req.file.fieldname,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            filename: req.file.filename,
            path: req.file.path,
          }
        : null,
      bodyKeys: Object.keys(req.body || {}),
    });
    next();
  });
}

function uploadMusicError(err, req, res, next) {
  if (!err) return next();
  if (err.name === 'MulterError') {
    const msg =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Music file is too large (max 25 MB).'
        : err.message || 'Upload failed.';
    return res.status(400).send(msg);
  }
  if (err.message && err.message.includes('MP3')) {
    return res.status(400).send(err.message);
  }
  next(err);
}

function uploadImageError(err, req, res, next) {
  if (!err) return next();
  if (err.name === 'MulterError') {
    const msg =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Gambar terlalu besar (maks. 8 MB).'
        : err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Ada field file tambahan di request. Coba unggah lagi atau pakai browser lain.'
          : err.message || 'Upload gagal.';
    return res.status(400).send(msg);
  }
  if (err.message && /image|Image|only image/.test(err.message)) {
    return res
      .status(400)
      .send(
        'File harus berupa gambar (PNG, JPG, WebP, GIF, dll.). Beberapa perangkat mengirim tipe file yang tidak standar — coba simpan ulang sebagai PNG/JPEG atau unggah dari browser lain.'
      );
  }
  next(err);
}

const router = express.Router();

router.get('/theme-gallery', controller.themeGallery);
router.get('/register', controller.showRegisterPage);
router.post('/register', registerLimiter, controller.submitRegister);

router.get('/pricing', controller.pricingPage);
router.get('/catalog', controller.publicCatalogPage);
router.post('/payments/midtrans/webhook', controller.handleMidtransWebhook);
router.post('/vendor/midtrans/webhook', controller.handleMidtransWebhook);

router.get('/login', controller.showLogin);
router.post('/login', loginLimiter, controller.submitLogin);
router.post('/logout', controller.logout);

router.get('/dashboard', requireAuth, controller.dashboard);
router.post('/themes/sync', requireAuth, controller.syncThemes);
router.get('/billing', requireAuth, requireVerifiedEmailForClient, controller.billingPage);
router.post('/billing/checkout', requireAuth, requireVerifiedEmailForClient, controller.createBillingCheckout);

router.get('/settings', requireAuth, controller.accountSettingsPage);
router.post(
  '/settings/resend-verify-email',
  requireAuth,
  resendVerifyEmailLimiter,
  controller.submitResendVerificationEmail,
);
router.post('/settings/profile', requireAuth, controller.submitAccountProfile);
router.post('/settings/password', requireAuth, controller.submitAccountPassword);
router.post('/settings/email', requireAuth, controller.submitAccountEmail);

router.get('/landing-cms', requireAuth, requireRole('super_admin'), controller.landingCmsPage);
router.post('/landing-cms', requireAuth, requireRole('super_admin'), controller.saveLandingCms);

router.get('/users', requireAuth, requireRole('super_admin'), controller.listUsersPage);
router.get('/users/new', requireAuth, requireRole('super_admin'), controller.newUserForm);
router.post('/users', requireAuth, requireRole('super_admin'), controller.createUserAdmin);
router.get('/users/:id/edit', requireAuth, requireRole('super_admin'), controller.editUserForm);
router.post('/users/:id', requireAuth, requireRole('super_admin'), controller.updateUserAdmin);
router.post('/users/:id/delete', requireAuth, requireRole('super_admin'), controller.deleteUserAdmin);

router.get('/promo-codes', requireAuth, requireRole('super_admin'), controller.listPromoCodesPage);
router.post('/promo-codes', requireAuth, requireRole('super_admin'), controller.createPromoCodeAdmin);
router.post('/promo-codes/:id/delete', requireAuth, requireRole('super_admin'), controller.deletePromoCodeAdmin);
router.post('/promo-codes/:id', requireAuth, requireRole('super_admin'), controller.updatePromoCodeAdmin);

router.get('/sites/new', requireAuth, requireVerifiedEmailForClient, requireActivePlan, controller.newSitePage);
router.post('/sites/new', requireAuth, requireVerifiedEmailForClient, requireActivePlan, controller.createSite);

router.get('/sites/:id', requireAuth, controller.showSite);
router.get('/sites/:id/rsvps.csv', requireAuth, controller.exportSiteRsvpsCsv);
router.post('/sites/:id/content', requireAuth, controller.saveSiteContent);
router.post('/sites/:id/sections', requireAuth, controller.saveSiteSections);
router.post(
  '/sites/:id/settings',
  requireAuth,
  uploadAudio.single('music_file'),
  uploadMusicError,
  controller.saveSiteSettings
);
router.post('/sites/:id/publish', requireAuth, requireActivePlan, controller.publishSite);
router.post('/sites/:id/unpublish', requireAuth, controller.unpublishSite);
router.post('/sites/:id/workflow', requireAuth, controller.updateWorkflowStatus);
router.post(
  '/sites/:id/collections/:table',
  requireAuth,
  giftAccountsMultipart,
  controller.createCollectionItem
);
router.post(
  '/sites/:id/collections/:table/:itemId',
  requireAuth,
  giftAccountsMultipart,
  controller.mutateCollectionItem
);
router.get('/preview/:slug', requireAuth, controller.previewSite);

router.get('/sites/:id/wa-blast', requireAuth, controller.showWaBlast);
router.post('/sites/:id/wa-blast', requireAuth, controller.submitWaBlast);

module.exports = router;
