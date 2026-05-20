(function () {
  const siteCtx = window.__SITE__ || {};
  const apiBase = siteCtx.apiBase || '/api';
  const slug = siteCtx.slug;
  let allWishes = Array.isArray(window.__WISHES__) ? window.__WISHES__.slice() : [];

  function g(id) {
    return document.getElementById(id);
  }

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function showToast(msg) {
    const t = g('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3200);
  }

  function postJson(path, body) {
    return fetch(apiBase + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((res) =>
      res.json().then((data) => {
        if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
        return data;
      })
    );
  }

  const loader = g('loader');
  const coverContent = g('coverContent');
  setTimeout(() => {
    if (loader) loader.classList.add('hidden');
    setTimeout(() => {
      if (coverContent) coverContent.classList.add('visible');
    }, 200);
  }, 850);

  const appWrap = g('appWrap');
  const openBtn = g('openBtn');
  const coverSection = g('coverSection');
  const mainScroll = g('mainScroll');
  const keepHeroVisible = !!siteCtx.keepHeroVisibleAfterOpen;

  function observeReveals() {
    if (!mainScroll) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('visible');
        });
      },
      { threshold: 0.12, root: mainScroll }
    );
    document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
  }

  if (openBtn && appWrap && mainScroll) {
    openBtn.addEventListener('click', () => {
      openBtn.setAttribute('aria-expanded', 'true');
      appWrap.classList.remove('inv-closed');
      appWrap.classList.add('inv-open');
      if (coverSection) {
        if (keepHeroVisible) {
          coverSection.style.minHeight = 'auto';
        } else {
          coverSection.classList.add('cover-dismissed');
          coverSection.hidden = true;
          coverSection.setAttribute('aria-hidden', 'true');
        }
      }
      mainScroll.scrollTop = 0;
      setTimeout(observeReveals, 120);
    });
  } else if (appWrap && mainScroll) {
    appWrap.classList.remove('inv-closed');
    appWrap.classList.add('inv-open');
    setTimeout(observeReveals, 80);
  }

  if (mainScroll) {
    mainScroll.addEventListener('scroll', () => {
      const bar = g('progressBar');
      if (!bar) return;
      const st = mainScroll.scrollTop;
      const sh = mainScroll.scrollHeight - mainScroll.clientHeight;
      const pct = sh > 0 ? (st / sh) * 100 : 0;
      bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
    });
  }

  let bgAudio = null;
  const musicBtn = g('musicBtn');
  const musicUrl = siteCtx.musicUrl;
  if (musicBtn && musicUrl) {
    bgAudio = new Audio(musicUrl);
    bgAudio.loop = true;
    musicBtn.addEventListener('click', () => {
      if (!bgAudio) return;
      if (bgAudio.paused) {
        bgAudio.play().then(() => musicBtn.classList.add('playing')).catch(() => {});
      } else {
        bgAudio.pause();
        musicBtn.classList.remove('playing');
      }
    });
    if (siteCtx.musicAutoplay) {
      bgAudio.play().then(() => musicBtn.classList.add('playing')).catch(() => {});
    }
  }

  function renderWishes() {
    const list = g('wishesList');
    if (!list) return;
    list.innerHTML = '';
    const sorted = allWishes.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (!sorted.length) {
      const p = document.createElement('p');
      p.id = 'noWishes';
      p.style.cssText = 'text-align:center;opacity:0.45;font-size:14px;font-style:italic;margin:0';
      p.textContent = 'Jadilah yang pertama meninggalkan ucapan hangat 💕';
      list.appendChild(p);
    } else {
      sorted.forEach((w) => {
        const card = document.createElement('div');
        card.className = 'wish-card';
        const initial = escHtml((w.guest_name || '?').charAt(0).toUpperCase());
        card.innerHTML =
          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
          '<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--secondary));display:flex;align-items:center;justify-content:center;color:#fff;font-family:Great Vibes,cursive;font-size:18px">' +
          initial +
          '</div><div><p style="margin:0;font-family:Cormorant Garamond,serif;font-size:16px;font-weight:600">' +
          escHtml(w.guest_name) +
          '</p></div></div>' +
          (w.message
            ? '<p style="margin:0;font-size:14px;line-height:1.65;opacity:0.75;font-style:italic">&ldquo;' +
              escHtml(w.message) +
              '&rdquo;</p>'
            : '');
        list.appendChild(card);
      });
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
  renderWishes();

  const rsvpForm = g('rsvpForm');
  if (rsvpForm) {
    rsvpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = g('rsvpSubmitBtn');
      if (!slug) {
        showToast('Situs tidak tersedia.');
        return;
      }
      const orig = btn ? btn.textContent : '';
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Mengirim…';
      }
      try {
        const attendEl = document.querySelector('input[name="attend"]:checked');
        const guestsEl = g('rsvpGuests');
        const phoneEl = g('rsvpPhone');
        await postJson('/public/site/' + encodeURIComponent(slug) + '/rsvps', {
          guest_name: g('rsvpName') ? String(g('rsvpName').value).trim() : '',
          guest_phone: phoneEl && String(phoneEl.value).trim() ? String(phoneEl.value).trim().slice(0, 40) : null,
          attendance: attendEl && attendEl.value === 'no' ? 'no' : 'yes',
          guests_count: guestsEl ? Math.min(20, Math.max(1, parseInt(guestsEl.value, 10) || 1)) : 1,
          notes: g('rsvpMsg') && String(g('rsvpMsg').value).trim() ? String(g('rsvpMsg').value).trim() : null,
        });
        showToast('RSVP terkirim. Terima kasih!');
        rsvpForm.reset();
        if (guestsEl) guestsEl.value = '1';
        const yes = g('attendYes');
        if (yes) yes.checked = true;
      } catch (err) {
        showToast(err.message || 'Gagal mengirim RSVP');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = orig || 'Kirim RSVP';
        }
      }
    });
  }

  const wishForm = g('wishForm');
  if (wishForm) {
    wishForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!slug) return;
      const btn = g('wishBtn');
      if (btn) btn.disabled = true;
      try {
        const data = await postJson('/public/site/' + encodeURIComponent(slug) + '/wishes', {
          guest_name: g('wishName') ? String(g('wishName').value).trim() : '',
          message: g('wishMsg') ? String(g('wishMsg').value).trim() : '',
        });
        if (data && data.wish) allWishes.unshift(data.wish);
        renderWishes();
        showToast('Ucapan terkirim.');
        wishForm.reset();
      } catch (err) {
        showToast(err.message || 'Gagal mengirim ucapan');
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
})();
