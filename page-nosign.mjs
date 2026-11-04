// page-nosign.mjs — what the live page gets when voice-core.mjs asks for node:crypto (the page's import map points here).
// The page imports voice-core.mjs for its rules, its drafting and its near-duplicate check, so the gated logic is the live
// logic; signing a request to X happens only in voice.mjs, on the owner's machine, with the owner's keys. Never on a page.
const never = () => { throw new Error('signing happens only in voice.mjs on the owner’s machine, never on the page'); };
export const createHmac = never;
export const randomBytes = never;
