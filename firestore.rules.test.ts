/**
 * Security Rules Verification Suite for Dirty Dozen Payloads
 * Verifies that all 12 adversarial payloads described in security_spec.md are rejected.
 */
export interface SecurityTestCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED' | 'ALLOWED';
}

export const DIRTY_DOZEN_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Write',
    operation: 'create',
    path: '/users/uid_1/vault/profile',
    auth: null,
    payload: { ownerUid: 'uid_1', domain: 'profile', schemaVersion: 1, payload: {} },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Spoof',
    operation: 'create',
    path: '/users/uid_1/vault/profile',
    auth: { uid: 'uid_1', email_verified: false },
    payload: { ownerUid: 'uid_1', domain: 'profile', schemaVersion: 1, payload: {} },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Cross-User Read (PII / Token Theft)',
    operation: 'get',
    path: '/users/uid_1/vault/integrations',
    auth: { uid: 'uid_2', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Identity Spoofing on Create',
    operation: 'create',
    path: '/users/uid_1/vault/profile',
    auth: { uid: 'uid_1', email_verified: true },
    payload: { ownerUid: 'uid_2', domain: 'profile', schemaVersion: 1, payload: {} },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Shadow Field Injection on Create',
    operation: 'create',
    path: '/users/uid_1/vault/profile',
    auth: { uid: 'uid_1', email_verified: true },
    payload: { ownerUid: 'uid_1', domain: 'profile', schemaVersion: 1, payload: {}, isAdmin: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Shadow Field Injection on Update',
    operation: 'update',
    path: '/users/uid_1/vault/profile',
    auth: { uid: 'uid_1', email_verified: true },
    payload: { ownerUid: 'uid_1', domain: 'profile', schemaVersion: 1, payload: {}, hacked: 1 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Immutable Field Mutation (ownerUid)',
    operation: 'update',
    path: '/users/uid_1/vault/profile',
    auth: { uid: 'uid_1', email_verified: true },
    payload: { ownerUid: 'uid_2', domain: 'profile', schemaVersion: 1, payload: {} },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Immutable Field Mutation (createdAt)',
    operation: 'update',
    path: '/users/uid_1/vault/profile',
    auth: { uid: 'uid_1', email_verified: true },
    payload: { ownerUid: 'uid_1', domain: 'profile', schemaVersion: 1, payload: {}, createdAt: '1999-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Client Timestamp Forgery',
    operation: 'update',
    path: '/users/uid_1/vault/profile',
    auth: { uid: 'uid_1', email_verified: true },
    payload: { ownerUid: 'uid_1', domain: 'profile', schemaVersion: 1, payload: {}, updatedAt: '2099-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Path Variable / ID Poisoning',
    operation: 'create',
    path: '/users/uid_1/vault/malicious_doc_id',
    auth: { uid: 'uid_1', email_verified: true },
    payload: { ownerUid: 'uid_1', domain: 'malicious_doc_id', schemaVersion: 1, payload: {} },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Value Poisoning on Update',
    operation: 'update',
    path: '/users/uid_1/vault/profile',
    auth: { uid: 'uid_1', email_verified: true },
    payload: { ownerUid: 'uid_1', domain: 'profile', schemaVersion: 1, payload: 'not-a-map' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Orphaned Subcollection Write',
    operation: 'create',
    path: '/users/uid_1/vault/profile',
    auth: { uid: 'uid_1', email_verified: true },
    payload: { ownerUid: 'uid_1', domain: 'profile', schemaVersion: 1, payload: {} },
    expected: 'PERMISSION_DENIED',
  },
];
