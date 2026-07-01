'use strict';
/**
 * /api/inventory
 *
 * GET  ?view=low_stock
 *   → { items: [...low stock items] }
 *
 * GET  ?item_id=UUID
 *   → { item, transactions: [...recent], variance: [...] }
 *
 * GET  (no params)
 *   → { items: [...all active items with current_qty] }
 *
 * POST (transaction) { item_id, type, qty, reason?, appointment_id?, batch_number?, expiry_date? }
 *   type: 'in' | 'out' | 'adjustment' | 'write_off' | 'return'
 *   qty: always positive — direction is determined by type
 *   → 201 { success: true, transaction_id, new_qty }
 *
 * POST (new item) { _action: 'create_item', name, category, unit, ... }
 *   → 201 { success: true, itemId }
 */
const { adminClient, cors, parseBody, PRACTICE_ID, requireStaff } = require('./_lib/supabase');

// Types where qty goes down
const OUT_TYPES = new Set(['out', 'write_off']);

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  const user = await requireStaff(req, res);
  if (!user) return;

  const db = adminClient();

  // ── GET ────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { view, item_id } = req.query;

    // Low-stock alert view
    if (view === 'low_stock') {
      const { data, error } = await db
        .from('v_low_stock')
        .select('*')
        .eq('practice_id', PRACTICE_ID);
      if (error) return res.status(500).json({ error: 'Could not retrieve low-stock items' });
      return res.status(200).json({ items: data || [] });
    }

    // Single item with transaction history + variance
    if (item_id) {
      const { data: item, error: itemErr } = await db
        .from('inventory_items')
        .select('*')
        .eq('practice_id', PRACTICE_ID)
        .eq('id', item_id)
        .is('deleted_at', null)
        .single();

      if (itemErr || !item) return res.status(404).json({ error: 'Item not found' });

      const { data: transactions } = await db
        .from('inventory_transactions')
        .select('id, type, qty, qty_before, qty_after, unit_cost, reason, batch_number, expiry_date, created_at, appointments(id, appointment_date)')
        .eq('item_id', item_id)
        .eq('practice_id', PRACTICE_ID)
        .order('created_at', { ascending: false })
        .limit(100);

      const { data: variance } = await db
        .from('v_inventory_variance')
        .select('service_name, avg_actual_qty, avg_expected_qty, avg_variance, data_points')
        .eq('practice_id', PRACTICE_ID)
        .eq('item_name', item.name);

      return res.status(200).json({
        item,
        transactions: transactions || [],
        variance:     variance || [],
      });
    }

    // Full item list
    const { data, error } = await db
      .from('inventory_items')
      .select('id, name, category, unit, current_qty, reorder_threshold, reorder_qty, cost_per_unit, supplier, storage_location, active')
      .eq('practice_id', PRACTICE_ID)
      .is('deleted_at', null)
      .order('category', { ascending: true })
      .order('name',     { ascending: true });

    if (error) return res.status(500).json({ error: 'Could not retrieve inventory items' });
    return res.status(200).json({ items: data || [] });
  }

  // ── POST ───────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = await parseBody(req);

    // Create a new inventory item
    if (body._action === 'create_item') {
      const { name, category, unit, reorder_threshold, reorder_qty, cost_per_unit, supplier, supplier_sku, storage_location, expiry_tracking } = body;
      if (!name?.trim() || !unit?.trim()) {
        return res.status(400).json({ error: 'name and unit are required' });
      }

      const { data, error } = await db
        .from('inventory_items')
        .insert({
          practice_id:       PRACTICE_ID,
          name:              name.trim(),
          category:          category || 'other',
          unit:              unit.trim(),
          current_qty:       0,
          reorder_threshold: reorder_threshold ?? null,
          reorder_qty:       reorder_qty ?? null,
          cost_per_unit:     cost_per_unit ?? null,
          supplier:          supplier?.trim() || null,
          supplier_sku:      supplier_sku?.trim() || null,
          storage_location:  storage_location?.trim() || null,
          expiry_tracking:   expiry_tracking ?? false,
        })
        .select('id')
        .single();

      if (error) return res.status(500).json({ error: 'Could not create inventory item' });
      return res.status(201).json({ success: true, itemId: data.id });
    }

    // Record a stock transaction
    const {
      item_id, type, qty,
      reason        = null,
      appointment_id = null,
      batch_number  = null,
      expiry_date   = null,
      unit_cost     = null,
    } = body;

    if (!item_id || !type || qty == null) {
      return res.status(400).json({ error: 'item_id, type and qty are required' });
    }
    if (!['in','out','adjustment','write_off','return'].includes(type)) {
      return res.status(400).json({ error: 'Invalid transaction type' });
    }
    if (Number(qty) <= 0) {
      return res.status(400).json({ error: 'qty must be a positive number' });
    }

    // Determine signed qty — out types subtract
    const signedQty = OUT_TYPES.has(type) ? -Math.abs(Number(qty)) : Math.abs(Number(qty));

    // Verify item belongs to this practice
    const { data: item, error: itemErr } = await db
      .from('inventory_items')
      .select('id, current_qty, name')
      .eq('practice_id', PRACTICE_ID)
      .eq('id', item_id)
      .is('deleted_at', null)
      .single();

    if (itemErr || !item) return res.status(404).json({ error: 'Item not found' });

    // Guard against negative stock
    if (item.current_qty + signedQty < 0) {
      return res.status(422).json({
        error: `Insufficient stock. Current: ${item.current_qty}, requested: ${qty}`,
      });
    }

    // Insert transaction — the DB trigger updates current_qty automatically
    const { data: tx, error: txErr } = await db
      .from('inventory_transactions')
      .insert({
        practice_id:    PRACTICE_ID,
        item_id,
        type,
        qty:            signedQty,
        qty_before:     item.current_qty,   // trigger will overwrite, but good to send
        qty_after:      item.current_qty + signedQty,
        unit_cost,
        appointment_id,
        reason,
        batch_number,
        expiry_date,
      })
      .select('id, qty_after')
      .single();

    if (txErr) {
      console.error('[inventory POST]', txErr);
      return res.status(500).json({ error: 'Could not record transaction' });
    }

    return res.status(201).json({
      success:        true,
      transaction_id: tx.id,
      new_qty:        tx.qty_after,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
