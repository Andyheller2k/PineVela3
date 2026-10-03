// Disposable test fixtures only. Never used by the application or operational persistence.
const crypto = require('node:crypto');
function sessionFixtureJson(value) {
  const result = structuredClone(value);
  const visit = record => {
    if (!record || typeof record !== 'object') return;
    if (!Array.isArray(record)) {
      const raw = record.token || record.merchantToken || record.sessionToken || record.user?.token;
      if (raw) {
        const now = Date.now();
        const session = { tokenHash: crypto.createHash('sha256').update(raw).digest('hex'), issuedAt: now, expiresAt: now + 86400000 };
        record.session = session;
        if (record.user) { record.user.session = { ...session }; delete record.user.token; }
        for (const key of ['token', 'merchantToken', 'sessionToken']) delete record[key];
      }
    }
    Object.values(record).forEach(visit);
  };
  visit(result);
  return JSON.stringify(result);
}
module.exports = { sessionFixtureJson };
