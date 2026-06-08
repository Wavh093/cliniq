-- ============================================================
-- OH Dental Studio — Migration 003: Indexes
-- ============================================================

-- ── staff ─────────────────────────────────────────────────────
CREATE INDEX idx_staff_practice      ON staff(practice_id);
CREATE INDEX idx_staff_user          ON staff(user_id);

-- ── practice_schedule ─────────────────────────────────────────
CREATE INDEX idx_schedule_practice   ON practice_schedule(practice_id);

-- ── services ──────────────────────────────────────────────────
CREATE INDEX idx_services_practice   ON services(practice_id);

-- ── patients ──────────────────────────────────────────────────
CREATE INDEX idx_patients_practice   ON patients(practice_id);
-- Full-text search on name + email for the admin search bar
CREATE INDEX idx_patients_search     ON patients
  USING GIN (to_tsvector('english', first_name || ' ' || last_name || ' ' || COALESCE(email, '')));
-- Demographics queries (referral source, suburb, DOB range)
CREATE INDEX idx_patients_referral   ON patients(practice_id, referral_source);
CREATE INDEX idx_patients_suburb     ON patients(practice_id, suburb);
CREATE INDEX idx_patients_dob        ON patients(practice_id, date_of_birth);

-- ── appointments ──────────────────────────────────────────────
-- Primary admin calendar query: practice + date range
CREATE INDEX idx_appts_practice_date ON appointments(practice_id, appointment_date);
-- Patient history
CREATE INDEX idx_appts_patient       ON appointments(patient_id, appointment_date DESC);
-- Service analytics
CREATE INDEX idx_appts_service       ON appointments(service_id);
-- Status filtering
CREATE INDEX idx_appts_status        ON appointments(practice_id, status);
-- Upcoming reminders
CREATE INDEX idx_appts_reminder      ON appointments(practice_id, appointment_date)
  WHERE reminder_sent = false
    AND status IN ('pending', 'confirmed')
    AND deleted_at IS NULL;

-- ── contact_submissions ───────────────────────────────────────
CREATE INDEX idx_contact_practice    ON contact_submissions(practice_id, created_at DESC);
CREATE INDEX idx_contact_status      ON contact_submissions(practice_id, status);

-- ── inventory_items ───────────────────────────────────────────
CREATE INDEX idx_inv_items_practice  ON inventory_items(practice_id);
-- Items below reorder threshold (low-stock alert query)
CREATE INDEX idx_inv_low_stock       ON inventory_items(practice_id)
  WHERE current_qty <= reorder_threshold
    AND active = true
    AND deleted_at IS NULL;

-- ── inventory_transactions ────────────────────────────────────
CREATE INDEX idx_inv_tx_item         ON inventory_transactions(item_id, created_at DESC);
CREATE INDEX idx_inv_tx_appointment  ON inventory_transactions(appointment_id)
  WHERE appointment_id IS NOT NULL;
CREATE INDEX idx_inv_tx_practice     ON inventory_transactions(practice_id, created_at DESC);
-- Analytics: consumption by type per practice
CREATE INDEX idx_inv_tx_type         ON inventory_transactions(practice_id, type, created_at DESC);

-- ── service_inventory_map ─────────────────────────────────────
CREATE INDEX idx_sim_service         ON service_inventory_map(service_id);
CREATE INDEX idx_sim_item            ON service_inventory_map(item_id);

-- ── appointment_actuals ───────────────────────────────────────
CREATE INDEX idx_actuals_appointment ON appointment_actuals(appointment_id);
CREATE INDEX idx_actuals_item        ON appointment_actuals(item_id);

-- ── audit_log ─────────────────────────────────────────────────
CREATE INDEX idx_audit_practice      ON audit_log(practice_id, changed_at DESC);
CREATE INDEX idx_audit_record        ON audit_log(table_name, record_id, changed_at DESC);
