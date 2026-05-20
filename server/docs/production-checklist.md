# Production checklist

Target ~100+ undangan aktif: satu Node + MySQL dengan backup rutin biasanya cukup; sesuaikan pool DB dan hosting jika traffic RSVP/wishes tinggi.

## 1. Konfigurasi lingkungan

- `NODE_ENV=production`
- `JWT_SECRET` — string acak panjang (bukan placeholder dev).
- `COOKIE_SECURE=true` — **wajib** jika situs pakai HTTPS (cookie JWT tidak boleh lewat HTTP cleartext).
- `PUBLIC_APP_URL=https://domain-anda.com` — untuk redirect Midtrans, link email, OAuth.
- `GOOGLE_OAUTH_REDIRECT_URI` — sama persis dengan Authorized redirect URI di Google Console (HTTPS production).
- Midtrans: `MIDTRANS_IS_PRODUCTION=true`, kunci production, webhook URL dapat dijangkau dari internet (`POST /vendor/midtrans/webhook`).

## 2. Email & verifikasi

- Isi `MAIL_SMTP_*` + `MAIL_FROM`; restart server dan pastikan log boot `[mail] SMTP OK`.
- Opsional ketat: `REQUIRE_EMAIL_VERIFIED=true` — klien harus verifikasi email sebelum billing dan membuat undangan baru (`/sites/new`).
- Pastikan inbox/spam dikuji untuk reset password dan verifikasi.

## 3. Basis data & backup

- Migrasi: `npm run migrate`, atau otomatis lewat `prestart` saat `npm start` / `predev` saat `npm run dev`.
- **Render + TiDB:** `render.yaml` menjalankan `preDeployCommand: npm run migrate` sebelum deploy. Set `DB_SSL=true` untuk TiDB Cloud.
- Error `Unknown column 'music_enabled' in 'sites'`: DB production belum dapat migrasi musik. Redeploy (jalankan `014_site_music_columns.sql`) atau di TiDB Console jalankan:
  ```sql
  ALTER TABLE sites ADD COLUMN music_enabled TINYINT(1) NOT NULL DEFAULT 0;
  ALTER TABLE sites ADD COLUMN music_autoplay TINYINT(1) NOT NULL DEFAULT 0;
  ALTER TABLE sites ADD COLUMN music_url VARCHAR(1024) NULL;
  ```
  Pastikan log deploy menampilkan `> running migration 014_site_music_columns.sql`.
- Jika TiDB hanya menyediakan satu database (tanpa hak `CREATE DATABASE`): buat DB di panel, set `DB_NAME`, opsional `DB_SKIP_CREATE_DATABASE=true`.
- Backup otomatis harian — `npm run db:backup` (output di `server/backups/`). Perlu `mysqldump` di PATH; restore: `DB_RESTORE_CONFIRM=yes npm run db:restore -- path/to/file.sql.gz` (butuh `mysql` CLI).
- Uji **restore** ke staging sekali per kuarter.
- Untuk skala lebih besar: pertimbangkan `DB_POOL_CONNECTION_LIMIT` (default 10; naikkan pelan-pelan dan pantau).

## 4. Observabilitas

- Opsional: `SENTRY_DSN` untuk error tracking (`expressIntegration` + `setupExpressErrorHandler` di `app.js`).
- Monitoring uptime: ping `GET /health` (ringan). Untuk dependency DB gunakan `GET /health/deep` (returns 503 jika DB down).
- Log aplikasi: arahkan stdout ke aggregator atau rotasi log OS (mis. journald / IIS / PM2 logs).

## 5. Keamanan & sesi

- JWT menyertakan `tv` (token_version). Logout dan ganti password menaikkan versi — token lama tidak valid (Bearer maupun cookie).
- Rotate secret OAuth / Midtrans jika pernah bocor.

## 6. Skala (~100+ undangan)

- Undangan banyak ≠ banyak koneksi DB bersamaan; yang membebani adalah traffic tamu (RSVP, wishes, render). Pantau CPU MySQL dan latency.
- Migrasi `013_rsvp_wishes_indexes.sql` — indeks komposit `(site_id, created_at)` / wishes untuk daftar tamu.
- Rate limit tamu: per **IP + slug** (`PUBLIC_RSVP_WISH_WRITE_*`, `PUBLIC_WISHES_READ_*`) — satu IP tidak memblokir undangan lain.
- Cache asset tema: `THEME_PUBLIC_MAX_AGE_MS` (default 1 jam di production).
- Sesuaikan `DB_POOL_CONNECTION_LIMIT` dan resource server; CDN di depan static tema jika traffic tinggi.

## 7. Keamanan tambahan (sudah di kode)

- Helmet: HSTS (jika `COOKIE_SECURE=true`), `referrerPolicy`, `dnsPrefetchControl`.
- Rate limit login/register (`AUTH_LOGIN_*`, `AUTH_REGISTER_*`).
- Kirim ulang verifikasi: **Pengaturan akun** → tombol + `RESEND_VERIFY_MAX`.
