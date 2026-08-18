/**
 * What py-beacon accepts as a document id.
 *
 * Every stored document — index, universe, watchlist, template, constraint
 * set, job, run — is addressed by the same path rule, and the engine answers
 * 422 for anything else. The client honours it rather than sending a request
 * that cannot succeed: a 422 surfaces as "Request validation failed", which
 * says nothing about the actual problem, and a query that will never come
 * back is not worth a round trip.
 *
 * Sourced from the OpenAPI path parameters, where all eleven id parameters
 * carry this identical pattern.
 */
const DOCUMENT_ID = /^[A-Za-z0-9_-]{1,64}$/

export function isDocumentId(value: string | undefined): value is string {
  return value !== undefined && DOCUMENT_ID.test(value)
}
