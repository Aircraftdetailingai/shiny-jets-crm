// PostgREST reports a missing table as "Could not find the table ... in the
// schema cache", which does not contain the words "relation" or "column".
// Treating only those two words as "migration not applied" turned a normal
// empty catalog into HTTP 500 on /api/model-offers.

export function schemaNotReady(message) {
  const text = String(message || '');
  return /relation|column|schema cache|does not exist|could not find the table|could not find the function/i.test(text);
}

export function invalidUuidInput(message) {
  return /invalid input syntax for type uuid/i.test(String(message || ''));
}
