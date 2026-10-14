// Where a trial lead came from (audit item 8). The server keeps only these
// exact values (backend/utils/trialValidation.js pickTrialSource), so the
// lists here must match it.

export const HEARD_FROM = Object.freeze([
  'google', 'instagram', 'facebook', 'tiktok', 'youtube', 'whatsapp',
  'friend_family', 'mosque_community', 'ai_assistant', 'other',
]);

// Which form was used, from the `source` the quick-trial and exit-intent
// forms already send. The home page's trial section sends none.
const TRIAL_FORMS = { 'hero-quick-trial': 'quick_trial', 'exit-intent': 'exit_intent' };
export const TRIAL_FORM_VALUES = Object.freeze(['trial_section', 'quick_trial', 'exit_intent']);

export function trialFormFor(source) {
  return TRIAL_FORMS[source] || 'trial_section';
}

// Campaign tags from the page the form is submitted on (our own Instagram,
// WhatsApp and ad links carry them). Read at submit time only: nothing is
// stored in the browser. Same strict pattern as the GA module, so an email
// address or phone number in a tag is dropped.
const CAMPAIGN_VALUE_RE = /^[A-Za-z0-9._-]{1,100}$/;

export function campaignTags(search = window.location.search) {
  const query = new URLSearchParams(search);
  const out = {};
  for (const [param, field] of [['utm_source', 'utmSource'], ['utm_medium', 'utmMedium'], ['utm_campaign', 'utmCampaign']]) {
    const value = query.get(param);
    if (value && CAMPAIGN_VALUE_RE.test(value)) out[field] = value;
  }
  return out;
}
