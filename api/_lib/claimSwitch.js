'use strict';
/**
 * Claim-switch adapter.
 *
 * SA practice systems (Healthbridge, GoodX, MediCharge/VeriClaim) submit claims
 * in real time to medical schemes through a "switch" (MediSwitch, Healthbridge)
 * and get an immediate accept/reject + benefit response. Wiring a real switch
 * needs a commercial agreement, credentials and an EDI/host-to-host connection,
 * so it can't live in this repo directly.
 *
 * This module is the seam. Everything the app needs — submit a claim, get a
 * status back — goes through a `ClaimSwitch` with one method, `submit(claim)`.
 * A working `manual` implementation ships today (front desk submits the claim
 * to the scheme out-of-band and the app just records it as submitted). To add a
 * real switch later, implement the same interface and select it via the
 * `CLAIM_SWITCH` env var — no caller changes.
 *
 * @typedef {object} ClaimSubmitResult
 * @property {'submitted'|'accepted'|'rejected'|'error'} status
 * @property {string|null} reference   scheme/switch reference, if any
 * @property {string} message          human-readable outcome
 * @property {object}  [raw]           raw switch response (for audit)
 *
 * @typedef {object} ClaimSwitch
 * @property {string} name
 * @property {(claim: object) => Promise<ClaimSubmitResult>} submit
 */

/** Manual mode — no live switch. The claim is marked submitted; the practice
 *  transmits it to the scheme through their existing channel. */
const manualSwitch = {
  name: 'manual',
  async submit(claim) {
    return {
      status: 'submitted',
      reference: null,
      message: 'Claim marked as submitted. Send it to the scheme through your usual channel; capture the remittance when it returns.',
    };
  },
};

/**
 * Real-switch template. Left unimplemented on purpose — fill in the HTTP/EDI
 * call to the provider and map their response onto ClaimSubmitResult. Needs
 * (typically): SWITCH_BASE_URL, SWITCH_API_KEY / practice credentials, and the
 * scheme destination code. See docs/CLAIMS_SWITCH.md.
 */
function makeHttpSwitch(name) {
  return {
    name,
    async submit(_claim) {
      return {
        status: 'error',
        reference: null,
        message: `The "${name}" claim switch is not configured on this deployment. Set CLAIM_SWITCH=manual or implement makeHttpSwitch().`,
      };
    },
  };
}

/** Select the active switch from the CLAIM_SWITCH env var (default: manual). */
function getClaimSwitch() {
  const which = (process.env.CLAIM_SWITCH || 'manual').toLowerCase();
  switch (which) {
    case 'manual': return manualSwitch;
    case 'healthbridge':
    case 'mediswitch': return makeHttpSwitch(which);
    default:
      console.warn(`[claimSwitch] unknown CLAIM_SWITCH="${which}" — falling back to manual`);
      return manualSwitch;
  }
}

module.exports = { getClaimSwitch, manualSwitch, makeHttpSwitch };
