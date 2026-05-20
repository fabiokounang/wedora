(function () {
  const siteCtx = window.__SITE__ || {};
  const apiBase = siteCtx.apiBase || '/api';
  const slug = siteCtx.slug;

  function postJson(path, body) {
    return fetch(apiBase + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((res) => res.json().then((data) => {
      if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
      return data;
    }));
  }

  const rsvpForm = document.getElementById('tambahdata');
  if (rsvpForm) {
    rsvpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('tombolsimpan');
      if (!slug) return;
      const nameEl = rsvpForm.querySelector('input[name="name"]');
      const phoneEl = rsvpForm.querySelector('input[name="no_hp"]');
      const countEl = rsvpForm.querySelector('input[name="jumlah"]');
      const statusEl = rsvpForm.querySelector('select[name="status"]');
      if (btn) {
        btn.disabled = true;
      }
      try {
        const attendance = statusEl && statusEl.value === '1' ? 'yes' : 'no';
        const phoneVal = phoneEl && String(phoneEl.value).trim() ? String(phoneEl.value).trim().slice(0, 40) : null;
        await postJson('/public/site/' + encodeURIComponent(slug) + '/rsvps', {
          guest_name: nameEl ? String(nameEl.value).trim() : '',
          guest_phone: phoneVal,
          attendance,
          guests_count: countEl ? Math.min(20, Math.max(1, parseInt(countEl.value, 10) || 1)) : 1,
          notes: null,
        });
        if (typeof iziToast !== 'undefined') {
          iziToast.success({ message: 'RSVP terkirim. Terima kasih!' });
        }
        rsvpForm.reset();
      } catch (err) {
        if (typeof iziToast !== 'undefined') {
          iziToast.error({ message: err.message || 'Gagal mengirim RSVP' });
        }
      } finally {
        if (btn) {
          btn.disabled = false;
        }
      }
    });
  }

  const wishForm = document.getElementById('guestbook_form');
  if (wishForm) {
    wishForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!slug) return;
      const btn = document.getElementById('guestbook_submit_btn');
      const nameEl = wishForm.querySelector('input[name="name"]');
      const msgEl = wishForm.querySelector('textarea[name="comment"]');
      if (btn) btn.disabled = true;
      try {
        await postJson('/public/site/' + encodeURIComponent(slug) + '/wishes', {
          guest_name: nameEl ? String(nameEl.value).trim() : '',
          message: msgEl ? String(msgEl.value).trim() : '',
        });
        if (typeof iziToast !== 'undefined') {
          iziToast.success({ message: 'Ucapan terkirim.' });
        }
        wishForm.reset();
      } catch (err) {
        if (typeof iziToast !== 'undefined') {
          iziToast.error({ message: err.message || 'Gagal mengirim' });
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  const yt = siteCtx.streamYoutubeId;
  if (yt && typeof YT !== 'undefined' && YT.Player) {
    /* Player init lives in theme scripts; optional sync if API loads after */
  }
})();
