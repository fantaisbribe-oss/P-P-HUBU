# P&P-HUB: Google AI Studio + Firebase backend (copy-paste pack)

## How to use this

1. Open Google AI Studio, go to **Build**, and start a new app.
2. Attach or paste your `PP-HUB.html` file.
3. Paste **PROMPT 1** and send it. Wait until it finishes.
4. Send PROMPTS 2 to 6 one at a time, in order. Check the app works after each one.
5. When it asks to connect Firebase, say yes. Create or choose a Firebase project.
6. Run the **Test checklist** at the bottom before real customers use it.

Paste only the text inside each code block.

---

## PROMPT 1: Context and ground rules

```
I have a working front-end for a multi-branch printing press management site called P&P-HUB (file attached). Right now ALL data lives in the browser (localStorage key "pphub_state_v1") and passwords and PINs are stored in plain text. I want you to turn it into a real, secure, multi-user app using Firebase (Authentication, Cloud Firestore, Cloud Storage for Firebase).

THE APP
- Three roles: MANAGER (owns a branch), OPERATOR (staff of a branch, with per-person permissions), SENDER (a customer who sends print files to a branch).
- Each BRANCH is fully isolated: its own staff, daily codes, submissions, expenses, activity log, notifications, storage quota and retention days.
- Senders connect to a branch, enter that branch's DAILY SUBMISSION CODE, attach files, and submit a package. Staff see it in "Sent Files" (organised Year > Month > Day folder > gallery), move it through these statuses: Received, Processing, Ready for Printing, Printing, Printed, Ready for Collection, Collected. Staff also record billing, expenses, reports, notifications and activity.
- Staff permissions per person: viewFiles, updateStatus, recordBilling, viewFinance, deleteFiles, manageCodes, manageStaff.
- Currency is GH₵. Ghana is UTC+0 all year (no daylight saving).

NON-NEGOTIABLE RULES
1. KEEP MY UI EXACTLY: same look, layout, text, colours, flows and function names wherever possible. Only replace the data layer. If you must restructure the code (for example into React/Vite), the result must look and behave identically.
2. Remove DEFAULT_STATE, the localStorage business data and every hard-coded date such as todayStr = '2026-11-19'. Use the real current date from the Firebase server timestamp. localStorage may only keep harmless UI preferences.
3. Never store passwords or PINs in Firestore, in code, or in logs. Delete the fields password, pin, failedAttempts and lockedUntil from every data model.
4. Every screen must have loading states, empty states, and friendly error messages (permission denied, network offline, too many attempts).
5. Use real-time listeners (onSnapshot) for lists so a new submission shows up on staff screens instantly without refreshing.
6. Use the modular Firebase JS SDK (v10 or newer). Put the Firebase config in one place.
7. If something cannot be done without a manual step in the Firebase console, or without upgrading the Firebase plan, tell me clearly in plain words and give me the exact steps. Do not silently skip it or fake it.
8. After each phase, give me a short summary of what changed and what I should test.

For now, ONLY do this: read the attached file, then reply with (a) the Firestore data model as a table, (b) the Storage folder layout, (c) the list of Firebase features and console steps I must enable, and (d) anything in my app you think cannot work the way it does today. Do not change code yet. Wait for my "go" after I review it.
```

---

## PROMPT 2: Accounts and sign-in

```
Go. Phase 1: Authentication and accounts. Keep the login and registration screens exactly as they are.

STAFF (manager and operator)
- Use Firebase Authentication email/password with a SYNTHETIC email built from the username, for example  username.BRANCHID@staff.pphub.app (lowercase). The user keeps typing their normal username and password (and branch, if the current login form asks for it).
- Manager registration creates, in ONE atomic batch: the Auth user, branchPublic/{branchId} (name, area, city, phone), branches/{branchId} (private settings: storageQuotaMB, retentionDays, ownerUid, createdAt), users/{uid} (role 'manager', branchId, fullName, username, active true, all 7 permissions true), and today's daily code.
- A manager creates operators from the Staff Management screen. Creating a user with the client SDK normally signs the manager out, so use a SECOND Firebase app instance to create the operator, then sign that instance out, so the manager stays logged in.
- Disabling or removing a staff member sets users/{uid}.active=false (or deletes the users doc). Security rules must block inactive users. Explain that the Auth account itself cannot be deleted from the browser.
- Staff permissions live in users/{uid}.permissions and the manager can toggle them (existing toggleStaffPerm, toggleStaffActive, removeStaff functions).

SENDERS (customers)
- Registration: name, phone, 4-digit PIN (unchanged UI). Generate a unique human-readable Sender ID like SND-1001 (use a Firestore transaction on a counter or a uniqueness document so two people never get the same ID).
- Create a Firebase Auth user with synthetic email  SENDERID@senders.pphub.app . Firebase needs at least 6 characters, so set the Auth password to the 4-digit PIN followed by a fixed app suffix (for example PIN + "-pphub"). Never store the PIN anywhere.
- The login screen says "Sender ID or Name". Support Sender ID and phone number. For name login, use a lookup document senderLookup/{lowercasedName} that stores ONLY the senderId, and if two senders share a name, ask for the Sender ID instead.
- Replace the old failedAttempts/lockedUntil logic with Firebase's built-in sign-in throttling. Show a friendly message for auth/too-many-requests and auth/invalid-credential.
- Sender profile in users/{uid}: role 'sender', senderId, name, phone.

COMMON
- Session persistence with Firebase Auth. Logout signs out. On load, route the user to the right workspace by reading users/{uid}.role.
- The "quickDemoLogin" demo buttons should be removed from production behaviour. Keep them only behind a clearly marked DEV flag that is off by default.

Then summarise and tell me exactly how to test registering a manager, an operator, and a sender.
```

