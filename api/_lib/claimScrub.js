'use strict';
/**
 * Claim scrubber — pre-submission validation for medical-aid claims.
 *
 * Mirrors what SA switching systems (Healthbridge, MediCharge/VeriClaim, GoodX)
 * do before a claim reaches the scheme: "won't let you submit unless it's
 * correct". Catching these locally avoids rejections and the days-long
 * resubmission cycle.
 *
 * Pure and side-effect free so it can be unit-tested and run either server-side
 * (before persisting/submitting a claim) or surfaced to the UI as a dry-run.
 *
 * Severity model:
 *   - errors   → structural problems that WILL cause a reject. Block submission.
 *   - warnings → likely problems (missing tooth/surface/auth, fee over scheme
 *                rate). Surfaced but never block — SA tariff rules vary by
 *                scheme and we must not stop a legitimate claim on a heuristic.
 *
 * @param {object} claim
 *   @param {Array}  claim.lines            [{ code, description?, tooth?/tooth_number?, surface?, qty?, fee_charged }]
 *   @param {Array}  [claim.icd10_codes]    primary + secondary ICD-10 codes
 *   @param {string} [claim.scheme_membership_no]
 *   @param {string} [claim.auth_number]
 *   @param {string} [claim.date_of_service] YYYY-MM-DD
 * @param {object} ref   reference data resolved from the DB by the caller
 *   @param {Set<string>} ref.validCodes     active tariff codes
 *   @param {Set<string>} ref.authCodes      codes flagged requires_auth
 *   @param {Set<string>} ref.toothCodes     codes flagged requires_tooth
 *   @param {Map<string,number>} [ref.feeByCode]  NRPL/scheme fee per code (for over-charge warnings)
 *   @param {string} [ref.today]             YYYY-MM-DD (defaults to real today)
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
function scrubClaim(claim = {}, ref = {}) {
  const errors = [];
  const warnings = [];

  const validCodes = ref.validCodes || new Set();
  const authCodes  = ref.authCodes  || new Set();
  const toothCodes = ref.toothCodes || new Set();
  const feeByCode  = ref.feeByCode  || new Map();
  const today      = ref.today || new Date().toISOString().slice(0, 10);

  const lines = Array.isArray(claim.lines) ? claim.lines : [];
  const icd10 = Array.isArray(claim.icd10_codes) ? claim.icd10_codes.filter(Boolean) : [];

  // ── Header-level checks ──────────────────────────────────────────
  const membership = (claim.scheme_membership_no || '').trim();
  if (!membership) {
    errors.push('Membership number is required.');
  } else if (!/^[A-Za-z0-9][A-Za-z0-9 \-\/]{2,19}$/.test(membership)) {
    warnings.push('Membership number looks unusual — double-check it before submitting.');
  }

  const dos = (claim.date_of_service || '').trim();
  if (!dos) {
    errors.push('Date of service is required.');
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(dos)) {
    errors.push('Date of service must be YYYY-MM-DD.');
  } else if (dos > today) {
    errors.push('Date of service is in the future.');
  }

  // SA schemes require at least a primary diagnosis (ICD-10).
  if (!icd10.length) {
    errors.push('At least one ICD-10 diagnosis code is required.');
  } else {
    for (const code of icd10) {
      // ICD-10 format: letter, 2 digits, optional ".x" extension
      if (!/^[A-Za-z]\d{2}(\.[A-Za-z0-9]{1,4})?$/.test(String(code).trim())) {
        warnings.push(`ICD-10 code "${code}" doesn't look valid.`);
      }
    }
  }

  // ── Line-level checks ────────────────────────────────────────────
  if (!lines.length) {
    errors.push('A claim must have at least one line item.');
  }

  let needsAuth = false;
  lines.forEach((l, i) => {
    const n = i + 1;
    const code = (l.code || '').trim();
    const tooth = (l.tooth ?? l.tooth_number ?? '').toString().trim();
    const surface = (l.surface || '').toString().trim();
    const qty = l.qty == null ? 1 : Number(l.qty);
    const fee = Number(l.fee_charged);

    if (!code) {
      errors.push(`Line ${n}: procedure code is required.`);
    } else if (validCodes.size && !validCodes.has(code)) {
      errors.push(`Line ${n}: code "${code}" is not an active tariff code.`);
    }

    if (isNaN(fee) || fee <= 0) {
      errors.push(`Line ${n}: fee must be greater than zero.`);
    } else if (feeByCode.has(code)) {
      const scheme = feeByCode.get(code);
      if (scheme > 0 && fee > scheme * 1.0001) {
        warnings.push(`Line ${n}: fee R${fee.toFixed(2)} exceeds the scheme rate R${scheme.toFixed(2)} for ${code} — the patient may carry the shortfall.`);
      }
    }

    if (isNaN(qty) || qty < 1 || !Number.isInteger(qty)) {
      errors.push(`Line ${n}: quantity must be a whole number of at least 1.`);
    }

    if (code && toothCodes.has(code)) {
      if (!tooth) {
        warnings.push(`Line ${n}: code ${code} is tooth-specific but no tooth number is set.`);
      } else if (!/^[1-8][1-8]$/.test(tooth)) {
        warnings.push(`Line ${n}: "${tooth}" is not a valid FDI tooth number (11–48).`);
      }
    }

    if (code && authCodes.has(code)) needsAuth = true;
  });

  if (needsAuth && !(claim.auth_number || '').trim()) {
    warnings.push('One or more codes usually need a pre-authorisation number, but none is set.');
  }

  return { ok: errors.length === 0, errors, warnings };
}

module.exports = { scrubClaim };
