# P&P-HUB Security Specification (Payload-First TDD)

## 1. Data Invariants
1. **Zero-Leakage Branch Isolation**: Active staff (`role in ['manager', 'operator'] && active == true`) can ONLY read or write documents whose `branchId` equals their own `users/{uid}.branchId`. Inactive staff (`active == false`) lose all branch access immediately.
2. **Sender Data Isolation**: Senders (`role == 'sender'`) can ONLY read their own submissions (`senderUid == request.auth.uid`) and can never read `branches/{branchId}`, `dailyCodes`, `expenses`, `activities`, `notifications`, or other users' profiles.
3. **No Plaintext Secrets**: No document in Firestore may contain `password`, `pin`, `failedAttempts`, or `lockedUntil`.
4. **Anti-Privilege-Escalation**:
   - A brand-new user can ONLY create `users/{uid}` as `role: 'sender'`, OR as `role: 'manager'` atomically paired with a brand-new `branches/{branchId}` (`!exists(...) && getAfter(...).data.ownerUid == request.auth.uid`).
   - Nobody can self-assign `role: 'operator'` or join an existing branch. Only an active manager with `manageStaff` in that branch can create an operator's `users/{opUid}` doc.
   - Nobody can modify their own `role`, `branchId`, or `permissions`.
5. **Server-Validated Daily Submission Code**: A sender may only create a draft submission (`status == 'Uploading'`) if `incoming().dailyCode == get(/databases/$(database)/documents/branches/$(branchId)/dailyCodes/$(todayUtc())).data.code`, where `todayUtc()` uses `request.time` (Ghana UTC+0).
6. **Field-Restricted Staff Updates**:
   - Status / handler changes require `updateStatus`.
   - Billing changes require `recordBilling`.
   - File removal requires `deleteFiles`.
   - Financial reads and expense writes require `viewFinance`.
7. **Immutable Audit Trail**: `activities` documents are append-only (`allow update, delete: if false`).

## 2. The "Dirty Dozen" Adversarial Payloads (Must ALL return PERMISSION_DENIED)
1. **Cross-Branch Submission Read**: Manager of `FANTA-ACC` attempts `get` or `list` on `submissions` with `branchId: "ROYAL-KUM"`.
2. **Self-Assigned Operator**: Brand-new user attempts `create` on `users/{myUid}` with `{ role: "operator", branchId: "FANTA-ACC", active: true }`.
3. **Hostile Branch Takeover**: Brand-new user attempts `create` on `users/{myUid}` with `{ role: "manager", branchId: "FANTA-ACC" }` where `branches/FANTA-ACC` already exists.
4. **Privilege Self-Upgrade**: Operator attempts `update` on `users/{myUid}` setting `permissions.viewFinance = true` or `role = "manager"`.
5. **Wrong or Expired Daily Code**: Sender attempts `create` on `submissions/{id}` with `dailyCode: "WRONG-000"` or yesterday's code.
6. **Draft Bypass**: Sender attempts `create` on `submissions/{id}` directly with `status: "Received"` instead of `status: "Uploading"`.
7. **Post-Submit Tampering**: Sender attempts `update` on their own submission after `status` is `"Received"` to modify `billing.amountPaid` or `status`.
8. **Unauthorized Billing Edit**: Operator with `recordBilling: false` attempts `update` on `submissions/{id}` modifying `billing.amountPaid`.
9. **Unauthorized Finance Read**: Operator with `viewFinance: false` attempts `list` on `expenses` for their branch.
10. **Deactivated Staff Access**: Operator with `active: false` attempts `list` on `submissions` or `update` on a job status.
11. **Shadow Field / Secret Injection**: Any user attempts `create` or `update` injecting undeclared fields like `password`, `pin`, or `isAdmin: true`.
12. **Audit Log Tampering**: Manager attempts `update` or `delete` on `activities/{id}`.
