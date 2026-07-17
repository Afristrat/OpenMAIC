/**
 * Anglicismes/noms propres à prononcer en anglais dans une narration
 * française — liste courte, maintenue manuellement (pas d'inférence
 * automatique : chaque faux positif casse la prononciation d'un mot
 * français légitime, cf. "budget").
 */
export const ANGLICISM_TERMS: readonly string[] = [
  // Produits et outils d’infrastructure
  'LiteLLM', 'OpenAI', 'Anthropic', 'Gemini', 'Bedrock', 'Cohere', 'Vertex AI',
  'Crawl4AI', 'Serper', 'Playwright', 'Docker', 'Kubernetes', 'Redis', 'Supabase',
  'PostgreSQL', 'Postgres', 'TypeScript', 'JavaScript', 'Next.js', 'React', 'GitHub', 'BullMQ',
  // Sigles et protocoles
  'API', 'LLM', 'TTS', 'ASR', 'SDK', 'MCP', 'MIT', 'HTTP', 'HTTPS', 'URL', 'JSON', 'YAML',
  'SSO', 'OAuth', 'RLS', 'PWA',
  // Vocabulaire anglais technique à forte certitude. Les mots français, comme « budget », sont exclus.
  'proxy', 'gateway', 'routing', 'fallback', 'failover', 'caching', 'dashboard',
  'mirroring', 'guardrail', 'guardrails', 'streaming', 'webhook', 'worker', 'workers',
  'runtime', 'frontend', 'backend', 'token', 'tokens',
];