---

## PROMPT 3: Data, real-time and daily codes

```
Phase 2: Firestore data and business logic. Use TOP-LEVEL collections with a branchId field on every document (this keeps security rules and queries simple):

- branchPublic/{branchId}: name, area, city, phone (any signed-in user can read this so senders can pick a branch).
- branches/{branchId}: storageQuotaMB, retentionDays, storageUsedBytes, ownerUid (staff of that branch only).
- branches/{branchId}/dailyCodes/{YYYY-MM-DD}: code, createdBy, createdAt (staff read; only users with manageCodes can write).
- submissions/{submissionId}: branchId, senderUid, senderId, senderName, customName, dailyCode, year, month (0-11), day, date (YYYY-MM-DD), time, createdAt (server timestamp), status, assignedTo, billing {serviceType, copies, pages, unitPrice, totalAmount, amountPaid, paymentMethod, paymentDate}, files [{fileId, originalName, type, ext, sizeBytes, storagePath, pagesPreview}].
- expenses/{id}: branchId, date, category, description, amount, recordedBy, createdAt.
- activities/{id}: branchId, user, action, target, createdAt.
- notifications/{id}: branchId, type, title, msg, read, createdAt.

BEHAVIOUR
- Replace appState, saveState, getBranchSubmissions, getBranchExpenses, getBranchActivities, logActivity, addNotification and ensureTodayDailyCode with Firestore reads/writes. Every query by staff MUST include where('branchId','==', theirBranchId). Sender queries must use where('senderUid','==', uid).
- Daily code: ensureTodayDailyCode creates today's code doc if missing (staff with manageCodes only). regenerateDailyCode overwrites today's doc. Generate codes like PPH-4821 (3-letter branch prefix + 4 digits) as the app does now. Keep the history of past codes on the Daily Codes screen.
- Sender code check WITHOUT a server: the "verify daily code" step creates a DRAFT submission (status 'Uploading') that includes the entered dailyCode. The security rules compare it with today's code document, so a wrong or expired code is rejected with permission-denied, which you show as "Invalid or expired Daily Submission Code". Staff screens must hide status 'Uploading'. Delete abandoned drafts older than 24h (tell me if this needs a scheduled Cloud Function and the Blaze plan).
- Billing fields can only be changed by staff with recordBilling. Status and assignedTo only by staff with updateStatus. Do this in both the UI (hide or disable controls) and the rules.
- Financial screens (Money Management, Expenses, Reports) only for staff with viewFinance.
- Reports and analytics: compute from the same real-time data for now, but only fetch the date range being viewed.
- Add proper indexes (firestore.indexes.json) for every compound query you use, and tell me which ones I must deploy.
- Use runTransaction or batched writes where several documents must change together (for example: submission + activity + notification).
```

---

## PROMPT 4: File upload and storage

```
Phase 3: Cloud Storage for Firebase. Replace the simulated file handling (URL.createObjectURL, previewUrl, the Unsplash sample files, triggerSimulatedDownload/Print, downloadSpecificFile, printSpecificFile) with real uploads.

- Storage path: branches/{branchId}/{yyyy}/{mm}/{dd}/{submissionId}/{fileId}-{safeFileName}. Sanitise file names.
- Upload flow for a sender: verified draft submission exists (status 'Uploading') -> upload each file with uploadBytesResumable and show a real progress bar per file with a cancel button -> write the files array -> set status to 'Received' -> create the activity + notification. If an upload fails, let the sender retry that file; never leave a half-submitted package visible to staff.
- Limits: maximum 50 MB per file; allow images, PDF, Word, Excel, PowerPoint, and ZIP only. Enforce this in the UI AND in the storage rules. Tell me if you think a different limit is wiser.
- Previews: images and PDFs show in the existing lightbox using a download URL fetched on demand (not stored in the document). Word files keep the current icon card.
- Download and Print buttons must work on the real file. Staff deleting a file (needs deleteFiles) removes it from Storage AND from the submission AND logs an activity.
- Storage usage: keep branches/{branchId}.storageUsedBytes up to date (increment on upload, decrement on delete, in a transaction) and make the "Cloud Storage & Archive Retention" screen show the real number against storageQuotaMB. Block new uploads in the UI when the quota is full.
- Retention (retentionDays): explain the options (Storage lifecycle rule on the bucket, or a scheduled Cloud Function) and which plan each needs. Implement whichever works on my plan and give me the exact steps for the rest.
- "Trigger Cloud Backup Now" currently only shows a toast. Tell me honestly what real option exists (for example Firestore scheduled exports) and what it costs, instead of leaving a fake button. Hide the button until it is real.
```

