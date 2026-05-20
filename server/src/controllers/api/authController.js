const bcrypt = require('bcryptjs');
const { z } = require('zod');
const q = require('../../models/queries');
const { signToken, jwtExpiresInSeconds, setAuthCookie, clearAuthCookie } = require('../../middleware/auth');
const accountEmail = require('../../services/accountEmail');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1).max(120),
});

async function login(req, res) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });

  const email = parsed.data.email.trim().toLowerCase();
  const { password } = parsed.data;
  const user = await q.findUserByEmail(email);
  if (!user) return res.status(401).json({ error: 'invalid credentials' });

  if (!user.password_hash) {
    return res.status(401).json({ error: 'invalid credentials', hint: 'use_google_oauth' });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });

  const token = signToken(user);
  setAuthCookie(res, token);
  const expires_in = jwtExpiresInSeconds(token);
  return res.json({
    token,
    ...(expires_in != null ? { expires_in } : {}),
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}

async function register(req, res) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });

  const email = parsed.data.email.trim().toLowerCase();
  const { password, name } = parsed.data;
  const existing = await q.findUserByEmail(email);
  if (existing) return res.status(409).json({ error: 'email already registered' });

  const hash = await bcrypt.hash(password, 10);
  const user = await q.createUser({
    email,
    password_hash: hash,
    name,
    role: 'client',
    auth_provider: 'local',
    google_sub: null,
    email_verified_at: null,
  });
  const token = signToken(user);
  setAuthCookie(res, token);
  const expires_in = jwtExpiresInSeconds(token);
  accountEmail.sendEmailVerification(user.id, email, req).catch((e) => console.warn('[email verify]', e.message || e));
  return res.status(201).json({ token, ...(expires_in != null ? { expires_in } : {}), user });
}

async function logout(req, res) {
  try {
    if (req.user) await q.bumpUserTokenVersion(req.user.id);
  } catch (e) {
    console.warn('[api logout]', e.message || e);
  }
  clearAuthCookie(res);
  res.json({ ok: true });
}

function me(req, res) {
  res.json({ user: req.user });
}

const patchMeSchema = z.object({
  name: z.string().min(1).max(120),
});

async function patchMe(req, res) {
  const parsed = patchMeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });
  const { name } = parsed.data;
  const updated = await q.updateUserById(req.user.id, {
    email: req.user.email,
    name,
    role: req.user.role,
  });
  return res.json({ user: updated });
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

async function changePassword(req, res) {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });
  const full = await q.findUserByEmail(req.user.email);
  if (!full || !full.password_hash) {
    return res.status(400).json({ error: 'password_change_not_allowed', hint: 'google_or_passwordless' });
  }
  const ok = await bcrypt.compare(parsed.data.currentPassword, full.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid current password' });
  const hash = await bcrypt.hash(parsed.data.newPassword, 10);
  await q.updateUserPasswordHash(req.user.id, hash);
  await q.bumpUserTokenVersion(req.user.id);
  const updated = await q.getUserById(req.user.id);
  const token = signToken(updated);
  setAuthCookie(res, token);
  const expires_in = jwtExpiresInSeconds(token);
  return res.json({ ok: true, token, ...(expires_in != null ? { expires_in } : {}) });
}

const changeEmailSchema = z.object({
  newEmail: z.string().email(),
  password: z.string().min(6),
});

async function changeEmail(req, res) {
  const parsed = changeEmailSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });
  const newEmail = parsed.data.newEmail.trim().toLowerCase();
  const { password } = parsed.data;
  const full = await q.findUserByEmail(req.user.email);
  if (!full || !full.password_hash) {
    return res.status(400).json({ error: 'email_change_requires_password' });
  }
  const ok = await bcrypt.compare(password, full.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid password' });
  const taken = await q.findUserByEmail(newEmail);
  if (taken && taken.id !== req.user.id) return res.status(409).json({ error: 'email already registered' });
  await q.updateUserEmail(req.user.id, newEmail);
  await q.bumpUserTokenVersion(req.user.id);
  const updated = await q.getUserById(req.user.id);
  const token = signToken(updated);
  setAuthCookie(res, token);
  const expires_in = jwtExpiresInSeconds(token);
  accountEmail.sendEmailVerification(updated.id, newEmail, req).catch((e) => console.warn('[email verify]', e.message || e));
  return res.json({ ok: true, user: updated, token, ...(expires_in != null ? { expires_in } : {}) });
}

module.exports = { login, register, logout, me, patchMe, changePassword, changeEmail };
