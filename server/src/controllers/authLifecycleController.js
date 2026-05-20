const bcrypt = require('bcryptjs');
const { z } = require('zod');
const q = require('../models/queries');
const { hashRawToken } = require('../utils/accountToken');
const accountEmail = require('../services/accountEmail');

function render(res, view, data = {}) {
  const locals = {
    user: res.locals.user || null,
    title: data.title || 'Akun',
    flash: data.flash || null,
    error: null,
    ...data,
  };
  if (['login', 'register', 'forgot-password', 'reset-password'].includes(view)) locals.authSplit = true;
  res.render(view, locals, (err, body) => {
    if (err) throw err;
    res.render('layout', { ...locals, body });
  });
}

function showForgotPassword(req, res) {
  if (req.user) return res.redirect('/dashboard');
  render(res, 'forgot-password', { title: 'Lupa password', info: null });
}

const forgotSchema = z.object({ email: z.string().email() });

async function submitForgotPassword(req, res) {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) {
    return render(res, 'forgot-password', { title: 'Lupa password', error: 'Email tidak valid.' });
  }
  const { email } = parsed.data;
  const user = await q.findUserByEmail(email);
  const generic =
    'Jika email terdaftar dan memakai password, kami telah mengirim tautan reset (periksa folder spam).';
  if (user && user.password_hash) {
    try {
      await accountEmail.issuePasswordResetForUser(user.id, req);
    } catch (e) {
      console.warn('[forgot-password]', e.message || e);
    }
  }
  return render(res, 'forgot-password', { title: 'Lupa password', error: null, info: generic });
}

function showResetPassword(req, res) {
  if (req.user) return res.redirect('/dashboard');
  const token = req.query && req.query.token ? String(req.query.token) : '';
  if (!token) {
    return render(res, 'reset-password', { title: 'Reset password', error: 'Tautan tidak valid atau kadaluarsa.' });
  }
  render(res, 'reset-password', { title: 'Reset password', token, error: null });
}

const resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(6),
});

async function submitResetPassword(req, res) {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    return render(res, 'reset-password', {
      title: 'Reset password',
      token: req.body && req.body.token,
      error: 'Password minimal 6 karakter.',
    });
  }
  const { token, password } = parsed.data;
  const tokenHash = hashRawToken(token);
  const row = await q.findValidUserToken('password_reset', tokenHash);
  if (!row) {
    return render(res, 'reset-password', { title: 'Reset password', token: '', error: 'Tautan tidak valid atau kadaluarsa.' });
  }
  const hash = await bcrypt.hash(password, 10);
  await q.updateUserPasswordHash(row.user_id, hash);
  await q.bumpUserTokenVersion(row.user_id);
  await q.markUserTokenUsed(row.id);
  await q.deletePendingUserTokens(row.user_id, 'password_reset');
  return res.redirect('/login?reset=1');
}

async function verifyEmailFromLink(req, res) {
  const token = req.query && req.query.token ? String(req.query.token) : '';
  if (!token) return res.redirect('/login?verify=invalid');
  const tokenHash = hashRawToken(token);
  const row = await q.findValidUserToken('email_verify', tokenHash);
  if (!row) return res.redirect('/login?verify=invalid');
  await q.setUserEmailVerifiedNow(row.user_id);
  await q.markUserTokenUsed(row.id);
  await q.deletePendingUserTokens(row.user_id, 'email_verify');
  return res.redirect('/login?verified=1');
}

async function forgotPasswordApi(req, res) {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });
  const { email } = parsed.data;
  const user = await q.findUserByEmail(email);
  if (user && user.password_hash) {
    try {
      await accountEmail.issuePasswordResetForUser(user.id, req);
    } catch (e) {
      console.warn('[api forgot-password]', e.message || e);
    }
  }
  return res.json({ ok: true, message: 'If the email is registered with a password, a reset link was sent.' });
}

const resetApiSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(6),
});

async function resetPasswordApi(req, res) {
  const parsed = resetApiSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });
  const { token, password } = parsed.data;
  const tokenHash = hashRawToken(token);
  const row = await q.findValidUserToken('password_reset', tokenHash);
  if (!row) return res.status(400).json({ error: 'invalid or expired token' });
  const hash = await bcrypt.hash(password, 10);
  await q.updateUserPasswordHash(row.user_id, hash);
  await q.bumpUserTokenVersion(row.user_id);
  await q.markUserTokenUsed(row.id);
  await q.deletePendingUserTokens(row.user_id, 'password_reset');
  return res.json({ ok: true });
}

module.exports = {
  showForgotPassword,
  submitForgotPassword,
  showResetPassword,
  submitResetPassword,
  verifyEmailFromLink,
  forgotPasswordApi,
  resetPasswordApi,
};
