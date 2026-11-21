import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
  writeBatch,
  increment,
  type Unsubscribe
} from 'firebase/firestore';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  type UploadTask
} from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  auth,
  db,
  storage,
  withSecondaryAuth,
  handleFirestoreError,
  OperationType
} from '../firebase';
import {
  ALL_STAFF_PERMISSIONS,
  type Activity,
  type BranchNotification,
  type BranchPrivate,
  type BranchPublic,
  type DailyCodeDoc,
  type Expense,
  type SenderUserProfile,
  type StaffPermissions,
  type StaffUserProfile,
  type Submission,
  type SubmissionBilling,
  type SubmissionFile,
  type SubmissionStatus,
  type UserProfile
} from '../types';
import {
  formatGhanaTime,
  generateBranchDailyCode,
  getFileMimeType,
  getGhanaDateParts,
  normalizeLookupKey,
  sanitizeFileName
} from '../utils/dates';

const SENDER_PIN_SUFFIX = '-pphub';

export function buildStaffSyntheticEmail(username: string, branchId: string): string {
  const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  const cleanBranch = branchId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  return `${cleanUser}.${cleanBranch}@staff.pphub.app`;
}

export function buildSenderSyntheticEmail(senderId: string): string {
  return `${senderId.trim().toLowerCase()}@senders.pphub.app`;
}

function makeDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${Date.now()}-${rand}`;
}

// =============================================================================
// AUTHENTICATION & ACCOUNT PROVISIONING
// =============================================================================

export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return snap.data() as UserProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export interface RegisterManagerInput {
  pressName: string;
  area: string;
  city: string;
  phone?: string;
  fullName: string;
  username: string;
  password: string;
  customBranchId?: string;
}

export async function registerManagerWithBranch(input: RegisterManagerInput): Promise<{
  profile: StaffUserProfile;
  branchId: string;
  dailyCode: string;
}> {
  const pressName = input.pressName.trim().slice(0, 120);
  const area = input.area.trim().slice(0, 120);
  const city = input.city.trim().slice(0, 80);
  const phone = (input.phone?.trim() || '+233 24 000 0000').slice(0, 40);
  const fullName = input.fullName.trim().slice(0, 120);
  const username = input.username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 64);

  if (username.length < 2) {
    throw new Error('Username must be at least 2 characters (letters, numbers, dots, hyphens, or underscores).');
  }
  if (input.password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  let branchId = input.customBranchId?.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || '';
  if (!branchId) {
    const prefix = pressName.replace(/[^A-Za-z]/g, '').substring(0, 5).toUpperCase() || 'PRESS';
    const cityCode = city.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase() || 'GH';
    const randNum = Math.floor(10 + Math.random() * 89);
    branchId = `${prefix}-${cityCode}${randNum}`;
  }

  const email = buildStaffSyntheticEmail(username, branchId);
  const cred = await createUserWithEmailAndPassword(auth, email, input.password);
  const uid = cred.user.uid;

  const { dateStr } = getGhanaDateParts();
  const timeStr = formatGhanaTime();
  const dailyCode = generateBranchDailyCode(branchId);
  const actId = makeDocId('ACT');

  const profileData: StaffUserProfile = {
    uid,
    role: 'manager',
    branchId,
    fullName,
    username,
    active: true,
    permissions: { ...ALL_STAFF_PERMISSIONS }
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'branchPublic', branchId), {
    branchId,
    name: pressName,
    area,
    city,
    phone,
    ownerUid: uid,
    quotaFull: false,
    createdAt: serverTimestamp()
  });

  batch.set(doc(db, 'branches', branchId), {
    branchId,
    name: pressName,
    area,
    city,
    phone,
    storageQuotaMB: 10240,
    retentionDays: 365,
    storageUsedBytes: 0,
    ownerUid: uid,
    createdAt: serverTimestamp()
  });

  batch.set(doc(db, 'users', uid), {
    ...profileData,
    createdAt: serverTimestamp()
  });

  batch.set(doc(db, 'branches', branchId, 'dailyCodes', dateStr), {
    code: dailyCode,
    date: dateStr,
    branchId,
    createdBy: fullName,
    createdAt: serverTimestamp()
  });

  batch.set(doc(db, 'activities', actId), {
    id: actId,
    branchId,
    user: `${fullName} (Manager)`,
    action: `Registered new printing press branch "${pressName}"`,
    target: branchId,
    date: dateStr,
    time: timeStr,
    createdAt: serverTimestamp()
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `branches/${branchId}`);
  }

  return { profile: profileData, branchId, dailyCode };
}

export async function signInStaff(
  expectedRole: 'manager' | 'operator',
  branchIdInput: string,
  usernameInput: string,
  password: string
): Promise<StaffUserProfile> {
  const branchId = branchIdInput.trim().toUpperCase();
  const username = usernameInput.trim().toLowerCase();
  const email = buildStaffSyntheticEmail(username, branchId);

  const cred = await signInWithEmailAndPassword(auth, email, password);
  const profile = await fetchUserProfile(cred.user.uid);

  if (!profile || profile.role === 'sender') {
    await signOut(auth);
    throw new Error('This account is not a staff account.');
  }
  if (profile.role !== expectedRole) {
    await signOut(auth);
    throw new Error(
      expectedRole === 'manager'
        ? 'This account is a Printing Operator. Please sign in using the Printing Operator tab.'
        : 'This account is a Branch Manager. Please sign in using the Branch Manager tab.'
    );
  }
  if (profile.branchId !== branchId) {
    await signOut(auth);
    throw new Error('Branch Code does not match this staff account.');
  }
  if (!profile.active) {
    await signOut(auth);
    throw new Error('Your staff account has been deactivated by the Branch Manager.');
  }

  // Log sign-in activity
  try {
    await logBranchActivity(
      branchId,
      `${profile.fullName} (${profile.role === 'manager' ? 'Manager' : 'Operator'})`,
      `Signed into ${profile.role === 'manager' ? 'Branch Manager Dashboard' : 'Printing Operator Console'}`,
      branchId
    );
  } catch {
    // Non-blocking audit log
  }

  return profile;
}

export async function createOperatorAccount(input: {
  branchId: string;
  managerName: string;
  fullName: string;
  username: string;
  password: string;
  viewFinance: boolean;
  recordBilling?: boolean;
  deleteFiles?: boolean;
  manageCodes?: boolean;
}): Promise<StaffUserProfile> {
  const fullName = input.fullName.trim().slice(0, 120);
  const username = input.username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 64);

  if (username.length < 2) {
    throw new Error('Username must be at least 2 characters.');
  }
  if (input.password.length < 6) {
    throw new Error('Operator password must be at least 6 characters.');
  }

  const email = buildStaffSyntheticEmail(username, input.branchId);

  // Create Auth account using secondary Firebase app so manager stays signed in
  const newUid = await withSecondaryAuth(async (secAuth) => {
    const cred = await createUserWithEmailAndPassword(secAuth, email, input.password);
    return cred.user.uid;
  });

  const permissions: StaffPermissions = {
    viewFiles: true,
    updateStatus: true,
    recordBilling: input.recordBilling ?? true,
    viewFinance: input.viewFinance,
    deleteFiles: input.deleteFiles ?? false,
    manageCodes: input.manageCodes ?? false,
    manageStaff: false
  };

  const opProfile: StaffUserProfile = {
    uid: newUid,
    role: 'operator',
    branchId: input.branchId,
    fullName,
    username,
    active: true,
    permissions
  };

  const { dateStr } = getGhanaDateParts();
  const timeStr = formatGhanaTime();
  const actId = makeDocId('ACT');

  const batch = writeBatch(db);
  batch.set(doc(db, 'users', newUid), {
    ...opProfile,
    createdAt: serverTimestamp()
  });
  batch.set(doc(db, 'activities', actId), {
    id: actId,
    branchId: input.branchId,
    user: input.managerName,
    action: `Registered new printing operator: ${fullName}`,
    target: username,
    date: dateStr,
    time: timeStr,
    createdAt: serverTimestamp()
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${newUid}`);
  }

  return opProfile;
}

