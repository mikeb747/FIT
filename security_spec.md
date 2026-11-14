# Security Specification — Cloud Vault & Athlete Settings Sync

## 1. Data Invariants
1. **Default-Deny Catch-All**: All paths not explicitly matched under `/users/{userId}` and `/users/{userId}/vault/{docId}` are unconditionally denied (`allow read, write: if false;`).
2. **Strict Verified Owner Isolation**: Every read and write operation requires `request.auth != null`, `request.auth.token.email_verified == true`, and `request.auth.uid == userId`. No non-owner can ever read or write another user's `/users/{userId}` or `/users/{userId}/vault/{docId}` documents.
3. **Master Gate Relational Sync**: Writing or reading any `/users/{userId}/vault/{docId}` document requires the parent `/users/{userId}` document to exist (or be created in the same atomic batch via `existsAfter`) and have `ownerUid == request.auth.uid`.
4. **Strict Key & Type Blueprints**:
   - `UserAccount` (`/users/{userId}`): Requires exact keys `['ownerUid', 'displayName', 'createdAt', 'updatedAt']`, `ownerUid == request.auth.uid`, `displayName` string `<= 120` chars, and server timestamps `createdAt == request.time` (on create) and `updatedAt == request.time`.
   - `VaultDocument` (`/users/{userId}/vault/{docId}`): `docId` must be one of `['profile', 'integrations', 'goals', 'recovery', 'coach']`, requires exact keys `['ownerUid', 'domain', 'schemaVersion', 'payload', 'createdAt', 'updatedAt']`, `domain == docId`, `ownerUid == request.auth.uid`, `schemaVersion is int`, `payload is map` with `payload.keys().size() <= 50`, and server timestamps.
5. **Immutability**: `ownerUid`, `domain`, and `createdAt` cannot be modified during `update`.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: Writing to `/users/uid_1/vault/profile` with `auth == null` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: Writing to `/users/uid_1/vault/profile` with `email_verified: false` -> `PERMISSION_DENIED`.
3. **Cross-User Read (PII / Token Theft)**: Authenticated user `uid_2` attempting `get` on `/users/uid_1/vault/integrations` -> `PERMISSION_DENIED`.
4. **Identity Spoofing on Create**: User `uid_1` creating `/users/uid_1/vault/profile` with `ownerUid: 'uid_2'` -> `PERMISSION_DENIED`.
5. **Shadow Field Injection on Create**: Creating `/users/uid_1/vault/profile` with extra field `isAdmin: true` -> `PERMISSION_DENIED`.
6. **Shadow Field Injection on Update**: Updating `/users/uid_1/vault/profile` with extra field `hacked: 1` -> `PERMISSION_DENIED`.
7. **Immutable Field Mutation (`ownerUid`)**: Updating `/users/uid_1/vault/profile` to change `ownerUid` -> `PERMISSION_DENIED`.
8. **Immutable Field Mutation (`createdAt`)**: Updating `/users/uid_1/vault/profile` to change `createdAt` -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: Creating or updating `/users/uid_1/vault/profile` with a forged past/future `updatedAt` != `request.time` -> `PERMISSION_DENIED`.
10. **Path Variable / ID Poisoning**: Creating `/users/uid_1/vault/malicious_doc_id` outside the allowed domain set `['profile', 'integrations', 'goals', 'recovery', 'coach']` -> `PERMISSION_DENIED`.
11. **Value Poisoning on Update**: Updating `/users/uid_1/vault/profile` with `payload: "not-a-map"` -> `PERMISSION_DENIED`.
12. **Orphaned Subcollection Write**: Creating `/users/uid_1/vault/profile` when `/users/uid_1` does not exist and is not created in the batch -> `PERMISSION_DENIED`.
