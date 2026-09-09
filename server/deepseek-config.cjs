'use strict';
// Server-only configuration. Never import this module from browser code.
module.exports = function configuration(env = process.env) {
  return {
    apiKey: env.DEEPSEEK_API_KEY || '',
    model: env.DEEPSEEK_MODEL || 'deepseek-v4-flash-vision-exp',
    endpoint: 'https://api.deepseek.com/chat/completions',
    // User-approved experimental publication; ordinary UI still uses the old
    // solver. Explicit 0 is the server-side kill switch. Local stays opt-in.
    enabled: env.DEEPSEEK_RESULT3_ENABLED === '1' ||
      (env.DEEPSEEK_RESULT3_ENABLED === undefined && env.VERCEL_ENV === 'production'),
    timeoutMs: 12000,
    maxTokens: 4500
  };
};