export async function registerSenderAccount(input: {
  name: string;
  phone: string;
  pin: string;
}): Promise<SenderUserProfile> {
  const name = input.name.trim().slice(0, 120);
  const phone = input.phone.trim().slice(0, 40);
  const pin = input.pin.trim();

  if (!name) throw new Error('Please enter your name or business name.');
  if (!/^\d{4}$/.test(pin)) throw new Error('Security PIN must be exactly 4 digits.');

  // Read sequential counter to pick next human-readable SND-XXXX candidate
  let nextNum = 1001;
  try {
    const counterSnap = await getDoc(doc(db, 'counters', 'senderId'));
    if (counterSnap.exists()) {
      const val = counterSnap.data().nextNumber;
      if (typeof val === 'number' && val >= 1001) {
        nextNum = val;
      }
    }
  } catch {
    nextNum = Math.floor(1001 + Math.random() * 8000);
  }

  // Create Auth user; retry incrementing candidate if SND-XXXX is already claimed
  let assignedSenderId = '';
  let assignedNum = nextNum;
  let uid = '';
  let lastAuthErr: unknown = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    const candidateNum = nextNum + attempt;
    const candidateId = `SND-${candidateNum}`;
    const email = buildSenderSyntheticEmail(candidateId);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, `${pin}${SENDER_PIN_SUFFIX}`);
      uid = cred.user.uid;
      assignedSenderId = candidateId;
      assignedNum = candidateNum;
      break;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/email-already-in-use') {
        lastAuthErr = err;
        continue;
      }
      throw err;
    }
  }

  if (!uid || !assignedSenderId) {
    throw lastAuthErr || new Error('Could not allocate a unique Sender ID. Please try again.');
  }

  const profile: SenderUserProfile = {
    uid,
    role: 'sender',
    senderId: assignedSenderId,
    name,
    phone
  };

  // Atomically claim senderIds/{senderId}, advance counter, create users/{uid}
  try {
    await runTransaction(db, async (tx) => {
      const counterRef = doc(db, 'counters', 'senderId');
      const claimRef = doc(db, 'senderIds', assignedSenderId);
      const userRef = doc(db, 'users', uid);

      const counterSnap = await tx.get(counterRef);
      const existingNext = counterSnap.exists() ? Number(counterSnap.data().nextNumber || 1001) : 1001;
      const newNext = Math.max(existingNext, assignedNum + 1);

      if (!counterSnap.exists()) {
        tx.set(counterRef, { nextNumber: newNext });
      } else if (newNext > existingNext) {
        tx.update(counterRef, { nextNumber: newNext });
      }

      tx.set(claimRef, {
        uid,
        senderId: assignedSenderId,
        createdAt: serverTimestamp()
      });

      tx.set(userRef, {
        ...profile,
        createdAt: serverTimestamp()
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }

  // Register non-PII login lookup docs for Name and Phone
  const lookupKeys = [normalizeLookupKey('name', name), normalizeLookupKey('phone', phone)].filter(Boolean);
  for (const key of lookupKeys) {
    try {
      const refDoc = doc(db, 'senderLookup', key);
      const snap = await getDoc(refDoc);
      if (!snap.exists()) {
        await setDoc(refDoc, { senderId: assignedSenderId, ambiguous: false });
      } else if (snap.data().senderId !== assignedSenderId && snap.data().ambiguous !== true) {
        await updateDoc(refDoc, { ambiguous: true });
      }
    } catch {
      // Lookup doc collision is non-fatal; Sender ID always works
    }
  }

  return profile;
}

export async function signInSender(identifierInput: string, pinInput: string): Promise<SenderUserProfile> {
  const raw = identifierInput.trim();
  const pin = pinInput.trim();

  if (!raw) throw new Error('Please enter your Sender ID, Name, or Phone number.');
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be exactly 4 digits.');

  let senderId = '';
  if (/^SND-\d{4,8}$/i.test(raw)) {
    senderId = raw.toUpperCase();
  } else {
    // Try phone lookup first if input looks like digits/phone, then name lookup
    const phoneKey = normalizeLookupKey('phone', raw);
    const nameKey = normalizeLookupKey('name', raw);

    let found: { senderId: string; ambiguous: boolean } | null = null;
    if (phoneKey && raw.replace(/\D/g, '').length >= 6) {
      const snap = await getDoc(doc(db, 'senderLookup', phoneKey));
      if (snap.exists()) found = snap.data() as { senderId: string; ambiguous: boolean };
    }
    if (!found && nameKey) {
      const snap = await getDoc(doc(db, 'senderLookup', nameKey));
      if (snap.exists()) found = snap.data() as { senderId: string; ambiguous: boolean };
    }

    if (!found) {
      throw new Error('Sender ID, Name, or Phone not found. Please check your entry or create a new Sender account.');
    }
    if (found.ambiguous) {
      throw new Error(
        'Multiple senders share that name. Please sign in using your unique Sender ID (e.g. SND-1001) or phone number.'
      );
    }
    senderId = found.senderId;
  }

  const email = buildSenderSyntheticEmail(senderId);
  const cred = await signInWithEmailAndPassword(auth, email, `${pin}${SENDER_PIN_SUFFIX}`);
  const profile = await fetchUserProfile(cred.user.uid);
  if (!profile || profile.role !== 'sender') {
    await signOut(auth);
    throw new Error('This account is not a Sender account.');
  }
  return profile;
}

export async function changeCurrentUserPassword(
  currentSecret: string,
  newSecret: string,
  role: 'manager' | 'operator' | 'sender'
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error('You must be signed in to update your credentials.');
  }

  if (role === 'sender') {
    if (!/^\d{4}$/.test(currentSecret) || !/^\d{4}$/.test(newSecret)) {
      throw new Error('Both current and new PIN must be exactly 4 digits.');
    }
    const cred = EmailAuthProvider.credential(user.email, `${currentSecret}${SENDER_PIN_SUFFIX}`);
    await reauthenticateWithCredential(user, cred);
    await updatePassword(user, `${newSecret}${SENDER_PIN_SUFFIX}`);
  } else {
    if (newSecret.length < 6) {
      throw new Error('New password must be at least 6 characters.');
    }
    const cred = EmailAuthProvider.credential(user.email, currentSecret);
    await reauthenticateWithCredential(user, cred);
    await updatePassword(user, newSecret);
  }
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

// =============================================================================
// DAILY SUBMISSION CODES
// =============================================================================

export async function ensureTodayDailyCode(
  branchId: string,
  staffName: string,
  canManageCodes: boolean
): Promise<string | null> {
  const { dateStr } = getGhanaDateParts();
  const path = `branches/${branchId}/dailyCodes/${dateStr}`;
  const codeRef = doc(db, 'branches', branchId, 'dailyCodes', dateStr);

  let snap;
  try {
    snap = await getDoc(codeRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (snap.exists()) {
    return (snap.data() as DailyCodeDoc).code;
  }
  if (!canManageCodes) return null;

  const code = generateBranchDailyCode(branchId);
  try {
    await setDoc(codeRef, {
      code,
      date: dateStr,
      branchId,
      createdBy: staffName,
      createdAt: serverTimestamp()
    });
    return code;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function regenerateDailyCode(branchId: string, staffName: string): Promise<string> {
  const { dateStr } = getGhanaDateParts();
  const timeStr = formatGhanaTime();
  const newCode = generateBranchDailyCode(branchId);
  const actId = makeDocId('ACT');
  const notifId = makeDocId('NTF');

  const batch = writeBatch(db);
  batch.set(doc(db, 'branches', branchId, 'dailyCodes', dateStr), {
    code: newCode,
    date: dateStr,
    branchId,
    createdBy: staffName,
    createdAt: serverTimestamp()
  });
  batch.set(doc(db, 'activities', actId), {
    id: actId,
    branchId,
    user: staffName,
    action: `Regenerated Daily Submission Code to ${newCode}`,
    target: branchId,
    date: dateStr,
    time: timeStr,
    createdAt: serverTimestamp()
  });
  batch.set(doc(db, 'notifications', notifId), {
    id: notifId,
    branchId,
    type: 'code',
    title: 'Daily Submission Code Updated',
    msg: `New daily code ${newCode} generated by ${staffName}.`,
    read: false,
    createdAt: serverTimestamp()
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `branches/${branchId}/dailyCodes/${dateStr}`);
  }
  return newCode;
}

// =============================================================================
// SUBMISSIONS, CLOUD STORAGE UPLOADS & FILE OPERATIONS
// =============================================================================

export async function createVerifiedDraftSubmission(input: {
  branchId: string;
  dailyCode: string;
  sender: SenderUserProfile;
}): Promise<Submission> {
  const { year, month, day, mm, dd, dateStr } = getGhanaDateParts();
  const timeStr = formatGhanaTime();
  const shortRand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const submissionId = `SUB-${year}-${mm}${dd}-${shortRand}`;
  const cleanCode = input.dailyCode.trim().toUpperCase();

  const draft: Submission = {
    id: submissionId,
    branchId: input.branchId,
    senderUid: input.sender.uid,
    senderId: input.sender.senderId,
    senderName: input.sender.name,
    customName: '',
    dailyCode: cleanCode,
    year,
    month,
    day,
    date: dateStr,
    time: timeStr,
    status: 'Uploading',
    assignedTo: 'Unassigned',
    billing: {
      serviceType: 'Colour Printing',
      copies: 1,
      pages: 1,
      unitPrice: 0,
      totalAmount: 0,
      amountPaid: 0,
      paymentMethod: 'Unpaid',
      paymentDate: dateStr
    },
    files: []
  };

  try {
    await setDoc(doc(db, 'submissions', submissionId), {
      ...draft,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    const code = (error as { code?: string })?.code || '';
    const msg = error instanceof Error ? error.message : String(error);
    if (code === 'permission-denied' || msg.includes('permission-denied') || msg.includes('Missing or insufficient permissions')) {
      throw new Error('Invalid or expired Daily Submission Code for this branch.');
    }
    handleFirestoreError(error, OperationType.CREATE, `submissions/${submissionId}`);
  }

  return draft;
}

const FIRESTORE_CHUNK_RAW_BYTES = 480 * 1024; // ~640 KB base64 per doc (well below 1 MiB limit)
const FIRESTORE_CHUNK_MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB max for Firestore Chunked Vault

let cloudStorageBucketCheck: Promise<boolean> | null = null;
const blobUrlCache = new Map<string, string>();
const inFlightUrlFetches = new Map<string, Promise<string>>();

async function isCloudStorageBucketAvailable(): Promise<boolean> {
  if (!cloudStorageBucketCheck) {
    cloudStorageBucketCheck = (async () => {
      const bucket = firebaseConfig.storageBucket;
      if (!bucket) return false;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2200);
      try {
        const res = await fetch(
          `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o?maxResults=1`,
          { method: 'GET', signal: controller.signal }
        );
        // 404 means Storage bucket was never provisioned; 200/401/403 means bucket exists
        return res.status !== 404;
      } catch {
        return false;
      } finally {
        clearTimeout(timer);
      }
    })();
  }
  return cloudStorageBucketCheck;
}

function uint8ToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const sliceSize = 0x2000;
  for (let i = 0; i < bytes.length; i += sliceSize) {
    const slice = bytes.subarray(i, i + sliceSize);
    parts.push(String.fromCharCode(...slice));
  }
  return btoa(parts.join(''));
}

function base64ToUint8(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function parseFirestoreStoragePath(storagePath: string): { branchId: string; submissionId: string; fileId: string } | null {
  if (!storagePath.startsWith('firestore://')) return null;
  const parts = storagePath.slice('firestore://'.length).split('/');
  if (parts.length !== 3) return null;
  return { branchId: parts[0], submissionId: parts[1], fileId: parts[2] };
}

export async function deleteUploadedFileArtifact(params: {
  storagePath: string;
  senderUid?: string;
}): Promise<void> {
  const { storagePath, senderUid } = params;
  if (!storagePath) return;

  const cachedUrl = blobUrlCache.get(storagePath);
  if (cachedUrl) {
    try {
      URL.revokeObjectURL(cachedUrl);
    } catch {
      // ignore revoke errors
    }
    blobUrlCache.delete(storagePath);
  }

  const parsed = parseFirestoreStoragePath(storagePath);
  if (parsed) {
    await deleteFirestoreFileChunks({
      submissionId: parsed.submissionId,
      branchId: parsed.branchId,
      fileId: parsed.fileId,
      senderUid
    });
    return;
  }

  try {
    await deleteObject(ref(storage, storagePath));
  } catch (err) {
    const code = (err as { code?: string })?.code || '';
    if (code !== 'storage/object-not-found') {
      throw err;
    }
  }
}

async function deleteFirestoreFileChunks(params: {
  submissionId: string;
  branchId?: string;
  fileId?: string;
  senderUid?: string;
}): Promise<void> {
  const uid = params.senderUid || auth.currentUser?.uid;
  const isSenderUser = Boolean(auth.currentUser?.email?.endsWith('@senders.pphub.app'));
  const colRef = collection(db, 'submissions', params.submissionId, 'fileChunks');

  const constraints = [];
  if (isSenderUser && uid) {
    constraints.push(where('senderUid', '==', uid));
  } else if (params.branchId) {
    constraints.push(where('branchId', '==', params.branchId));
  } else if (uid) {
    constraints.push(where('senderUid', '==', uid));
  }
  if (params.fileId) {
    constraints.push(where('fileId', '==', params.fileId));
  }

  if (constraints.length === 0) return;

  try {
    const snap = await getDocs(query(colRef, ...constraints));
    if (snap.empty) return;
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      for (const d of snap.docs.slice(i, i + 400)) {
        batch.delete(d.ref);
      }
      await batch.commit();
    }
  } catch {
    // Best-effort cleanup for draft/abandoned chunks
  }
}

export async function deleteDraftSubmission(submissionId: string, uploadedPaths: string[] = []): Promise<void> {
  for (const path of uploadedPaths) {
    try {
      await deleteUploadedFileArtifact({ storagePath: path, senderUid: auth.currentUser?.uid });
    } catch {
      // Ignore if object already absent
    }
  }
  await deleteFirestoreFileChunks({ submissionId, senderUid: auth.currentUser?.uid });
  try {
    await deleteDoc(doc(db, 'submissions', submissionId));
  } catch {
    // Ignore if already deleted
  }
}

async function uploadFileToFirestoreChunks(params: {
  branchId: string;
  submissionId: string;
  fileId: string;
  file: File;
  onProgress: (pct: number) => void;
  isCanceled: () => boolean;
}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You must be signed in to upload files.');
  if (params.file.size > FIRESTORE_CHUNK_MAX_FILE_BYTES) {
    throw new Error(
      `"${params.file.name}" exceeds the 25 MB direct upload limit while Cloud Storage is disabled.`
    );
  }

  const mimeType = getFileMimeType(params.file);
  const buffer = await params.file.arrayBuffer();
  const totalBytes = buffer.byteLength;
  const totalChunks = Math.max(1, Math.ceil(totalBytes / FIRESTORE_CHUNK_RAW_BYTES));
  const storagePath = `firestore://${params.branchId}/${params.submissionId}/${params.fileId}`;

  let completedChunks = 0;
  let nextIdx = 0;
  const concurrency = Math.min(4, totalChunks);

  const worker = async () => {
    while (true) {
      if (params.isCanceled()) {
        const cancelErr = new Error('Upload canceled') as Error & { code?: string };
        cancelErr.code = 'storage/canceled';
        throw cancelErr;
      }
      const idx = nextIdx++;
      if (idx >= totalChunks) break;

      const start = idx * FIRESTORE_CHUNK_RAW_BYTES;
      const end = Math.min(totalBytes, start + FIRESTORE_CHUNK_RAW_BYTES);
      const slice = new Uint8Array(buffer, start, end - start);
      const encoded = uint8ToBase64(slice);

      const chunkId = `${params.fileId}_${idx}`;
      await setDoc(doc(db, 'submissions', params.submissionId, 'fileChunks', chunkId), {
        submissionId: params.submissionId,
        branchId: params.branchId,
        senderUid: uid,
        fileId: params.fileId,
        chunkIndex: idx,
        totalChunks,
        mimeType,
        data: encoded,
        createdAt: serverTimestamp()
      });

      completedChunks++;
      const pct = Math.min(99, Math.max(5, Math.round((completedChunks / totalChunks) * 100)));
      params.onProgress(pct);
    }
  };

  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    if (params.isCanceled()) {
      const cancelErr = new Error('Upload canceled') as Error & { code?: string };
      cancelErr.code = 'storage/canceled';
      throw cancelErr;
    }
    params.onProgress(100);
    return storagePath;
  } catch (err) {
    await deleteFirestoreFileChunks({
      submissionId: params.submissionId,
      branchId: params.branchId,
      fileId: params.fileId,
      senderUid: uid
    });
    throw err;
  }
}

export function uploadSingleSubmissionFile(params: {
  branchId: string;
  submissionId: string;
  dateStr: string;
  fileId: string;
  file: File;
  onProgress: (pct: number) => void;
}): { task?: UploadTask; cancel: () => void; storagePath: string; promise: Promise<string> } {
  const [yyyy, mm, dd] = params.dateStr.split('-');
  const safeName = sanitizeFileName(params.file.name);
  const gcsStoragePath = `branches/${params.branchId}/${yyyy}/${mm}/${dd}/${params.submissionId}/${params.fileId}-${safeName}`;

  let canceled = false;
  let activeTask: UploadTask | undefined;

  const cancel = () => {
    canceled = true;
    if (activeTask) {
      activeTask.cancel();
    }
  };

  const promise = (async (): Promise<string> => {
    const bucketReady = await isCloudStorageBucketAvailable();

    if (bucketReady) {
      try {
        const mimeType = getFileMimeType(params.file);
        const fileRef = ref(storage, gcsStoragePath);
        const task = uploadBytesResumable(fileRef, params.file, { contentType: mimeType });
        activeTask = task;

        if (canceled) {
          task.cancel();
          const cancelErr = new Error('Upload canceled') as Error & { code?: string };
          cancelErr.code = 'storage/canceled';
          throw cancelErr;
        }

        const uploadedPath = await new Promise<string>((resolve, reject) => {
          task.on(
            'state_changed',
            (snap) => {
              const pct = snap.totalBytes > 0 ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
              params.onProgress(pct);
            },
            (error) => reject(error),
            () => resolve(gcsStoragePath)
          );
        });
        return uploadedPath;
      } catch (err) {
        const code = (err as { code?: string })?.code || '';
        if (code === 'storage/canceled' || canceled) {
          throw err;
        }
        // If Storage rules aren't deployed or bucket failed, disable Storage for this session and fall back
        if (
          (code === 'storage/unauthorized' ||
            code === 'storage/bucket-not-found' ||
            code === 'storage/retry-limit-exceeded' ||
            code === 'storage/unknown') &&
          params.file.size <= FIRESTORE_CHUNK_MAX_FILE_BYTES
        ) {
          cloudStorageBucketCheck = Promise.resolve(false);
        } else {
          throw err;
        }
      }
    }

    return uploadFileToFirestoreChunks({
      branchId: params.branchId,
      submissionId: params.submissionId,
      fileId: params.fileId,
      file: params.file,
      onProgress: params.onProgress,
      isCanceled: () => canceled
    });
  })();

  return { cancel, storagePath: gcsStoragePath, promise };
}

export async function finalizeDraftSubmission(params: {
  draft: Submission;
  customName: string;
  files: SubmissionFile[];
  senderName: string;
}): Promise<void> {
  const { dateStr } = getGhanaDateParts();
  const timeStr = formatGhanaTime();
  const totalBytes = params.files.reduce((sum, f) => sum + (f.sizeBytes || 0), 0);
  const actId = makeDocId('ACT');
  const notifId = makeDocId('NTF');
  const cleanCustomName = params.customName.trim().slice(0, 180);

  const batch = writeBatch(db);
  batch.update(doc(db, 'submissions', params.draft.id), {
    status: 'Received',
    customName: cleanCustomName,
    files: params.files,
    time: timeStr,
    billing: {
      ...params.draft.billing,
      pages: Math.max(1, params.files.length)
    }
  });

  if (totalBytes > 0) {
    batch.update(doc(db, 'branches', params.draft.branchId), {
      storageUsedBytes: increment(totalBytes)
    });
  }

  batch.set(doc(db, 'activities', actId), {
    id: actId,
    branchId: params.draft.branchId,
    user: `${params.senderName} (Sender)`,
    action: `Submitted "${cleanCustomName}" (${params.files.length} file${params.files.length === 1 ? '' : 's'}) via Daily Code ${params.draft.dailyCode}`,
    target: params.draft.id,
    date: dateStr,
    time: timeStr,
    createdAt: serverTimestamp()
  });

  batch.set(doc(db, 'notifications', notifId), {
    id: notifId,
    branchId: params.draft.branchId,
    type: 'submission',
    title: 'New File Submission',
    msg: `${params.senderName} submitted "${cleanCustomName}" (${params.files.length} file${params.files.length === 1 ? '' : 's'}).`,
    read: false,
    createdAt: serverTimestamp()
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `submissions/${params.draft.id}`);
  }
}

export async function getFileDownloadUrl(storagePath: string): Promise<string> {
  if (!storagePath) throw new Error('Missing storage path.');

  const parsed = parseFirestoreStoragePath(storagePath);
  if (!parsed) {
    return getDownloadURL(ref(storage, storagePath));
  }

  const cached = blobUrlCache.get(storagePath);
  if (cached) return cached;

  const existingFetch = inFlightUrlFetches.get(storagePath);
  if (existingFetch) return existingFetch;

  const promise = (async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('You must be signed in to access files.');
    const isSenderUser = Boolean(auth.currentUser?.email?.endsWith('@senders.pphub.app'));
    const colRef = collection(db, 'submissions', parsed.submissionId, 'fileChunks');

    const q = isSenderUser
      ? query(colRef, where('senderUid', '==', uid), where('fileId', '==', parsed.fileId))
      : query(colRef, where('branchId', '==', parsed.branchId), where('fileId', '==', parsed.fileId));

    let snap;
    try {
      snap = await getDocs(q);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `submissions/${parsed.submissionId}/fileChunks`);
    }

    if (snap.empty) {
      throw new Error('File chunks were not found in Cloud archive.');
    }

    const docs = snap.docs
      .map((d) => d.data() as { chunkIndex: number; mimeType: string; data: string })
      .sort((a, b) => a.chunkIndex - b.chunkIndex);

    const mimeType = docs[0].mimeType || 'application/octet-stream';
    const byteArrays = docs.map((d) => base64ToUint8(d.data));
    const blob = new Blob(byteArrays, { type: mimeType });
    const url = URL.createObjectURL(blob);
    blobUrlCache.set(storagePath, url);
    return url;
  })().finally(() => {
    inFlightUrlFetches.delete(storagePath);
  });

  inFlightUrlFetches.set(storagePath, promise);
  return promise;
}

export async function updateSubmissionOperations(params: {
  submission: Submission;
  staff: StaffUserProfile;
  newStatus?: Exclude<SubmissionStatus, 'Uploading'>;
  newBilling?: SubmissionBilling;
}): Promise<void> {
  const { submission, staff, newStatus, newBilling } = params;
  const canStatus = staff.role === 'manager' || staff.permissions.updateStatus;
  const canBilling = staff.role === 'manager' || staff.permissions.recordBilling;

  const updates: Record<string, unknown> = {
    assignedTo: staff.fullName
  };

  if (canStatus && newStatus) {
    updates.status = newStatus;
  }
  if (canBilling && newBilling) {
    updates.billing = newBilling;
  }

  if (!updates.status && !updates.billing) {
    throw new Error('Your account does not have permission to modify status or billing.');
  }

  const { dateStr } = getGhanaDateParts();
  const timeStr = formatGhanaTime();
  const actId = makeDocId('ACT');

  const descParts: string[] = [];
  if (updates.status && updates.status !== submission.status) {
    descParts.push(`status (${submission.status} → ${updates.status})`);
  }
  if (updates.billing && newBilling) {
    descParts.push(`billing (Paid GH₵ ${newBilling.amountPaid.toFixed(2)})`);
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'submissions', submission.id), updates);
  batch.set(doc(db, 'activities', actId), {
    id: actId,
    branchId: submission.branchId,
    user: staff.fullName,
    action: `Updated ${submission.id} ${descParts.join(' & ') || 'details'}`,
    target: submission.id,
    date: dateStr,
    time: timeStr,
    createdAt: serverTimestamp()
  });

  if (updates.status === 'Printed' || updates.status === 'Ready for Collection') {
    const notifId = makeDocId('NTF');
    batch.set(doc(db, 'notifications', notifId), {
      id: notifId,
      branchId: submission.branchId,
      type: 'job',
      title: `Job ${updates.status}`,
      msg: `${submission.customName} for ${submission.senderName} is now ${updates.status}.`,
      read: false,
      createdAt: serverTimestamp()
    });
  } else if (updates.billing && newBilling && newBilling.amountPaid > submission.billing.amountPaid) {
    const notifId = makeDocId('NTF');
    batch.set(doc(db, 'notifications', notifId), {
      id: notifId,
      branchId: submission.branchId,
      type: 'payment',
      title: `${newBilling.paymentMethod} Payment Recorded`,
      msg: `${staff.fullName} recorded GH₵ ${newBilling.amountPaid.toFixed(2)} for ${submission.id}.`,
      read: false,
      createdAt: serverTimestamp()
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `submissions/${submission.id}`);
  }
}

export async function logFilePrintAction(
  submission: Submission,
  filename: string,
  staff: StaffUserProfile
): Promise<void> {
  const { dateStr } = getGhanaDateParts();
  const timeStr = formatGhanaTime();
  const actId = makeDocId('ACT');
  const canStatus = staff.role === 'manager' || staff.permissions.updateStatus;

  const batch = writeBatch(db);
  if (canStatus && submission.status === 'Received') {
    batch.update(doc(db, 'submissions', submission.id), {
      status: 'Printing',
      assignedTo: staff.fullName
    });
  }
  batch.set(doc(db, 'activities', actId), {
    id: actId,
    branchId: submission.branchId,
    user: staff.fullName,
    action: `Sent "${filename}" to printer`,
    target: submission.id,
    date: dateStr,
    time: timeStr,
    createdAt: serverTimestamp()
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `submissions/${submission.id}`);
  }
}

export async function deleteFileFromSubmission(
  submission: Submission,
  fileId: string,
  staff: StaffUserProfile
): Promise<void> {
  const targetFile = submission.files.find((f) => f.fileId === fileId);
  if (!targetFile) return;

  // 1. Delete from Cloud Storage or Firestore Chunked Vault first
  if (targetFile.storagePath) {
    await deleteUploadedFileArtifact({
      storagePath: targetFile.storagePath,
      senderUid: submission.senderUid
    });
  }

  // 2. Update/Delete submission doc, decrement branch storageUsedBytes, log activity in transaction
  const remaining = submission.files.filter((f) => f.fileId !== fileId);
  const { dateStr } = getGhanaDateParts();
  const timeStr = formatGhanaTime();
  const actId = makeDocId('ACT');

  try {
    await runTransaction(db, async (tx) => {
      const branchRef = doc(db, 'branches', submission.branchId);
      const branchPubRef = doc(db, 'branchPublic', submission.branchId);
      const subRef = doc(db, 'submissions', submission.id);

      const branchSnap = await tx.get(branchRef);
      if (branchSnap.exists()) {
        const bData = branchSnap.data() as BranchPrivate;
        const nextBytes = Math.max(0, (bData.storageUsedBytes || 0) - (targetFile.sizeBytes || 0));
        tx.update(branchRef, { storageUsedBytes: nextBytes });
        const quotaBytes = (bData.storageQuotaMB || 10240) * 1024 * 1024;
        tx.update(branchPubRef, { quotaFull: nextBytes >= quotaBytes });
      }

      if (remaining.length === 0) {
        tx.delete(subRef);
      } else {
        tx.update(subRef, { files: remaining });
      }

      tx.set(doc(db, 'activities', actId), {
        id: actId,
        branchId: submission.branchId,
        user: staff.fullName,
        action: `Deleted file "${targetFile.originalName}" from ${submission.id}`,
        target: submission.id,
        date: dateStr,
        time: timeStr,
        createdAt: serverTimestamp()
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `submissions/${submission.id}`);
  }
}

// =============================================================================
// EXPENSES, STAFF MANAGEMENT, BRANCH SETTINGS, NOTIFICATIONS, ACTIVITIES
// =============================================================================

export async function addBranchExpense(input: {
  branchId: string;
  category: string;
  description: string;
  amount: number;
  recordedBy: string;
}): Promise<void> {
  const { dateStr } = getGhanaDateParts();
  const timeStr = formatGhanaTime();
  const expId = makeDocId('EXP');
  const actId = makeDocId('ACT');

  const batch = writeBatch(db);
  batch.set(doc(db, 'expenses', expId), {
    id: expId,
    branchId: input.branchId,
    date: dateStr,
    category: input.category.trim().slice(0, 80),
    description: input.description.trim().slice(0, 240),
    amount: Number(input.amount),
    recordedBy: input.recordedBy.slice(0, 120),
    createdAt: serverTimestamp()
  });
  batch.set(doc(db, 'activities', actId), {
    id: actId,
    branchId: input.branchId,
    user: input.recordedBy,
    action: `Recorded expense: ${input.description.trim()} (GH₵ ${Number(input.amount).toFixed(2)})`,
    target: input.category,
    date: dateStr,
    time: timeStr,
    createdAt: serverTimestamp()
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `expenses/${expId}`);
  }
}

export async function deleteBranchExpense(expense: Expense, staffName: string): Promise<void> {
  const { dateStr } = getGhanaDateParts();
  const timeStr = formatGhanaTime();
  const actId = makeDocId('ACT');

  const batch = writeBatch(db);
  batch.delete(doc(db, 'expenses', expense.id));
  batch.set(doc(db, 'activities', actId), {
    id: actId,
    branchId: expense.branchId,
    user: staffName,
    action: `Removed expense: ${expense.description} (GH₵ ${expense.amount.toFixed(2)})`,
    target: expense.id,
    date: dateStr,
    time: timeStr,
    createdAt: serverTimestamp()
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `expenses/${expense.id}`);
  }
}

export async function toggleStaffPerm(
  operator: StaffUserProfile,
  perm: keyof StaffPermissions,
  managerName: string
): Promise<void> {
  const updatedPerms: StaffPermissions = {
    ...operator.permissions,
    [perm]: !operator.permissions[perm]
  };
  const { dateStr } = getGhanaDateParts();
  const timeStr = formatGhanaTime();
  const actId = makeDocId('ACT');

  const batch = writeBatch(db);
  batch.update(doc(db, 'users', operator.uid), { permissions: updatedPerms });
  batch.set(doc(db, 'activities', actId), {
    id: actId,
    branchId: operator.branchId,
    user: managerName,
    action: `Updated ${perm} permission (${updatedPerms[perm] ? 'Granted' : 'Revoked'}) for ${operator.fullName}`,
    target: operator.username,
    date: dateStr,
    time: timeStr,
    createdAt: serverTimestamp()
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${operator.uid}`);
  }
}

export async function toggleStaffActive(operator: StaffUserProfile, managerName: string): Promise<void> {
  const nextActive = !operator.active;
  const { dateStr } = getGhanaDateParts();
  const timeStr = formatGhanaTime();
  const actId = makeDocId('ACT');

  const batch = writeBatch(db);
  batch.update(doc(db, 'users', operator.uid), { active: nextActive });
  batch.set(doc(db, 'activities', actId), {
    id: actId,
    branchId: operator.branchId,
    user: managerName,
    action: `${nextActive ? 'Reactivated' : 'Deactivated'} operator account ${operator.fullName}`,
    target: operator.username,
    date: dateStr,
    time: timeStr,
    createdAt: serverTimestamp()
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${operator.uid}`);
  }
}

export async function removeStaff(operator: StaffUserProfile, managerName: string): Promise<void> {
  const { dateStr } = getGhanaDateParts();
  const timeStr = formatGhanaTime();
  const actId = makeDocId('ACT');

  const batch = writeBatch(db);
  batch.delete(doc(db, 'users', operator.uid));
  batch.set(doc(db, 'activities', actId), {
    id: actId,
    branchId: operator.branchId,
    user: managerName,
    action: `Removed operator profile for ${operator.fullName} (${operator.username})`,
    target: operator.username,
    date: dateStr,
    time: timeStr,
    createdAt: serverTimestamp()
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${operator.uid}`);
  }
}

export async function updateBranchProfile(input: {
  branchId: string;
  name: string;
  area: string;
  city: string;
  phone: string;
  retentionDays?: number;
  storageQuotaMB?: number;
  storageUsedBytes: number;
}): Promise<void> {
  const name = input.name.trim().slice(0, 120);
  const area = input.area.trim().slice(0, 120);
  const city = input.city.trim().slice(0, 80);
  const phone = input.phone.trim().slice(0, 40);
  const quotaMB = input.storageQuotaMB ?? 10240;
  const quotaFull = input.storageUsedBytes >= quotaMB * 1024 * 1024;

  const batch = writeBatch(db);
  batch.update(doc(db, 'branches', input.branchId), {
    name,
    area,
    city,
    phone,
    ...(input.retentionDays ? { retentionDays: input.retentionDays } : {}),
    ...(input.storageQuotaMB ? { storageQuotaMB: input.storageQuotaMB } : {})
  });
  batch.update(doc(db, 'branchPublic', input.branchId), {
    name,
    area,
    city,
    phone,
    quotaFull
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `branches/${input.branchId}`);
  }
}

export async function updateSenderProfile(uid: string, name: string, phone: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid), {
      name: name.trim().slice(0, 120),
      phone: phone.trim().slice(0, 40)
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function markNotificationRead(notifId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notifId), { read: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notifId}`);
  }
}

export async function logBranchActivity(
  branchId: string,
  user: string,
  action: string,
  target: string
): Promise<void> {
  const { dateStr } = getGhanaDateParts();
  const timeStr = formatGhanaTime();
  const actId = makeDocId('ACT');
  try {
    await setDoc(doc(db, 'activities', actId), {
      id: actId,
      branchId,
      user: user.slice(0, 140),
      action: action.slice(0, 320),
      target: target.slice(0, 120),
      date: dateStr,
      time: timeStr,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `activities/${actId}`);
  }
}

// =============================================================================
// REAL-TIME FIRESTORE LISTENERS (onSnapshot)
// =============================================================================

function sortByCreatedAtDesc<T extends { createdAt?: { toMillis?: () => number } | null }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const am = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : 0;
    const bm = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : 0;
    return bm - am;
  });
}

export function subscribeBranchPrivate(
  branchId: string,
  onData: (branch: BranchPrivate | null) => void,
  onError: (err: unknown) => void
): Unsubscribe {
  const path = `branches/${branchId}`;
  return onSnapshot(
    doc(db, 'branches', branchId),
    (snap) => onData(snap.exists() ? (snap.data() as BranchPrivate) : null),
    (error) => {
      onError(error);
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
}

export function subscribeBranchDailyCodes(
  branchId: string,
  onData: (codes: DailyCodeDoc[]) => void,
  onError: (err: unknown) => void
): Unsubscribe {
  const path = `branches/${branchId}/dailyCodes`;
  const q = query(collection(db, 'branches', branchId, 'dailyCodes'), where('branchId', '==', branchId));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => d.data() as DailyCodeDoc).sort((a, b) => b.date.localeCompare(a.date));
      onData(items);
    },
    (error) => {
      onError(error);
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
}

export function subscribeBranchSubmissions(
  branchId: string,
  onData: (subs: Submission[]) => void,
  onError: (err: unknown) => void
): Unsubscribe {
  const path = `submissions?branchId=${branchId}`;
  const q = query(collection(db, 'submissions'), where('branchId', '==', branchId));
  return onSnapshot(
    q,
    (snap) => {
      // Staff screens MUST hide status === 'Uploading' drafts
      const visible = snap.docs
        .map((d) => d.data() as Submission)
        .filter((s) => s.status !== 'Uploading');
      onData(sortByCreatedAtDesc(visible));
    },
    (error) => {
      onError(error);
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
}

export function subscribeBranchExpenses(
  branchId: string,
  onData: (exps: Expense[]) => void,
  onError: (err: unknown) => void
): Unsubscribe {
  const path = `expenses?branchId=${branchId}`;
  const q = query(collection(db, 'expenses'), where('branchId', '==', branchId));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => d.data() as Expense);
      onData(sortByCreatedAtDesc(items));
    },
    (error) => {
      onError(error);
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
}

export function subscribeBranchActivities(
  branchId: string,
  onData: (acts: Activity[]) => void,
  onError: (err: unknown) => void
): Unsubscribe {
  const path = `activities?branchId=${branchId}`;
  const q = query(collection(db, 'activities'), where('branchId', '==', branchId));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => d.data() as Activity);
      onData(sortByCreatedAtDesc(items));
    },
    (error) => {
      onError(error);
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
}

export function subscribeBranchNotifications(
  branchId: string,
  onData: (notifs: BranchNotification[]) => void,
  onError: (err: unknown) => void
): Unsubscribe {
  const path = `notifications?branchId=${branchId}`;
  const q = query(collection(db, 'notifications'), where('branchId', '==', branchId));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => d.data() as BranchNotification);
      onData(sortByCreatedAtDesc(items));
    },
    (error) => {
      onError(error);
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
}

export function subscribeBranchStaff(
  branchId: string,
  onData: (staff: StaffUserProfile[]) => void,
  onError: (err: unknown) => void
): Unsubscribe {
  const path = `users?branchId=${branchId}`;
  const q = query(
    collection(db, 'users'),
    where('branchId', '==', branchId),
    where('role', 'in', ['manager', 'operator'])
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as StaffUserProfile)
        .sort((a, b) => (a.role === 'manager' ? -1 : b.role === 'manager' ? 1 : a.fullName.localeCompare(b.fullName)));
      onData(items);
    },
    (error) => {
      onError(error);
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
}

export function subscribePublicBranches(
  onData: (branches: BranchPublic[]) => void,
  onError: (err: unknown) => void
): Unsubscribe {
  const path = 'branchPublic';
  const q = query(collection(db, 'branchPublic'), where('quotaFull', 'in', [true, false]));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as BranchPublic)
        .sort((a, b) => a.name.localeCompare(b.name));
      onData(items);
    },
    (error) => {
      onError(error);
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
}

export function subscribeSenderSubmissions(
  senderUid: string,
  onData: (subs: Submission[]) => void,
  onError: (err: unknown) => void
): Unsubscribe {
  const path = `submissions?senderUid=${senderUid}`;
  const q = query(collection(db, 'submissions'), where('senderUid', '==', senderUid));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => d.data() as Submission);
      onData(sortByCreatedAtDesc(items));
    },
    (error) => {
      onError(error);
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
}

// Clean up any abandoned 'Uploading' drafts left behind by the currently signed-in sender
export async function cleanupSenderAbandonedDrafts(senderUid: string): Promise<number> {
  const q = query(collection(db, 'submissions'), where('senderUid', '==', senderUid));
  const snap = await getDocs(q);
  const now = Date.now();
  let removed = 0;
  for (const d of snap.docs) {
    const sub = d.data() as Submission;
    if (sub.status === 'Uploading') {
      const createdMs = sub.createdAt && typeof sub.createdAt.toMillis === 'function' ? sub.createdAt.toMillis() : 0;
      if (now - createdMs > 24 * 60 * 60 * 1000) {
        await deleteDraftSubmission(sub.id, sub.files.map((f) => f.storagePath));
        removed++;
      }
    }
  }
  return removed;
}
