const bcrypt = require('bcryptjs');
const { z } = require('zod');
const q = require('../models/queries');
const themeLoader = require('../services/themeLoader');
const { publicUrlFor } = require('../services/storage');
const { renderSite } = require('../services/renderer');
const { getPlan, listPlans } = require('../services/billingPlans');
const { mergePublicCms } = require('../config/defaultPublicCmsContent');
const { injectLiveCompareRows } = require('../utils/publicCmsLivePricing');
const { applyLandingFormToCms } = require('../utils/landingCmsForm');
const { safeParsePublicCms } = require('../config/publicCmsValidation');
const { validatePromoForCheckout } = require('../services/promoService');
const { getConnection } = require('../db');
const {
  getSnapClient,
  verifySignature,
  mapTransactionToOrderStatus,
  extractVaNumber,
  extractQrisImageUrl,
} = require('../services/midtrans');
const { signToken, setAuthCookie, clearAuthCookie } = require('../middleware/auth');
const accountEmail = require('../services/accountEmail');
const mailSvc = require('../services/mail');
const waPhone = require('../utils/waPhone');

const WORKFLOW_NEXT = {
  draft: new Set(['in_review', 'archived']),
  in_review: new Set(['draft', 'approved', 'archived']),
  approved: new Set(['in_review', 'published', 'archived']),
  published: new Set(['approved', 'archived']),
  archived: new Set(['draft']),
};

/** URL untuk "Pakai tema ini" dari katalog/landing — bukan file preview atau demo. */
function buildUseThemeUrl(req, themeKey) {
  const key = String(themeKey || '').trim();
  if (!key) return req.user ? '/sites/new' : '/register';
  const enc = encodeURIComponent(key);
  if (req.user) return `/sites/new?theme_key=${enc}`;
  return `/register?theme_key=${enc}`;
}

function pickValidThemeKey(raw) {
  const key = String(raw || '').trim();
  if (!key) return '';
  const valid = new Set(themeLoader.getThemeList().filter((t) => !t.broken).map((t) => t.key));
  return valid.has(key) ? key : '';
}

function render(res, view, data = {}) {
  const locals = {
    user: res.locals.user || null,
    title: data.title || 'Admin',
    flash: data.flash || null,
    error: null,
    ...data,
  };
  if (view === 'login' || view === 'register') locals.authSplit = true;
  res.render(view, locals, (err, body) => {
    if (err) throw err;
    res.render('layout', { ...locals, body });
  });
}

async function renderPublic(res, view, data = {}) {
  let cms = data.cms;
  if (!cms) {
    const row = await q.getLandingSettings();
    cms = mergePublicCms(row?.content || {});
  }
  cms = {
    ...cms,
    pricing: {
      ...cms.pricing,
      compareRows: injectLiveCompareRows(cms.pricing && cms.pricing.compareRows),
    },
  };
  const metaDescription =
    data.metaDescription != null ? data.metaDescription : cms.seo.defaultMetaDescription;
  const locals = {
    user: res.locals.user || null,
    flash: data.flash || null,
    ...data,
    cms,
    metaDescription,
  };
  if (locals.title == null) locals.title = cms.seo.homeTitle;

  return new Promise((resolve, reject) => {
    res.render(view, locals, (err, body) => {
      if (err) return reject(err);
      res.render('public-layout', { ...locals, body }, (e2, html) => {
        if (e2) return reject(e2);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
        resolve();
      });
    });
  });
}

function showLogin(req, res) {
  if (req.user) {
    const tk = pickValidThemeKey(req.query && req.query.theme_key);
    if (tk) return res.redirect(buildUseThemeUrl(req, tk));
    return res.redirect('/dashboard');
  }
  let notice = null;
  if (req.query && String(req.query.registered) === '1') {
    notice = { type: 'success', text: 'Akun dibuat. Silakan masuk.' };
  }
  if (req.query && String(req.query.verified) === '1') {
    notice = { type: 'success', text: 'Email terverifikasi. Silakan masuk.' };
  }
  if (req.query && String(req.query.verify) === 'invalid') {
    notice = { type: 'error', text: 'Tautan verifikasi tidak valid atau kadaluarsa.' };
  }
  if (req.query && String(req.query.reset) === '1') {
    notice = { type: 'success', text: 'Password berhasil diubah. Silakan masuk.' };
  }
  let error = null;
  if (req.query && String(req.query.err) === 'rate_limit') {
    error = 'Terlalu banyak percobaan masuk dari jaringan ini. Tunggu ±15 menit lalu coba lagi.';
  }
  const themeKey = pickValidThemeKey(req.query && req.query.theme_key);
  render(res, 'login', {
    title: 'Sign In',
    error,
    notice,
    themeKey: themeKey || null,
  });
}

