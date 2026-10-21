import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// customer.config.json (optional, never required) sets branding and vocabulary. Only these keys are read; anything else is ignored.
// The shipped default is a neutral utility skin. Values are plain text and rendered as text, never as markup.
export const DEFAULTS = { brand: { name: 'Worker Agent Demo' }, vertical: 'utility', defaultChannel: 'teams', vocabulary: { person: 'Person', agent: 'Agent' } };

const clean = (v, max = 60) => String(v ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim().slice(0, max);

export function loadCustomer(file = fileURLToPath(new URL('../../customer.config.json', import.meta.url))) {
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* none or unreadable: defaults */ }
  const voc = raw && typeof raw.vocabulary === 'object' && raw.vocabulary ? raw.vocabulary : {};
  return {
    brand: { name: clean(raw?.brand?.name) || DEFAULTS.brand.name },
    vertical: clean(raw?.vertical, 30) || DEFAULTS.vertical,
    defaultChannel: clean(raw?.defaultChannel, 30) || DEFAULTS.defaultChannel,
    vocabulary: { person: clean(voc.person, 24) || DEFAULTS.vocabulary.person, agent: clean(voc.agent, 24) || DEFAULTS.vocabulary.agent },
  };
}
