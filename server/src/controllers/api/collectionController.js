const q = require('../../models/queries');

const ALLOWED = Object.keys(q.COLLECTION_TABLES);

function validateTable(req, res, next) {
  const { table } = req.params;
  if (!ALLOWED.includes(table)) return res.status(404).json({ error: 'unknown collection' });
  if (table === 'gift_accounts' && req.method === 'PATCH') {
    console.log('[api gift] validateTable OK → controller.update');
  }
  next();
}

async function list(req, res) {
  const items = await q.listCollection(req.params.table, req.site.id);
  res.json({ items });
}

async function create(req, res) {
  try {
    const item = await q.createCollectionItem(req.params.table, req.site.id, req.body || {});
    await q.logActivity(req.site.id, req.user.id, `${req.params.table}.create`, { id: item.id });
    res.status(201).json({ item });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function update(req, res) {
  const { table, siteId, id } = req.params;
  const gift = table === 'gift_accounts';
  const t0 = Date.now();

  if (gift) {
    const body = req.body || {};
    console.log('[api gift] update start', {
      siteId,
      siteDbId: req.site.id,
      itemId: id,
      userId: req.user.id,
      bodyKeys: Object.keys(body),
      payload: {
        bank_name: body.bank_name,
        account_name: body.account_name,
        account_number: body.account_number,
        qr_image_url: body.qr_image_url,
        sort_order: body.sort_order,
      },
    });
  }

  try {
    const item = await q.updateCollectionItem(table, req.site.id, Number(id), req.body || {});

    if (gift) {
      console.log('[api gift] update after DB', {
        ms: Date.now() - t0,
        found: !!item,
        row: item
          ? {
              id: item.id,
              bank_name: item.bank_name,
              account_name: item.account_name,
              account_number: item.account_number,
              qr_image_url: item.qr_image_url,
              sort_order: item.sort_order,
            }
          : null,
      });
    }

    if (!item) {
      if (gift) console.log('[api gift] update 404 — row missing', { siteId, itemId: id });
      return res.status(404).json({ error: 'not found' });
    }

    await q.logActivity(req.site.id, req.user.id, `${table}.update`, { id: item.id });

    if (gift) console.log('[api gift] update selesai OK', { ms: Date.now() - t0, itemId: item.id });

    res.json({ item });
  } catch (err) {
    if (gift) console.error('[api gift] update error', err.message, err.stack);
    res.status(400).json({ error: err.message });
  }
}

async function remove(req, res) {
  const ok = await q.deleteCollectionItem(req.params.table, req.site.id, Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'not found' });
  await q.logActivity(req.site.id, req.user.id, `${req.params.table}.delete`, { id: Number(req.params.id) });
  res.json({ ok: true });
}

module.exports = { validateTable, list, create, update, remove };
