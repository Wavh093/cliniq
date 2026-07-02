// Shared document header for generated clinical documents (sick notes,
// referral letters, prescriptions). When the practice has uploaded a
// letterhead image in web Settings we print it full-width across the top;
// otherwise we fall back to the text header used previously.

export interface LetterheadParams {
  letterhead: string | null;   // base64 data URL, or null
  practiceName: string;
  practiceNumber: string | null;
  dateText: string;            // already-formatted date string
}

/** HTML for the top-of-page header. Safe to interpolate into a document body. */
export function letterheadHeader(p: LetterheadParams): string {
  if (p.letterhead && p.letterhead.startsWith('data:')) {
    return `<div class="lhimg">
      <img src="${p.letterhead}" alt="letterhead" style="width:100%;max-height:150px;object-fit:contain;display:block;">
      <div class="lhdate">${p.dateText}</div>
    </div>`;
  }
  return `<div class="lh">
    <div>
      <div class="pn">${p.practiceName}</div>
      <div class="ps">Professional Dental Care</div>
      ${p.practiceNumber ? `<p style="margin:2px 0;font-size:12px;color:#6b7280">Practice No: ${p.practiceNumber}</p>` : ''}
    </div>
    <div class="dd">${p.dateText}</div>
  </div>`;
}

/** Extra CSS the letterhead-image header relies on. Append to the doc <style>. */
export const LETTERHEAD_CSS = `
  .lhimg{border-bottom:3px solid #0a4a5c;margin-bottom:28px;padding-bottom:14px;}
  .lhdate{font-size:13px;color:#6b7280;text-align:right;margin-top:8px;}
`;
