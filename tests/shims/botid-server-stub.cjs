/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Test-only replacement for `botid/server`. The Vercel BotID runtime
 * classifies incoming requests using headers injected by the matching
 * `<BotIdClient />` on the upload portal. In tests we have no BotID
 * runtime; we want to drive both the bot-detected (403) and the
 * not-a-bot branches without standing one up.
 *
 * `bootstrap.cjs` redirects every `require("botid/server")` to this
 * shim. Tests configure the verdict via `setBotIdVerdict({ isBot })`.
 *
 * The default is `{ isBot: false }` so tests that don't care don't have
 * to wire anything up — exactly mirroring the real package's documented
 * dev behaviour.
 */
let verdict = { isBot: false };

async function checkBotId() {
  return verdict;
}

function setBotIdVerdict(next) {
  verdict = next;
}

function resetBotIdVerdict() {
  verdict = { isBot: false };
}

module.exports = {
  checkBotId,
  setBotIdVerdict,
  resetBotIdVerdict,
};
