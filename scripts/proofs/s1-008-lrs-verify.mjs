import assert from 'node:assert/strict';

const endpoint = process.env.LRS_ENDPOINT?.replace(/\/$/, '');
const username = process.env.LRS_USERNAME;
const password = process.env.LRS_PASSWORD;
assert.ok(endpoint && username && password, 'Configuration LRS absente');

const response = await fetch(`${endpoint}/statements?limit=100`, {
  headers: {
    Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
    'X-Experience-API-Version': '1.0.3',
  },
});
assert.equal(response.status, 200, 'Lecture des statements cmi5');
const body = await response.json();
assert.ok(Array.isArray(body.statements), 'Collection de statements absente');

const byRegistration = new Map();
for (const statement of body.statements.filter((item) => item.context?.registration)) {
  const registration = statement.context.registration;
  byRegistration.set(registration, [...(byRegistration.get(registration) ?? []), statement]);
}
const candidates = [...byRegistration.values()].filter((statements) => {
  const verbs = statements.map((statement) => statement.verb?.id?.split('/').at(-1));
  return ['initialized', 'completed', 'terminated'].every((verb) => verbs.includes(verb));
});
assert.ok(candidates.length > 0, 'Séquence cmi5 persistée absente');

const sequence = candidates
  .at(-1)
  .filter((statement) =>
    ['initialized', 'completed', 'terminated'].includes(statement.verb.id.split('/').at(-1)),
  )
  .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
const verbs = sequence.map((statement) => statement.verb.id.split('/').at(-1));
assert.deepEqual(verbs, ['initialized', 'completed', 'terminated']);
const sessionIds = new Set(
  sequence.map(
    (statement) =>
      statement.context.extensions?.['https://w3id.org/xapi/cmi5/context/extensions/sessionid'],
  ),
);
assert.equal(sessionIds.size, 1, 'Les statements n’appartiennent pas à une session unique');
assert.ok(!sessionIds.has(undefined), 'Identifiant de session cmi5 absent');
const completed = sequence.find((statement) => statement.verb.id.endsWith('/completed'));
assert.equal(completed.result?.completion, true);
assert.equal(
  completed.result?.extensions?.['https://w3id.org/xapi/cmi5/result/extensions/progress'],
  1,
);

console.log(
  JSON.stringify({
    proof: 'S1008_LRS_PERSISTENCE_OK',
    verbs,
    singleSession: true,
    completion: true,
    progress: 1,
  }),
);