async function submitLogin(req, res) {
  const schema = z.object({ email: z.string().email(), password: z.string().min(6) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return render(res, 'login', { title: 'Sign In', error: 'Invalid input' });
  const { email, password } = parsed.data;
  const user = await q.findUserByEmail(email);
  if (!user) return render(res, 'login', { title: 'Sign In', error: 'Invalid credentials', email });
  if (!user.password_hash) {
    return render(res, 'login', {
      title: 'Sign In',
      error: 'Akun ini menggunakan Google. Silakan tombol "Lanjutkan dengan Google".',
      email,
    });
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return render(res, 'login', { title: 'Sign In', error: 'Invalid credentials', email });
  setAuthCookie(res, signToken(user));
  const themeKey = pickValidThemeKey(req.body && req.body.theme_key);
  if (user.role === 'client') {
    const paidOrder = await q.getLatestPaidOrderByUser(user.id);
    if (!paidOrder) {
      if (themeKey) return res.redirect(`/billing?theme_key=${encodeURIComponent(themeKey)}`);
      return res.redirect('/billing');
    }
    if (themeKey) return res.redirect(`/sites/new?theme_key=${encodeURIComponent(themeKey)}`);
  } else if (themeKey) {
    return res.redirect(`/sites/new?theme_key=${encodeURIComponent(themeKey)}`);
  }
  return res.redirect('/dashboard');
}

async function logout(req, res) {
  try {
    if (req.user) await q.bumpUserTokenVersion(req.user.id);
  } catch (e) {
    console.warn('[logout]', e.message || e);
  }
  clearAuthCookie(res);
  res.redirect('/login');
}

/** Beranda marketing publik di `/` untuk semua orang; panel akun di `/dashboard`. */
function root(req, res, next) {
  return homePage(req, res, next);
}

async function homePage(req, res, next) {
  try {
    const list = themeLoader.getThemeList();
    const base = (process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const allOk = list.filter((t) => !t.broken);
    const themeCount = allOk.length;
    const themes = allOk.slice(0, 6).map((t) => ({
      ...t,
      theme_preview_url: themeLoader.getPreviewUrl(t.key),
      demoUrl: `${base}/?site=preview-${t.key}`,
      useThemeUrl: buildUseThemeUrl(req, t.key),
    }));
    const row = await q.getLandingSettings();
    const cms = mergePublicCms(row?.content || {});
    await renderPublic(res, 'home', {
      title: cms.seo.homeTitle,
      metaDescription: cms.seo.defaultMetaDescription,
      themes,
      themeCount,
      plans: listPlans(),
      cms,
    });
  } catch (e) {
    next(e);
  }
}

async function pricingPage(req, res, next) {
  try {
    const list = themeLoader.getThemeList().filter((t) => !t.broken);
    const heroTheme = list[0] || null;
    const row = await q.getLandingSettings();
    const cms = mergePublicCms(row?.content || {});
    await renderPublic(res, 'pricing', {
      title: cms.seo.pricingTitle,
      metaDescription: cms.seo.defaultMetaDescription,
      heroThemePreview: heroTheme ? themeLoader.getPreviewUrl(heroTheme.key) : null,
      plans: listPlans(),
      cms,
    });
  } catch (e) {
    next(e);
  }
}

async function publicCatalogPage(req, res, next) {
  try {
    const list = themeLoader.getThemeList();
    const base = (process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const themes = list.filter((t) => !t.broken).map((t) => ({
      ...t,
      theme_preview_url: themeLoader.getPreviewUrl(t.key),
      demoUrl: `${base}/?site=preview-${t.key}`,
      useThemeUrl: buildUseThemeUrl(req, t.key),
    }));
    const row = await q.getLandingSettings();
    const cms = mergePublicCms(row?.content || {});
    await renderPublic(res, 'catalog-public', {
      title: cms.seo.catalogTitle,
      metaDescription: cms.seo.defaultMetaDescription,
      themes,
      cms,
    });
  } catch (e) {
    next(e);
  }
}

async function landingCmsPage(req, res, next) {
  try {
    const row = await q.getLandingSettings();
    const cms = mergePublicCms(row?.content || {});
    const notice = String(req.query.notice || '') === 'saved' ? 'Perubahan disimpan.' : null;
    render(res, 'landing-cms', {
      title: 'Konten publik',
      cms,
      flash: notice ? { type: 'success', message: notice } : null,
      formError: null,
    });
  } catch (e) {
    next(e);
  }
}

async function saveLandingCms(req, res, next) {
  try {
    const row = await q.getLandingSettings();
    const base = mergePublicCms(row?.content || {});
    const draft = applyLandingFormToCms(base, req.body);
    const parsed = safeParsePublicCms(draft);
    if (!parsed.success) {
      console.warn('[landing-cms] validation', parsed.error.flatten());
      return render(res, 'landing-cms', {
        title: 'Konten publik',
        cms: base,
        flash: { type: 'error', message: 'Data tidak valid.' },
        formError: 'Periksa field teks atau JSON (fitur, langkah, testimoni, tabel perbandingan, FAQ).',
      });
    }
    await q.upsertLandingSettings(parsed.data);
    return res.redirect('/landing-cms?notice=saved');
  } catch (e) {
    next(e);
  }
}

function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function syncThemes(req, res, next) {
  try {
    themeLoader.clearCache();
    try {
      const ejs = require('ejs');
      if (typeof ejs.clearCache === 'function') ejs.clearCache();
    } catch (_) {}

    /** Same behavior as `npm run sync-themes`: add DB rows for preview-* & slug=themeKey when a new folder appears under themes/. */
    if (req.user && req.user.role === 'super_admin') {
      const seed = require('../scripts/seed');
      const ownerId = await seed.upsertSuperAdmin();
      await seed.ensureThemePreviewSites(ownerId);
      await seed.ensureThemeSlugInvitationSites(ownerId);
    }

    let target = '/dashboard';
    const rt = req.body && req.body.return_to;
    if (typeof rt === 'string' && rt.startsWith('/') && !rt.startsWith('//') && !/[\r\n]/.test(rt)) {
      target = rt.slice(0, 2000);
    }
    const hashIdx = target.indexOf('#');
    let base = target;
    let hash = '';
    if (hashIdx !== -1) {
      base = target.slice(0, hashIdx);
      hash = target.slice(hashIdx);
    }
    const sep = base.includes('?') ? '&' : '?';
    res.redirect(302, base + sep + 'theme_sync=1' + hash);
  } catch (err) {
    next(err);
  }
}

async function dashboard(req, res) {
  const isSuper = req.user.role === 'super_admin';
  const filter =
    isSuper ? { invitation_only: true } : { owner_user_id: req.user.id };
  let assignFilter = '';
  if (isSuper) {
    if (req.query.assign === 'client') {
      filter.assign = 'client';
      assignFilter = 'client';
    } else if (req.query.assign === 'admin') {
      filter.assign = 'admin';
      assignFilter = 'admin';
    }
  }
  const rows = await q.listSites(filter);
  const sites = rows.map((s) =>
    Object.assign({}, s, {
      theme_preview_url: themeLoader.getPreviewUrl(s.theme_key),
      rsvp_count: Number(s.rsvp_count ?? 0) || 0,
      wish_count: Number(s.wish_count ?? 0) || 0,
    }),
  );
  const activePlan = req.user.role === 'client' ? await q.getLatestPaidOrderByUser(req.user.id) : null;
  const credits = req.user.role === 'client'
    ? {
        paid: await q.countPaidOrdersByUser(req.user.id),
        used: await q.countInvitationSitesByOwner(req.user.id),
      }
    : null;
  const themeSyncOk = String(req.query.theme_sync || '') === '1';
  const totalRsvpGuests = sites.reduce((sum, s) => sum + (Number(s.rsvp_count) || 0), 0);
  const totalWishes = sites.reduce((sum, s) => sum + (Number(s.wish_count) || 0), 0);
  render(res, 'dashboard', {
    title: 'Undangan',
    sites,
    assignFilter,
    activePlan,
    credits,
    themeSyncOk,
    totalRsvpGuests,
    totalWishes,
  });
}

async function billingPage(req, res) {
  const plans = listPlans();
  const activePlan = req.user.role === 'client' ? await q.getLatestPaidOrderByUser(req.user.id) : null;
  const orders = await q.listPaymentOrdersByUser(req.user.id, 20);
  const paid = await q.countPaidOrdersByUser(req.user.id);
  const used = await q.countInvitationSitesByOwner(req.user.id);
  const checkoutErrorRaw = req.query && req.query.checkout_error;
  let checkoutError = '';
  if (checkoutErrorRaw) {
    try {
      checkoutError = decodeURIComponent(String(checkoutErrorRaw).replace(/\+/g, ' '));
    } catch (_) {
      checkoutError = 'Checkout tidak dapat diproses.';
    }
  }
  const checkoutFreeOk = String(req.query.checkout || '') === 'free_ok';
  render(res, 'billing', {
    title: 'Billing',
    plans,
    activePlan,
    orders,
    requiredPayment: String(req.query.required || '') === '1',
    verifyRequired: String(req.query.verify_required || '') === '1',
    requiredReason: String(req.query.reason || '').trim().toLowerCase(),
    selectedPlan: String(req.query.plan || '').trim().toLowerCase(),
    midtransClientKey: process.env.MIDTRANS_CLIENT_KEY || '',
    credits: { paid, used, available: Math.max(0, paid - used) },
    checkoutError,
    checkoutFreeOk,
  });
}

async function createBillingCheckout(req, res) {
  if (req.user.role !== 'client') return res.status(403).send('Forbidden');

  const planCodeRaw = String(req.body.plan_code || '').trim().toLowerCase();
  const redirectBillingErr = (msg) =>
    res.redirect(
      `/billing?checkout_error=${encodeURIComponent(msg)}&plan=${encodeURIComponent(planCodeRaw)}`
    );

  try {
    const plan = getPlan(planCodeRaw);
    if (!plan) return redirectBillingErr('Paket tidak valid.');

    const rawPromo = req.body.promo_code;
    const hasPromo = rawPromo && String(rawPromo).trim();

    let promoCode = null;
    let grossAmount = plan.amount;
    let discountAmount = 0;
    let originalAmount = plan.amount;

    if (!hasPromo) {
      const orderId = `INV-${req.user.id}-${Date.now()}`;
      return await _createOrderAndRedirect(req, res, {
        plan, orderId, grossAmount, discountAmount, originalAmount, promoCode,
      });
    }

    const conn = await getConnection();
    try {
      await conn.beginTransaction();

      const v = await validatePromoForCheckout({
        codeRaw: rawPromo,
        planCode: plan.code,
        planAmount: plan.amount,
        userId: req.user.id,
        conn,
      });
      if (!v.ok) {
        await conn.rollback();
        conn.release();
        return redirectBillingErr(v.error);
      }
      grossAmount = v.finalAmount;
      discountAmount = v.discountAmount;
      promoCode = v.code;
      originalAmount = v.originalAmount;

      const minGross = Math.max(0, Number(process.env.MIDTRANS_MIN_GROSS_IDR || 1000));
      if (grossAmount > 0 && grossAmount < minGross) {
        await conn.rollback();
        conn.release();
        return redirectBillingErr(
          `Total setelah diskon terlalu kecil untuk pembayaran online (minimum Rp ${minGross.toLocaleString('id-ID')}).`
        );
      }

      const orderId = `INV-${req.user.id}-${Date.now()}`;

      if (grossAmount === 0) {
        await q.createPaymentOrder({
          order_id: orderId,
          user_id: req.user.id,
          plan_code: plan.code,
          gross_amount: 0,
          currency: 'IDR',
          status: 'paid',
          snap_token: null,
          snap_redirect_url: null,
          promo_code: promoCode,
          original_amount: originalAmount,
          discount_amount: discountAmount,
          paid_at: new Date(),
        }, conn);
        await conn.commit();
        conn.release();
        return res.redirect('/billing?checkout=free_ok');
      }

      await q.createPaymentOrder({
        order_id: orderId,
        user_id: req.user.id,
        plan_code: plan.code,
        gross_amount: grossAmount,
        currency: 'IDR',
        status: 'pending',
        snap_token: null,
        snap_redirect_url: null,
        promo_code: promoCode,
        original_amount: originalAmount,
        discount_amount: discountAmount,
      }, conn);
      await conn.commit();
      conn.release();

      const finishUrl = `${process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`}/billing`;
      const snap = getSnapClient();
      const itemName = `Paket ${plan.name} (${promoCode})`;
      const payload = {
        transaction_details: { order_id: orderId, gross_amount: grossAmount },
        customer_details: { first_name: req.user.name || 'Client', email: req.user.email || undefined },
        item_details: [{ id: plan.code, name: itemName, quantity: 1, price: grossAmount }],
        callbacks: { finish: finishUrl },
      };
      const trx = await snap.createTransaction(payload);

      if (trx.token || trx.redirect_url) {
        await q.updatePaymentOrderSnapFields(orderId, trx.token || null, trx.redirect_url || null);
      }
      if (trx.redirect_url) return res.redirect(trx.redirect_url);
      return res.redirect('/billing');

    } catch (txErr) {
      try { await conn.rollback(); } catch (_) {}
      conn.release();
      throw txErr;
    }
  } catch (err) {
    console.error('billing checkout error:', err.message);
    return redirectBillingErr('Gagal membuat transaksi pembayaran. Cek konfigurasi Midtrans atau coba lagi.');
  }
}

async function _createOrderAndRedirect(req, res, { plan, orderId, grossAmount, discountAmount, originalAmount, promoCode }) {
  const minGross = Math.max(0, Number(process.env.MIDTRANS_MIN_GROSS_IDR || 1000));
  const redirectBillingErr = (msg) =>
    res.redirect(`/billing?checkout_error=${encodeURIComponent(msg)}&plan=${encodeURIComponent(plan.code)}`);

  if (grossAmount > 0 && grossAmount < minGross) {
    return redirectBillingErr(
      `Total setelah diskon terlalu kecil untuk pembayaran online (minimum Rp ${minGross.toLocaleString('id-ID')}).`
    );
  }
  const finishUrl = `${process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`}/billing`;

  if (grossAmount === 0) {
    await q.createPaymentOrder({
      order_id: orderId, user_id: req.user.id, plan_code: plan.code,
      gross_amount: 0, currency: 'IDR', status: 'paid',
      promo_code: promoCode, original_amount: originalAmount,
      discount_amount: discountAmount, paid_at: new Date(),
    });
    return res.redirect('/billing?checkout=free_ok');
  }

  const snap = getSnapClient();
  const itemName = promoCode ? `Paket ${plan.name} (${promoCode})` : `Paket ${plan.name}`;
  const payload = {
    transaction_details: { order_id: orderId, gross_amount: grossAmount },
    customer_details: { first_name: req.user.name || 'Client', email: req.user.email || undefined },
    item_details: [{ id: plan.code, name: itemName, quantity: 1, price: grossAmount }],
    callbacks: { finish: finishUrl },
  };
  const trx = await snap.createTransaction(payload);
  await q.createPaymentOrder({
    order_id: orderId, user_id: req.user.id, plan_code: plan.code,
    gross_amount: grossAmount, currency: 'IDR', status: 'pending',
    snap_token: trx.token || null, snap_redirect_url: trx.redirect_url || null,
    promo_code: promoCode, original_amount: originalAmount, discount_amount: discountAmount,
  });
  if (trx.redirect_url) return res.redirect(trx.redirect_url);
  return res.redirect('/billing');
}

async function handleMidtransWebhook(req, res) {
  const payload = req.body || {};
  const orderId = String(payload.order_id || '').trim();
  const transactionStatus = String(payload.transaction_status || '').toLowerCase();
  const fraudStatus = String(payload.fraud_status || '').toLowerCase();

  if (!orderId) return res.status(400).json({ error: 'missing order_id' });
  if (!verifySignature(payload)) return res.status(401).json({ error: 'invalid signature' });

  const current = await q.getPaymentOrderByOrderId(orderId);
  if (!current) return res.status(404).json({ error: 'order not found' });

  console.info('[MIDTRANS WEBHOOK]', {
    orderId,
    transactionId: payload.transaction_id || null,
    transactionStatus,
    fraudStatus,
    paymentType: payload.payment_type || null,
    currentOrderStatus: current.status,
  });

  const status = mapTransactionToOrderStatus(transactionStatus, fraudStatus);
  const vaNumber = extractVaNumber(payload);
  const qrisImageUrl = extractQrisImageUrl(payload);
  const updated = await q.updatePaymentOrderAfterMidtrans(orderId, {
    status,
    transaction_status: transactionStatus || null,
    fraud_status: fraudStatus || null,
    payment_type: payload.payment_type || null,
    midtrans_transaction_id: payload.transaction_id || null,
    va_number: vaNumber,
    qris_image_url: qrisImageUrl,
    raw_notification: payload,
  });

  return res.status(200).json({
    ok: true,
    status: updated ? updated.status : status,
    alreadyPaid: current.status === 'paid',
  });
}

async function newSitePage(req, res) {
  const isSuper = req.user.role === 'super_admin';
  const themes = themeLoader.getThemeList().filter((t) => !t.broken);
  const clients = isSuper ? await q.listUsers({ role: 'client' }) : [];
  const validKeys = new Set(themes.map((t) => t.key));

  let prefillTheme = req.query && req.query.theme_key ? String(req.query.theme_key).trim() : '';
  if (prefillTheme && !validKeys.has(prefillTheme)) prefillTheme = '';

  let prefillOwnerId = '';
  if (req.query && req.query.owner) {
    const oid = Number(req.query.owner);
    if (clients.some((c) => Number(c.id) === oid)) prefillOwnerId = String(oid);
  }

  render(res, 'sites/new', {
    title: 'Buat Undangan',
    themes,
    clients,
    prefillTheme: prefillTheme || null,
    prefillOwnerId: prefillOwnerId || null,
    error: null,
    isSuper,
  });
}

async function createSite(req, res) {
  const isSuper = req.user.role === 'super_admin';
  const schema = z.object({
    slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, 'lowercase/numbers/dash only'),
    theme_key: z.string().min(1),
    custom_domain: z.string().optional(),
    owner_user_id: z.string().optional(),
    managed_by: z.enum(['admin', 'self']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    const themes = themeLoader.getThemeList();
    const clients = isSuper ? await q.listUsers({ role: 'client' }) : [];
    return render(res, 'sites/new', {
      title: 'Buat Undangan',
      themes,
      clients,
      error: parsed.error.issues.map((i) => i.message).join(', '),
      isSuper,
    });
  }
  const { slug, theme_key } = parsed.data;
  const custom_domain = isSuper ? (parsed.data.custom_domain || null) : null;

  // Self-serve client: always owns and manages their own site.
  let owner_user_id = isSuper ? (parsed.data.owner_user_id ? Number(parsed.data.owner_user_id) : null) : req.user.id;
  let managed_by = isSuper ? 'admin' : 'self';
  if (isSuper && owner_user_id) {
    const u = await q.getUserById(owner_user_id);
    if (!u || u.role !== 'client') {
      const themes = themeLoader.getThemeList();
      const clients = await q.listUsers({ role: 'client' });
      return render(res, 'sites/new', { title: 'Buat Undangan', themes, clients, error: 'Invalid client user', isSuper });
    }
    managed_by = parsed.data.managed_by === 'self' ? 'self' : 'admin';
  }

  try {
    themeLoader.getManifest(theme_key);
  } catch (err) {
    const themes = themeLoader.getThemeList();
    const clients = isSuper ? await q.listUsers({ role: 'client' }) : [];
    return render(res, 'sites/new', { title: 'Buat Undangan', themes, clients, error: err.message, isSuper });
  }

  if (managed_by === 'self' && !owner_user_id) {
    const themes = themeLoader.getThemeList();
    const clients = isSuper ? await q.listUsers({ role: 'client' }) : [];
    return render(res, 'sites/new', {
      title: 'Buat Undangan',
      themes,
      clients,
      error: 'Client must be assigned when "Client edits" is selected.',
      isSuper,
    });
  }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const [[slugRow]] = await conn.query('SELECT id FROM sites WHERE slug = ? LIMIT 1', [slug]);
    if (slugRow) {
      await conn.rollback();
      conn.release();
      const themes = themeLoader.getThemeList();
      const clients = isSuper ? await q.listUsers({ role: 'client' }) : [];
      return render(res, 'sites/new', { title: 'Buat Undangan', themes, clients, error: 'Slug already used', isSuper });
    }

    if (!isSuper && owner_user_id) {
      const [[paidRow]] = await conn.query(
        "SELECT COUNT(*) AS c FROM payment_orders WHERE user_id = ? AND status = 'paid' FOR UPDATE",
        [owner_user_id],
      );
      const [[usedRow]] = await conn.query(
        "SELECT COUNT(*) AS c FROM sites WHERE owner_user_id = ? AND site_type = 'invitation'",
        [owner_user_id],
      );
      if (Number(usedRow.c) >= Number(paidRow.c)) {
        await conn.rollback();
        conn.release();
        if (req.accepts('html') && !req.xhr) return res.redirect('/billing?required=1&reason=quota');
        return res.status(402).json({ error: 'payment_quota_exhausted' });
      }
    }

    const [insertResult] = await conn.query(
      `INSERT INTO sites (owner_user_id, slug, site_type, theme_key, managed_by, status, custom_domain)
       VALUES (?, ?, 'invitation', ?, ?, 'draft', ?)`,
      [owner_user_id, slug, theme_key, managed_by, custom_domain],
    );
    const siteId = insertResult.insertId;
    await conn.commit();
    conn.release();

    const site = await q.getSiteById(siteId);
    const manifest = themeLoader.getManifest(theme_key);
    const defaults = {};
    for (const f of manifest.content_fields || []) defaults[f.key] = '';
    await q.upsertSiteContent(site.id, defaults, null);
    let order = 1;
    for (const section of manifest.sections || []) {
      await q.upsertSection(site.id, section.key, { enabled: 1, sort_order: order++ });
    }
    await q.logActivity(site.id, req.user.id, 'site.create', { slug, theme_key });
    res.redirect(`/sites/${site.id}?new=1`);
  } catch (txErr) {
    try { await conn.rollback(); } catch (_) {}
    conn.release();
    throw txErr;
  }
}

async function loadSiteOrReject(req, res) {
  const id = Number(req.params.id);
  const site = await q.getSiteById(id);
  if (!site) {
    res.status(404).send('Site not found');
    return null;
  }
  if (req.user.role !== 'super_admin' && site.owner_user_id !== req.user.id) {
    res.status(403).send('Forbidden');
    return null;
  }
  return site;
}

async function applyUploadedGiftQrIfAny(siteId, table, req, values) {
  if (table !== 'gift_accounts') return;
  if (!req.file) {
    console.log('[admin gift] applyUploadedGiftQr: tidak ada req.file — pakai qr_image_url dari form jika ada', {
      qr_image_url_di_values: values.qr_image_url,
    });
    return;
  }
  const url = publicUrlFor(req.file.filename);
  console.log('[admin gift] applyUploadedGiftQr: file disimpan ke disk → qr_image_url', {
    filename: req.file.filename,
    url,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
  values.qr_image_url = url;
  await q.createMedia(siteId, {
    filename: req.file.filename,
    original_name: req.file.originalname,
    mime_type: req.file.mimetype,
    size: req.file.size,
    url,
  });
}

async function showSite(req, res) {
  const site = await loadSiteOrReject(req, res);
  if (!site) return;
  const manifest = themeLoader.getManifest(site.theme_key);
  const content = await q.getSiteContent(site.id);
  const sections = await q.getSiteSections(site.id);
  const collections = {};
  for (const s of manifest.sections || []) {
    if (s.collection) collections[s.collection] = await q.listCollection(s.collection, site.id);
  }
  const rsvps = await q.listRsvps(site.id);
  const wishes = await q.listWishes(site.id, { approvedOnly: false, limit: 500 });
  const themes = themeLoader.getThemeList();
  const clients = req.user.role === 'super_admin' ? await q.listUsers({ role: 'client' }) : [];
  const showPreviewTip = req.query && String(req.query.new) === '1';
  const publicBase = (process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`).replace(
    /\/$/,
    '',
  );
  const themeDemoUrl = `${publicBase}/?site=preview-${encodeURIComponent(site.theme_key)}`;
  const themeSyncOk = String(req.query.theme_sync || '') === '1';
  render(res, 'sites/show', {
    title: site.slug,
    site, manifest, content, sections, collections, rsvps, wishes, themes, clients,
    showPreviewTip,
    publicBase,
    themeDemoUrl,
    themeSyncOk,
  });
}

async function exportSiteRsvpsCsv(req, res) {
  const site = await loadSiteOrReject(req, res);
  if (!site) return;
  const rows = await q.listRsvps(site.id);
  const header = ['created_at', 'guest_name', 'guest_phone', 'attendance', 'guests_count', 'notes'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.created_at),
        csvCell(r.guest_name),
        csvCell(r.guest_phone),
        csvCell(r.attendance),
        csvCell(r.guests_count),
        csvCell(r.notes),
      ].join(',')
    );
  }

  const safeSlug = String(site.slug || 'site').replace(/[^a-zA-Z0-9_-]/g, '-');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="rsvps-${safeSlug}.csv"`);
  res.send(lines.join('\n'));
}

async function saveSiteContent(req, res) {
  const site = await loadSiteOrReject(req, res);
  if (!site) return;
  const manifest = themeLoader.getManifest(site.theme_key);
  const clean = {};
  for (const f of manifest.content_fields || []) {
    clean[f.key] = req.body[f.key] == null ? '' : req.body[f.key];
  }
  await q.upsertSiteContent(site.id, clean, null);
  await q.logActivity(site.id, req.user.id, 'content.update', Object.keys(clean));
  res.redirect(`/sites/${site.id}#content`);
}

async function saveSiteSections(req, res) {
  const site = await loadSiteOrReject(req, res);
  if (!site) return;
  const manifest = themeLoader.getManifest(site.theme_key);
  for (const m of manifest.sections || []) {
    const enabled = req.body[`enabled_${m.key}`] ? 1 : (m.required ? 1 : 0);
    const sort = Number(req.body[`sort_order_${m.key}`]) || 0;
    await q.upsertSection(site.id, m.key, { enabled, sort_order: sort });
  }
  await q.logActivity(site.id, req.user.id, 'sections.update', {});
  res.redirect(`/sites/${site.id}#sections`);
}

async function saveSiteSettings(req, res) {
  const site = await loadSiteOrReject(req, res);
  if (!site) return;
  const patch = {};
  if (req.body.theme_key) {
    try {
      themeLoader.getManifest(req.body.theme_key);
    } catch (err) {
      return res.status(400).send(err.message);
    }
    patch.theme_key = req.body.theme_key;
  }
  if (req.user.role === 'super_admin') {
    if (req.body.managed_by) patch.managed_by = req.body.managed_by;
    patch.custom_domain = req.body.custom_domain && req.body.custom_domain.trim() ? req.body.custom_domain.trim() : null;
    if (Object.prototype.hasOwnProperty.call(req.body, 'owner_user_id')) {
      const raw = req.body.owner_user_id;
      if (raw === '' || raw === undefined || raw === null) {
        patch.owner_user_id = null;
      } else {
        const oid = Number(raw);
        const u = await q.getUserById(oid);
        if (!u || u.role !== 'client') return res.status(400).send('Invalid client for owner');
        patch.owner_user_id = oid;
      }
    }
  }

  let musicUrl = req.body.music_url != null ? String(req.body.music_url).trim() : '';
  const musicEnabled = req.body.music_enabled === '1' || req.body.music_enabled === 'on';
  const musicAutoplay = req.body.music_start === 'autoplay';

  if (req.file) {
    musicUrl = publicUrlFor(req.file.filename);
    await q.createMedia(site.id, {
      filename: req.file.filename,
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      size: req.file.size,
      url: musicUrl,
    });
  }

  if (musicEnabled && !musicUrl) {
    return res.status(400).send('Music URL is required when background music is enabled.');
  }
  if (musicUrl && !/^https?:\/\//i.test(musicUrl) && !musicUrl.startsWith('/')) {
    return res.status(400).send('Music URL must start with http://, https://, or / (e.g. uploaded file).');
  }

  patch.music_enabled = musicEnabled ? 1 : 0;
  patch.music_autoplay = musicAutoplay ? 1 : 0;
  patch.music_url = musicUrl || null;

  await q.updateSiteById(site.id, patch);
  await q.logActivity(site.id, req.user.id, 'site.settings', {});
  res.redirect(`/sites/${site.id}#settings`);
}

async function publishSite(req, res) {
  const site = await loadSiteOrReject(req, res);
  if (!site) return;
  if (req.user.role === 'super_admin') {
    if (site.status !== 'approved') return res.status(400).send('Only approved sites can be published.');
  } else {
    if (site.status === 'published') return res.status(400).send('Site already published.');
  }
  await q.publishSite(site.id);
  await q.logActivity(site.id, req.user.id, 'site.publish', {});
  res.redirect(`/sites/${site.id}`);
}

async function unpublishSite(req, res) {
  const site = await loadSiteOrReject(req, res);
  if (!site) return;
  if (site.status !== 'published') return res.status(400).send('Only published sites can be unpublished.');
  await q.unpublishSite(site.id);
  await q.logActivity(site.id, req.user.id, 'site.unpublish', {});
  res.redirect(`/sites/${site.id}`);
}

async function updateWorkflowStatus(req, res) {
  const site = await loadSiteOrReject(req, res);
  if (!site) return;
  if (req.user.role !== 'super_admin') return res.status(403).send('Forbidden');
  const next = String(req.body.status || '').trim();
  const allowed = WORKFLOW_NEXT[site.status] || new Set();
  if (!allowed.has(next)) {
    return res.status(400).send(`Invalid workflow transition: ${site.status} -> ${next || '(empty)'}`);
  }
  await q.setSiteStatus(site.id, next);
  await q.logActivity(site.id, req.user.id, 'site.status', { from: site.status, to: next });
  res.redirect(`/sites/${site.id}`);
}

async function createCollectionItem(req, res) {
  const site = await loadSiteOrReject(req, res);
  if (!site) return;
  const table = req.params.table;
  if (!Object.prototype.hasOwnProperty.call(q.COLLECTION_TABLES, table)) return res.status(404).send('unknown collection');
  const values = {};
  for (const field of q.COLLECTION_TABLES[table].fields) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      const v = req.body[field];
      values[field] = (v === '' && field !== 'sort_order') ? null : v;
    }
  }
  if (table === 'gift_accounts') {
    console.log('[admin gift] CREATE — values dari form (sebelum apply upload)', { ...values });
  }
  await applyUploadedGiftQrIfAny(site.id, table, req, values);
  if (table === 'gift_accounts') {
    console.log('[admin gift] CREATE — values akhir masuk DB', { ...values });
  }
  const created = await q.createCollectionItem(table, site.id, values);
  if (table === 'gift_accounts') {
    console.log('[admin gift] CREATE selesai', { id: created.id, qr_image_url: created.qr_image_url });
  }
  await q.logActivity(site.id, req.user.id, `${table}.create`, {});
  res.redirect(`/sites/${site.id}#${table}`);
}

async function mutateCollectionItem(req, res) {
  const site = await loadSiteOrReject(req, res);
  if (!site) return;
  const table = req.params.table;
  if (!Object.prototype.hasOwnProperty.call(q.COLLECTION_TABLES, table)) return res.status(404).send('unknown collection');
  const method = (req.query._method || req.body._method || 'patch').toLowerCase();
  const itemId = Number(req.params.itemId);
  if (method === 'delete') {
    await q.deleteCollectionItem(table, site.id, itemId);
    await q.logActivity(site.id, req.user.id, `${table}.delete`, { id: itemId });
  } else {
    const values = {};
    for (const field of q.COLLECTION_TABLES[table].fields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        const v = req.body[field];
        values[field] = (v === '' && field !== 'sort_order') ? null : v;
      }
    }
    if (table === 'gift_accounts') {
      console.log('[admin gift] UPDATE — itemId', itemId, 'values dari form (sebelum apply upload)', { ...values });
    }
    await applyUploadedGiftQrIfAny(site.id, table, req, values);
    if (table === 'gift_accounts') {
      console.log('[admin gift] UPDATE — values akhir masuk DB', { ...values });
    }
    const updated = await q.updateCollectionItem(table, site.id, itemId, values);
    if (table === 'gift_accounts') {
      console.log('[admin gift] UPDATE selesai', { id: updated?.id, qr_image_url: updated?.qr_image_url });
    }
    await q.logActivity(site.id, req.user.id, `${table}.update`, { id: itemId });
  }
  res.redirect(`/sites/${site.id}#${table}`);
}

async function previewSite(req, res, next) {
  try {
    const site = await q.getSiteBySlug(req.params.slug);
    if (!site) return res.status(404).send('Site not found');
    if (req.user.role !== 'super_admin' && site.owner_user_id !== req.user.id) {
      return res.status(403).send('Forbidden');
    }
    const html = await renderSite(site, { apiBase: '/api' });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    next(err);
  }
}

/** Public catalog: theme thumbnails + link to live demo (no login). */
function themeGallery(req, res) {
  const list = themeLoader.getThemeList();
  const base = (process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const themes = list.map((t) => ({
    ...t,
    theme_preview_url: themeLoader.getPreviewUrl(t.key),
    demoUrl: `${base}/?site=preview-${t.key}`,
  }));
  render(res, 'theme-gallery', { title: 'Katalog tema', themes, publicBase: base });
}

function showRegisterPage(req, res) {
  if (req.user) {
    const tk = pickValidThemeKey(req.query && req.query.theme_key);
    if (tk) return res.redirect(buildUseThemeUrl(req, tk));
    return res.redirect('/dashboard');
  }
  let error = null;
  if (req.query && String(req.query.err) === 'rate_limit') {
    error = 'Terlalu banyak percobaan daftar dari jaringan ini. Tunggu ±1 jam lalu coba lagi.';
  }
  const prefillTheme = pickValidThemeKey(req.query && req.query.theme_key);
  render(res, 'register', { title: 'Create account', error, prefillTheme: prefillTheme || null });
}

async function submitRegister(req, res) {
  const schema = z.object({
    name: z.string().min(1).max(120),
    email: z.string().email(),
    password: z.string().min(6),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return render(res, 'register', { title: 'Create account', error: 'Isi nama, email valid, dan password (minimal 6 karakter).' });
  }
  const { email, password, name } = parsed.data;
  const emailNorm = email.trim().toLowerCase();
  const existing = await q.findUserByEmail(emailNorm);
  if (existing) {
    return render(res, 'register', { title: 'Create account', error: 'Email ini sudah terdaftar. Gunakan login.' });
  }
  const hash = await bcrypt.hash(password, 10);
  const user = await q.createUser({
    email: emailNorm,
    password_hash: hash,
    name,
    role: 'client',
    auth_provider: 'local',
    google_sub: null,
    email_verified_at: null,
  });
  accountEmail.sendEmailVerification(user.id, emailNorm, req).catch((e) => console.warn('[email verify]', e.message || e));
  const themeKey = pickValidThemeKey(req.body && req.body.theme_key);
  let loginUrl = '/login?registered=1';
  if (themeKey) loginUrl += `&theme_key=${encodeURIComponent(themeKey)}`;
  return res.redirect(loginUrl);
}

async function listUsersPage(req, res) {
  const kw = req.query.q != null ? String(req.query.q).trim() : '';
  const roleFilter =
    req.query.role === 'super_admin' || req.query.role === 'client' ? req.query.role : '';
  const sort = ['name', 'email', 'id', 'role', 'created'].includes(req.query.sort) ? req.query.sort : 'name';
  const ord = req.query.order === 'desc' ? 'desc' : 'asc';
  const allowedLimits = [5, 10, 25, 50, 100];
  const limitRaw = parseInt(req.query.limit, 10);
  const limit = allowedLimits.includes(limitRaw) ? limitRaw : 10;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  const result = await q.listUsersPaged({
    page,
    limit,
    search: kw,
    role: roleFilter,
    sort,
    order: ord,
  });

  function usersQuery(overrides = {}) {
    const p = new URLSearchParams();
    const m = {
      q: kw || undefined,
      role: roleFilter || undefined,
      sort,
      order: ord,
      limit: String(limit),
      page: String(result.page),
      ...overrides,
    };
    for (const key of ['q', 'role', 'sort', 'order', 'limit', 'page']) {
      const val = m[key];
      if (val == null || val === '') continue;
      p.set(key, String(val));
    }
    const s = p.toString();
    return s ? `/users?${s}` : '/users';
  }

  render(res, 'users/list', {
    title: 'Users',
    users: result.rows,
    dt: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
      q: kw,
      role: roleFilter,
      sort,
      order: ord,
    },
    usersQuery,
  });
}

function newUserForm(_req, res) {
  render(res, 'users/form', { title: 'New user', mode: 'new', editUser: null, error: null });
}

async function createUserAdmin(req, res) {
  const schema = z.object({
    name: z.string().min(1).max(120),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(['super_admin', 'client']),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return render(res, 'users/form', {
      title: 'New user',
      mode: 'new',
      editUser: null,
      error: parsed.error.issues.map((i) => i.message).join(', '),
    });
  }
  const { name, email, password, role } = parsed.data;
  const existing = await q.findUserByEmail(email);
  if (existing) {
    return render(res, 'users/form', {
      title: 'New user',
      mode: 'new',
      editUser: null,
      error: 'Email sudah dipakai.',
    });
  }
  const hash = await bcrypt.hash(password, 10);
  await q.createUser({ email, password_hash: hash, name, role });
  res.redirect('/users');
}

async function editUserForm(req, res) {
  const id = Number(req.params.id);
  const editUser = await q.getUserById(id);
  if (!editUser) return res.status(404).send('User not found');
  render(res, 'users/form', { title: 'Edit user', mode: 'edit', editUser, error: null });
}

async function updateUserAdmin(req, res) {
  const id = Number(req.params.id);
  const existing = await q.getUserById(id);
  if (!existing) return res.status(404).send('User not found');

  const schema = z.object({
    name: z.string().min(1).max(120),
    email: z.string().email(),
    role: z.enum(['super_admin', 'client']),
    password: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return render(res, 'users/form', {
      title: 'Edit user',
      mode: 'edit',
      editUser: existing,
      error: parsed.error.issues.map((i) => i.message).join(', '),
    });
  }
  const { name, email, role } = parsed.data;
  const pwd = parsed.data.password != null ? String(parsed.data.password).trim() : '';
  if (pwd && pwd.length < 6) {
    return render(res, 'users/form', {
      title: 'Edit user',
      mode: 'edit',
      editUser: existing,
      error: 'Password minimal 6 karakter (kosongkan jika tidak diganti).',
    });
  }

  const emailOwner = await q.findUserByEmail(email);
  if (emailOwner && emailOwner.id !== id) {
    return render(res, 'users/form', {
      title: 'Edit user',
      mode: 'edit',
      editUser: existing,
      error: 'Email sudah dipakai user lain.',
    });
  }

  if (existing.role === 'super_admin' && role === 'client') {
    const n = await q.countUsersByRole('super_admin');
    if (n <= 1) {
      return render(res, 'users/form', {
        title: 'Edit user',
        mode: 'edit',
        editUser: existing,
        error: 'Minimal harus ada satu super admin.',
      });
    }
  }

  let password_hash;
  if (pwd) password_hash = await bcrypt.hash(pwd, 10);

  await q.updateUserById(id, { email, name, role, password_hash });
  res.redirect('/users');
}

async function showWaBlast(req, res) {
  const site = await loadSiteOrReject(req, res);
  if (!site) return;
  let history = [];
  try {
    history = await q.listWaBlastsBySite(site.id, 15);
  } catch (_) {
    history = [];
  }
  render(res, 'sites/wa-blast', {
    title: 'WhatsApp blast',
    site,
    history,
    results: null,
    form: { phones: '', message: '' },
    flash: null,
  });
}

async function submitWaBlast(req, res) {
  const site = await loadSiteOrReject(req, res);
  if (!site) return;
  const message = String(req.body.message != null ? req.body.message : '').slice(0, 3500);
  const phonesText = String(req.body.phones != null ? req.body.phones : '');
  const saveHistory = req.body.save_history === '1' || req.body.save_history === 'on';

  const lines = waPhone.parsePhoneList(phonesText);
  const ok = [];
  const errors = [];
  for (const line of lines) {
    const parsed = waPhone.parsePhoneLine(line);
    if (!parsed) continue;
    if (parsed.error) {
      errors.push({ raw: parsed.raw, error: parsed.error });
    } else {
      const wa_link = waPhone.buildWaMeLink(parsed.e164, message);
      ok.push({ phone_raw: parsed.raw, phone_e164: parsed.e164, wa_link });
    }
  }

  let history = [];
  try {
    history = await q.listWaBlastsBySite(site.id, 15);
  } catch (_) {
    history = [];
  }

  let flash = null;
  if (saveHistory && ok.length) {
    try {
      await q.createWaBlastWithRecipients(site.id, req.user.id, message, ok);
      await q.logActivity(site.id, req.user.id, 'wa_blast.create', { count: ok.length });
      history = await q.listWaBlastsBySite(site.id, 15);
      flash = { type: 'success', message: `Riwayat disimpan (${ok.length} nomor).` };
    } catch (err) {
      console.error('wa_blast save', err);
      flash = { type: 'error', message: 'Gagal menyimpan riwayat. Jalankan migrasi database terbaru atau coba lagi.' };
    }
  }

  render(res, 'sites/wa-blast', {
    title: 'WhatsApp blast',
    site,
    history,
    results: { ok, errors },
    form: { phones: phonesText, message },
    flash,
  });
}

async function deleteUserAdmin(req, res) {
  const id = Number(req.params.id);
  if (id === req.user.id) {
    return res.status(400).send('Tidak bisa menghapus akun yang sedang login.');
  }
  const target = await q.getUserById(id);
  if (!target) return res.status(404).send('User not found');
  if (target.role === 'super_admin') {
    const n = await q.countUsersByRole('super_admin');
    if (n <= 1) {
      return res.status(400).send('Tidak bisa menghapus satu-satunya super admin.');
    }
  }
  await q.deleteUserById(id);
  const ref = req.get('referer') || '';
  try {
    const u = new URL(ref, `${req.protocol}://${req.get('host') || 'localhost'}`);
    if (u.pathname === '/users') {
      return res.redirect(u.pathname + (u.search || ''));
    }
  } catch (_) {}
  return res.redirect('/users');
}

function parseApplicablePlansFromBody(body) {
  const keys = ['starter', 'standard', 'premium'];
  const picked = keys.filter((k) => body[`plan_${k}`] === '1' || body[`plan_${k}`] === 'on');
  if (picked.length === 0) return null;
  return JSON.stringify(picked);
}

/** datetime-local → MySQL DATETIME string */
function normalizeMysqlDatetimeLocal(s) {
  if (!s || !String(s).trim()) return null;
  let x = String(s).trim().replace('T', ' ');
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(x)) x += ':00';
  return x;
}

async function listPromoCodesPage(req, res) {
  if (req.user.role !== 'super_admin') return res.status(403).send('Forbidden');
  const promos = await q.listPromoCodes();
  const notice = String(req.query.notice || '');
  const err = String(req.query.err || '');
  let promoNotice = '';
  if (notice === 'created') promoNotice = 'Kode promo ditambahkan.';
  else if (notice === 'updated') promoNotice = 'Kode promo diperbarui.';
  else if (notice === 'deleted') promoNotice = 'Kode promo dihapus.';
  let promoError = '';
  if (err === 'duplicate') promoError = 'Kode sudah dipakai. Pilih kode lain.';
  else if (err === 'invalid') promoError = 'Data tidak valid. Periksa isian.';
  render(res, 'promo-codes', { title: 'Kode promo', promos, promoNotice, promoError });
}

async function createPromoCodeAdmin(req, res) {
  if (req.user.role !== 'super_admin') return res.status(403).send('Forbidden');
  try {
    const code = String(req.body.code || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z0-9_-]{3,48}$/.test(code)) return res.redirect('/promo-codes?err=invalid');
    const discountType = req.body.discount_type === 'fixed' ? 'fixed' : 'percent';
    let discountValue = Math.max(0, Math.floor(Number(req.body.discount_value) || 0));
    if (discountType === 'percent') discountValue = Math.min(100, discountValue);
    await q.createPromoCode({
      code,
      description: req.body.description ? String(req.body.description).slice(0, 255) : null,
      discount_type: discountType,
      discount_value: discountValue,
      max_uses: req.body.max_uses === '' || req.body.max_uses == null ? null : req.body.max_uses,
      per_user_limit: req.body.per_user_limit || 1,
      valid_from: normalizeMysqlDatetimeLocal(req.body.valid_from),
      valid_until: normalizeMysqlDatetimeLocal(req.body.valid_until),
      applicable_plans_json: parseApplicablePlansFromBody(req.body),
      active: req.body.active === '1' || req.body.active === 'on',
    });
    return res.redirect('/promo-codes?notice=created');
  } catch (e) {
    if (String(e.message || '').includes('Duplicate') || String(e.code) === 'ER_DUP_ENTRY') {
      return res.redirect('/promo-codes?err=duplicate');
    }
    console.error('createPromoCodeAdmin', e);
    return res.redirect('/promo-codes?err=invalid');
  }
}

async function updatePromoCodeAdmin(req, res) {
  if (req.user.role !== 'super_admin') return res.status(403).send('Forbidden');
  const id = Number(req.params.id);
  if (!id) return res.redirect('/promo-codes?err=invalid');
  const existing = await q.getPromoCodeById(id);
  if (!existing) return res.redirect('/promo-codes?err=invalid');
  try {
    const discountType = req.body.discount_type === 'fixed' ? 'fixed' : 'percent';
    let discountValue = Math.max(0, Math.floor(Number(req.body.discount_value) || 0));
    if (discountType === 'percent') discountValue = Math.min(100, discountValue);
    await q.updatePromoCode(id, {
      description: req.body.description ? String(req.body.description).slice(0, 255) : null,
      discount_type: discountType,
      discount_value: discountValue,
      max_uses: req.body.max_uses === '' || req.body.max_uses == null ? null : req.body.max_uses,
      per_user_limit: req.body.per_user_limit || 1,
      valid_from: normalizeMysqlDatetimeLocal(req.body.valid_from),
      valid_until: normalizeMysqlDatetimeLocal(req.body.valid_until),
      applicable_plans_json: parseApplicablePlansFromBody(req.body),
      active: req.body.active === '1' || req.body.active === 'on',
    });
    return res.redirect('/promo-codes?notice=updated');
  } catch (e) {
    console.error('updatePromoCodeAdmin', e);
    return res.redirect('/promo-codes?err=invalid');
  }
}

async function deletePromoCodeAdmin(req, res) {
  if (req.user.role !== 'super_admin') return res.status(403).send('Forbidden');
  const id = Number(req.params.id);
  if (!id) return res.redirect('/promo-codes?err=invalid');
  await q.deletePromoCode(id);
  return res.redirect('/promo-codes?notice=deleted');
}

function accountSafeForView(full) {
  if (!full) return null;
  return {
    id: full.id,
    email: full.email,
    name: full.name,
    role: full.role,
    auth_provider: full.auth_provider,
    email_verified_at: full.email_verified_at,
    hasLocalPassword: Boolean(full.password_hash),
  };
}

async function accountSettingsPage(req, res) {
  const full = await q.findUserByEmail(req.user.email);
  if (!full) return res.redirect('/login');
  const mailConfigured = mailSvc.isSmtpConfigured();
  let noticeMsg = '';
  let errMsg = '';
  const notice = req.query && String(req.query.notice || '');
  const err = req.query && String(req.query.err || '');
  const notices = {
    profile: 'Nama profil diperbarui.',
    password: 'Password berhasil diubah.',
    email: 'Email diubah. Periksa kotak masuk alamat baru untuk verifikasi.',
    verify_resent: 'Email verifikasi dikirim ulang. Periksa inbox dan folder spam.',
    verify_none_needed: 'Email Anda sudah terverifikasi.',
  };
  const errors = {
    profile_invalid: 'Nama tidak valid (1–120 karakter).',
    password_nomatch: 'Password baru dan konfirmasi tidak sama.',
    password_weak: 'Password baru minimal 6 karakter.',
    password_wrong: 'Password saat ini salah.',
    password_google: 'Akun ini masuk via Google — tidak ada password lokal untuk diubah.',
    email_invalid: 'Format email baru tidak valid.',
    email_taken: 'Email sudah dipakai akun lain.',
    email_wrong_pw: 'Password konfirmasi salah.',
    email_google: 'Ubah email dengan password hanya untuk akun email + password.',
    verify_rate: 'Terlalu sering meminta email verifikasi. Coba lagi nanti.',
    verify_smtp: 'Server email belum dikonfigurasi — tautan verifikasi tidak bisa dikirim.',
    verify_send_fail: 'Gagal mengirim email. Coba lagi atau hubungi dukungan.',
  };
  if (notice && notices[notice]) noticeMsg = notices[notice];
  if (err && errors[err]) errMsg = errors[err];
  render(res, 'account-settings', {
    title: 'Pengaturan akun',
    account: accountSafeForView(full),
    mailConfigured,
    noticeMsg,
    errMsg,
    requireEmailVerifiedStrict: String(process.env.REQUIRE_EMAIL_VERIFIED || '').trim() === 'true',
  });
}

async function submitAccountProfile(req, res) {
  const schema = z.object({ name: z.string().min(1).max(120) });
  const parsed = schema.safeParse({ name: req.body && req.body.name });
  if (!parsed.success) return res.redirect('/settings?err=profile_invalid');
  await q.updateUserById(req.user.id, {
    email: req.user.email,
    name: parsed.data.name,
    role: req.user.role,
  });
  return res.redirect('/settings?notice=profile');
}

async function submitAccountPassword(req, res) {
  const full = await q.findUserByEmail(req.user.email);
  if (!full || !full.password_hash) return res.redirect('/settings?err=password_google');
  const schema = z.object({
    current_password: z.string().min(1),
    new_password: z.string().min(6),
    new_password_confirm: z.string().min(6),
  });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return res.redirect('/settings?err=password_weak');
  const { current_password, new_password, new_password_confirm } = parsed.data;
  if (new_password !== new_password_confirm) return res.redirect('/settings?err=password_nomatch');
  const ok = await bcrypt.compare(current_password, full.password_hash);
  if (!ok) return res.redirect('/settings?err=password_wrong');
  const hash = await bcrypt.hash(new_password, 10);
  await q.updateUserPasswordHash(req.user.id, hash);
  await q.bumpUserTokenVersion(req.user.id);
  const updated = await q.getUserById(req.user.id);
  setAuthCookie(res, signToken(updated));
  return res.redirect('/settings?notice=password');
}

async function submitAccountEmail(req, res) {
  const full = await q.findUserByEmail(req.user.email);
  if (!full || !full.password_hash) return res.redirect('/settings?err=email_google');
  const schema = z.object({
    new_email: z.string().email(),
    password: z.string().min(6),
  });
  const parsed = schema.safeParse({
    new_email: req.body && req.body.new_email,
    password: req.body && req.body.password,
  });
  if (!parsed.success) return res.redirect('/settings?err=email_invalid');
  const newEmail = parsed.data.new_email.trim().toLowerCase();
  const { password } = parsed.data;
  const ok = await bcrypt.compare(password, full.password_hash);
  if (!ok) return res.redirect('/settings?err=email_wrong_pw');
  const taken = await q.findUserByEmail(newEmail);
  if (taken && taken.id !== req.user.id) return res.redirect('/settings?err=email_taken');
  await q.updateUserEmail(req.user.id, newEmail);
  await q.bumpUserTokenVersion(req.user.id);
  const updated = await q.getUserById(req.user.id);
  setAuthCookie(res, signToken(updated));
  accountEmail.sendEmailVerification(updated.id, newEmail, req).catch((e) => console.warn('[email verify]', e.message || e));
  return res.redirect('/settings?notice=email');
}

async function submitResendVerificationEmail(req, res) {
  const full = await q.findUserByEmail(req.user.email);
  if (!full) return res.redirect('/login');
  if (full.email_verified_at) return res.redirect('/settings?notice=verify_none_needed');
  if (!mailSvc.isSmtpConfigured()) return res.redirect('/settings?err=verify_smtp');
  try {
    await accountEmail.sendEmailVerification(full.id, full.email, req);
  } catch (e) {
    console.warn('[resend verify]', e.message || e);
    return res.redirect('/settings?err=verify_send_fail');
  }
  return res.redirect('/settings?notice=verify_resent');
}

module.exports = {
  root,
  homePage,
  pricingPage,
  publicCatalogPage,
  landingCmsPage,
  saveLandingCms,
  showLogin,
  submitLogin,
  logout,
  themeGallery,
  showRegisterPage,
  submitRegister,
  listUsersPage,
  newUserForm,
  createUserAdmin,
  editUserForm,
  updateUserAdmin,
  deleteUserAdmin,
  dashboard,
  billingPage,
  createBillingCheckout,
  handleMidtransWebhook,
  newSitePage,
  createSite,
  showSite,
  saveSiteContent,
  saveSiteSections,
  saveSiteSettings,
  publishSite,
  unpublishSite,
  createCollectionItem,
  mutateCollectionItem,
  previewSite,
  syncThemes,
  updateWorkflowStatus,
  exportSiteRsvpsCsv,
  showWaBlast,
  submitWaBlast,
  listPromoCodesPage,
  createPromoCodeAdmin,
  updatePromoCodeAdmin,
  deletePromoCodeAdmin,
  accountSettingsPage,
  submitResendVerificationEmail,
  submitAccountProfile,
  submitAccountPassword,
  submitAccountEmail,
};
