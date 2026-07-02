'use strict';
/**
 * Unit tests for the claim scrubber (api/_lib/claimScrub.js).
 *   node scripts/claim-scrub-test.js
 */
const { scrubClaim } = require('../api/_lib/claimScrub');

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; failures.push(name); console.log(`  FAIL ${name}${extra !== undefined ? ' — ' + JSON.stringify(extra) : ''}`); }
}

const REF = {
  validCodes: new Set(['8101', '8341', '8107']),
  authCodes:  new Set(['8341']),
  toothCodes: new Set(['8341', '8107']),
  feeByCode:  new Map([['8341', 900], ['8101', 500], ['8107', 700]]),
  today: '2026-07-02',
};

const base = {
  scheme_membership_no: '1234567890',
  date_of_service: '2026-07-01',
  icd10_codes: ['K02.9'],
  lines: [{ code: '8101', fee_charged: 450, qty: 1 }],
};

console.log('Claim scrubber');

// Happy path
let r = scrubClaim(base, REF);
check('valid claim → ok, no errors', r.ok && r.errors.length === 0, r);

// Missing membership
r = scrubClaim({ ...base, scheme_membership_no: '' }, REF);
check('missing membership → error', !r.ok && r.errors.some(e => /membership/i.test(e)));

// Missing / future / bad DOS
check('missing DOS → error', !scrubClaim({ ...base, date_of_service: '' }, REF).ok);
check('future DOS → error', scrubClaim({ ...base, date_of_service: '2027-01-01' }, REF).errors.some(e => /future/i.test(e)));
check('bad DOS format → error', scrubClaim({ ...base, date_of_service: '01/07/2026' }, REF).errors.some(e => /YYYY-MM-DD/.test(e)));

// ICD-10 required + format
check('no ICD-10 → error', !scrubClaim({ ...base, icd10_codes: [] }, REF).ok);
check('bad ICD-10 → warning', scrubClaim({ ...base, icd10_codes: ['XYZ'] }, REF).warnings.some(w => /ICD-10/.test(w)));

// Lines
check('no lines → error', !scrubClaim({ ...base, lines: [] }, REF).ok);
check('unknown code → error', scrubClaim({ ...base, lines: [{ code: '9999', fee_charged: 100, qty: 1 }] }, REF).errors.some(e => /not an active tariff/.test(e)));
check('zero fee → error', scrubClaim({ ...base, lines: [{ code: '8101', fee_charged: 0, qty: 1 }] }, REF).errors.some(e => /greater than zero/.test(e)));
check('fractional qty → error', scrubClaim({ ...base, lines: [{ code: '8101', fee_charged: 100, qty: 1.5 }] }, REF).errors.some(e => /whole number/.test(e)));

// Warnings (do NOT block)
r = scrubClaim({ ...base, lines: [{ code: '8341', fee_charged: 1200, qty: 1 }] }, REF);
check('over-scheme fee → warning only, still ok', r.ok && r.warnings.some(w => /exceeds the scheme rate/.test(w)), r);
check('tooth code w/o tooth → warning', r.warnings.some(w => /tooth-specific/.test(w)));
check('auth code w/o auth number → warning', r.warnings.some(w => /pre-authorisation/.test(w)));

r = scrubClaim({ ...base, lines: [{ code: '8341', fee_charged: 800, qty: 1, tooth: '99' }], auth_number: 'A1' }, REF);
check('invalid FDI tooth → warning', r.warnings.some(w => /valid FDI/.test(w)));
check('valid tooth + auth → no tooth/auth warnings', !r.warnings.some(w => /tooth-specific|pre-authorisation/.test(w)));

// Fee exactly at scheme rate is fine
r = scrubClaim({ ...base, lines: [{ code: '8101', fee_charged: 500, qty: 1 }] }, REF);
check('fee at scheme rate → no over-fee warning', !r.warnings.some(w => /exceeds/.test(w)));

// No reference data (validCodes empty) → don't false-positive on unknown codes
r = scrubClaim(base, { today: '2026-07-02' });
check('no ref data → structural checks only, still ok', r.ok, r);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { console.log('Failures:', failures); process.exit(1); }
