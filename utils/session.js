// In-memory session store for multi-step flows
// Each key is telegramId, value is { step, data }
const sessions = {};

function getSession(telegramId) {
  return sessions[telegramId] || null;
}

function setSession(telegramId, step, data = {}) {
  sessions[telegramId] = { step, data };
}

function updateSession(telegramId, data) {
  if (!sessions[telegramId]) sessions[telegramId] = { step: null, data: {} };
  sessions[telegramId].data = { ...sessions[telegramId].data, ...data };
}

function clearSession(telegramId) {
  delete sessions[telegramId];
}

module.exports = { getSession, setSession, updateSession, clearSession };
