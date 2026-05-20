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

  const appWrapper = g('appWrapper');
  const openBtn = g('openInviteBtn');
  const contentSections = g('contentSections');
  const coverSection = g('coverSection');

  function observeReveals() {
    if (!appWrapper) return;
    const els = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('visible');
        });
      },
      { threshold: 0.12, root: appWrapper }
    );
    els.forEach((el) => io.observe(el));
  }

  const keepHeroVisible = !!siteCtx.keepHeroVisibleAfterOpen;

  if (openBtn && contentSections) {
    openBtn.addEventListener('click', () => {
      contentSections.classList.remove('content-sections-hidden');
      contentSections.classList.add('content-sections-open');
      contentSections.style.display = 'block';
      if (coverSection) {
        if (keepHeroVisible) {
          coverSection.style.minHeight = 'auto';
        } else {
          coverSection.classList.add('cover-dismissed');
          coverSection.hidden = true;
          coverSection.setAttribute('aria-hidden', 'true');
        }
      }
      if (appWrapper) appWrapper.scrollTop = 0;
      contentSections.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(observeReveals, 300);
    });
  } else if (contentSections) {
    contentSections.classList.remove('content-sections-hidden');
    contentSections.classList.add('content-sections-open');
    contentSections.style.display = 'block';
  }

  if (appWrapper) {
    appWrapper.addEventListener('scroll', () => {
      const sp = g('scroll-progress');
      if (!sp) return;
      const st = appWrapper.scrollTop;
      const sh = appWrapper.scrollHeight - appWrapper.clientHeight;
      const p = sh > 0 ? (st / sh) * 100 : 0;
      sp.style.width = p + '%';
    });
  }

  const flowersEl = g('flowers-container');
  if (flowersEl) {
    const flowerEmojis = ['🌸', '🌹', '🌺', '🍃', '🌷', '✿', '❀'];
    function createFlower() {
      const el = document.createElement('div');
      el.className = 'floating-flower';
      el.textContent = flowerEmojis[Math.floor(Math.random() * flowerEmojis.length)];
      el.setAttribute('aria-hidden', 'true');
      el.style.left = Math.random() * 100 + '%';
      el.style.fontSize = 12 + Math.random() * 14 + 'px';
      el.style.animationDuration = 8 + Math.random() * 12 + 's';
      el.style.animationDelay = Math.random() * 2 + 's';
      flowersEl.appendChild(el);
      setTimeout(() => el.remove(), 22000);
    }
    setInterval(createFlower, 3000);
    createFlower();
    createFlower();
  }

  /** Background music (MP3 URL dari admin) */
  let bgAudio = null;
  const musicBtn = g('musicBtn');
  const musicUrl = siteCtx.musicUrl;
  if (musicBtn && musicUrl) {
    bgAudio = new Audio(musicUrl);
    bgAudio.loop = true;
    musicBtn.addEventListener('click', () => {
      if (!bgAudio) return;
      if (bgAudio.paused) {
        bgAudio.play().then(() => {
          musicBtn.classList.add('playing');
        }).catch(() => {});
      } else {
        bgAudio.pause();
        musicBtn.classList.remove('playing');
      }
    });
    if (siteCtx.musicAutoplay) {
      bgAudio.play().then(() => {
        musicBtn.classList.add('playing');
      }).catch(() => {});
    }
  }

  function updateCountdown() {
    const iso = siteCtx.weddingDate;
    const container = g('countdown');
    if (!container || !iso) return;
    const wedding = new Date(String(iso).replace(' ', 'T'));
    const now = new Date();
    const diff = wedding - now;
    if (diff <= 0) {
      container.innerHTML =
        '<p style="color:var(--warm-gold);font-family:Cormorant Garamond,serif;font-size:1.25rem;margin:0;">Hari yang dinanti telah tiba. ♥</p>';
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const items = [
      ['Hari', d],
      ['Jam', h],
      ['Menit', m],
      ['Detik', s],
    ];
    container.innerHTML = items
      .map(
        ([label, val]) =>
          `<div style="text-align:center;min-width:3.5rem;"><p class="font-serif-elegant" style="font-size:clamp(1.5rem,5vw,2rem);color:var(--warm-gold);margin:0;">${val}</p><p style="font-size:0.65rem;letter-spacing:0.12em;color:var(--text-muted);text-transform:uppercase;margin:0.35rem 0 0;">${label}</p></div>`
      )
      .join('');
  }
  if (g('countdown')) {
    updateCountdown();
    setInterval(updateCountdown, 1000);
  }

  function renderWishes() {
    const list = g('wishesList');
    if (!list) return;
    list.innerHTML = '';
    const sorted = allWishes.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    sorted.forEach((w) => {
      const div = document.createElement('div');
      div.className = 'wish-card';
      div.innerHTML = `<p style="color:var(--text-light);font-size:0.9rem;font-style:italic;line-height:1.5;">&ldquo;${escHtml(w.message)}&rdquo;</p><p style="color:var(--warm-gold);font-size:0.8rem;margin-top:0.5rem;">— ${escHtml(w.guest_name)}</p>`;
      list.appendChild(div);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
  renderWishes();

  const rsvpForm = g('rsvpForm');
  if (rsvpForm) {
    rsvpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = g('rsvpBtn');
      const status = g('rsvpStatus');
      if (!slug) {
        if (status) {
          status.textContent = 'Situs tidak tersedia.';
          status.classList.add('is-visible');
        }
        return;
      }
      const orig = btn ? btn.textContent : '';
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Mengirim...';
      }
      try {
        const nameEl = g('rsvpName');
        const phoneEl = g('rsvpPhone');
        const attendEl = g('rsvpAttend');
        const guestsEl = g('rsvpGuests');
        const msgEl = g('rsvpMsg');
        await postJson('/public/site/' + encodeURIComponent(slug) + '/rsvps', {
          guest_name: nameEl ? String(nameEl.value).trim() : '',
          guest_phone: phoneEl && String(phoneEl.value).trim() ? String(phoneEl.value).trim().slice(0, 40) : null,
          attendance: attendEl && attendEl.value === 'no' ? 'no' : 'yes',
          guests_count: guestsEl ? Math.min(20, Math.max(1, parseInt(guestsEl.value, 10) || 1)) : 1,
          notes: msgEl && String(msgEl.value).trim() ? String(msgEl.value).trim() : null,
        });
        if (status) {
          status.textContent = 'Terima kasih, RSVP Anda telah kami terima.';
          status.classList.add('is-visible');
        }
        rsvpForm.reset();
        if (guestsEl) guestsEl.value = '1';
      } catch (err) {
        if (status) {
          status.textContent = 'Gagal mengirim: ' + (err.message || '');
          status.classList.add('is-visible');
        }
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
      const btn = g('wishBtn');
      const st = g('wishStatus');
      if (!slug) return;
      if (btn) btn.disabled = true;
      try {
        const data = await postJson('/public/site/' + encodeURIComponent(slug) + '/wishes', {
          guest_name: g('wishName') ? String(g('wishName').value).trim() : '',
          message: g('wishMsg') ? String(g('wishMsg').value).trim() : '',
        });
        if (data && data.wish) {
          allWishes.unshift(data.wish);
          renderWishes();
        }
        if (st) {
          st.textContent = 'Ucapan terkirim. Terima kasih!';
          st.classList.add('is-visible');
        }
        wishForm.reset();
      } catch (err) {
        if (st) {
          st.textContent = err.message || 'Gagal mengirim ucapan.';
          st.classList.add('is-visible');
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  observeReveals();
  if (typeof lucide !== 'undefined') lucide.createIcons();
})();