---

## PROMPT 5: Security rules (most important)

```
Phase 4: Security. Write complete firestore.rules and storage.rules and explain them in plain language.

REQUIREMENTS
- Default deny. No document is readable or writable unless a rule allows it.
- Helper functions: isSignedIn(), me() = users/{uid} document, isActiveStaff(), staffBranch(), hasPerm(name) (reads users/{uid}.permissions), isSender().
- Branch isolation: a staff member can only read or write documents where branchId equals THEIR branchId. A manager of one branch can never see another branch's data. A sender can only read their own submissions.
- branchPublic: any signed-in user can read; only the branch manager can write.
- users: a user can read their own doc. Managers can read and write staff docs in their own branch (manageStaff). Nobody may change their own role, branchId or permissions.
- Registration safety: a new user may create ONLY their own users/{uid} doc, only with role 'sender', or with role 'manager' together with a NEW branch they own (use getAfter() to check the batch). Nobody can self-assign 'operator' or join an existing branch as staff.
- submissions:
  - create: only a sender, senderUid == their uid, status 'Uploading', and dailyCode equals today's code document for that branch (use get() on branches/{branchId}/dailyCodes/{today}; remember Ghana time = UTC so request.time works).
  - sender update: only to finalise their own 'Uploading' draft to 'Received' and set files; nothing after that.
  - staff update: field-restricted using diff().affectedKeys(): status/assignedTo needs updateStatus; billing needs recordBilling; files removal needs deleteFiles.
  - delete: manager only (or deleteFiles).
- expenses and financial reads: need viewFinance. activities and notifications: staff of the same branch.
- Storage rules: write only by the owning sender while the submission is 'Uploading' (cross-check with firestore.get), size < 50 MB and allowed content types; read by the owning sender or active staff of that branch with viewFiles; delete by staff with deleteFiles.
- Keep the number of get() calls per rule evaluation under Firestore's limit and tell me about any trade-offs.
- Also recommend (and wire up if possible) Firebase App Check to stop bots from abusing sign-up.

Then give me a numbered MANUAL TEST LIST I can run to prove the rules work (I will run the checklist below too).
```

---

## PROMPT 6: Final polish, seed data and go-live

```
Phase 5: Final polish.

1. Create a one-time, DEV-ONLY seed script that loads the two sample branches (Fanta Digital Printing, Accra and Royal Press, Kumasi), their staff, three senders and a few sample submissions into Firestore using test accounts, so I can demo the app. It must be impossible to run in production, and it must not use the passwords from the old file.
2. Go through the whole app again and list every feature that still uses fake or simulated behaviour. Fix what you can; list what you could not.
3. Make sure Sender "My Branches" and "History" screens work with real data and real-time updates.
4. Add a simple Settings > Account area so any user can change their own password (staff and senders).
5. Give me a GO-LIVE CHECKLIST: Firebase plan needed, authorized domains, hosting (Firebase Hosting or other), deploying rules and indexes, enabling App Check, budget alerts, and backups.
6. Give me a short "how it works" explanation for non-technical staff.
```

---

## Test checklist (run before real customers)

Run these with at least two branches, two staff and two senders.

1. Manager A registers a branch. Manager B registers a different branch. Manager A cannot see any of Branch B's data (try the app, and try the browser console).
2. A sender with the wrong daily code cannot submit. With yesterday's code, it also fails. With today's code, it works.
3. After the manager regenerates today's code, the old code stops working.
4. An operator without `recordBilling` cannot change billing, even by editing the page in the browser console.
5. An operator without `viewFinance` cannot open Money Management, Expenses or Reports.
6. An operator without `deleteFiles` cannot delete files.
7. A disabled staff member can no longer read or write anything.
8. A sender can see only their own submissions and files, never another sender's.
9. A file bigger than 50 MB or of a blocked type is rejected.
10. A brand-new user cannot make themselves an operator or manager of an existing branch.
11. A new submission appears on staff screens within seconds, without refreshing.
12. Closing the browser mid-upload does not leave a visible half-finished submission for staff.

## Things to decide or know

- **Plan:** Authentication and Firestore work on the free plan. As far as I know, new Firebase projects now need the pay-as-you-go (Blaze) plan to use Cloud Storage, and you will need it for file uploads. Check the Firebase console and set a budget alert.
- **4-digit PINs are weak.** Firebase throttles wrong attempts, which is better than the current app, but a determined attacker could still guess a PIN over time. If senders submit sensitive documents, consider a longer PIN or phone OTP later.
- **Password resets:** Staff and senders sign in with generated emails, so "forgot password" emails will not work. Without Cloud Functions, a manager cannot reset someone else's password. Decide whether you want real email addresses added.
- **Retention and cleanup:** Auto-deleting old files and abandoned drafts needs either a bucket lifecycle rule or a scheduled Cloud Function (Blaze plan).
- **Always review the rules.** AI-written security rules are the part most likely to have mistakes. Do not skip the test checklist.
