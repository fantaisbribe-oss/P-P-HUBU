import React, { useRef, useState } from 'react';
import {
  MONTHS_DATA,
  type BranchPublic,
  type RouteId,
  type SenderUserProfile,
  type Submission,
  type SubmissionFile
} from '../types';
import {
  detectFileCategory,
  formatFileSize,
  formatGhanaLongDate,
  getGhanaDateParts,
  getStatusBadgeClasses
} from '../utils/dates';
import {
  changeCurrentUserPassword,
  createVerifiedDraftSubmission,
  deleteDraftSubmission,
  deleteUploadedFileArtifact,
  finalizeDraftSubmission,
  updateSenderProfile,
  uploadSingleSubmissionFile
} from '../services/pphubService';
import { FIREBASE_CONSOLE_STORAGE_URL, getFriendlyError } from '../firebase';

interface StagedUploadItem {
  fileId: string;
  file: File;
  type: SubmissionFile['type'];
  ext: string;
  progress: number;
  status: 'queued' | 'uploading' | 'done' | 'error' | 'canceled';
  errorMsg?: string;
  storagePath?: string;
}

interface SenderWorkspaceProps {
  route: RouteId;
  sender: SenderUserProfile;
  branches: BranchPublic[];
  submissions: Submission[];
  loadingData: boolean;
  onNavigate: (route: RouteId) => void;
  onOpenLightbox: (sub: Submission, file: SubmissionFile) => void;
  onProfileUpdated: (name: string, phone: string) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const SenderWorkspace: React.FC<SenderWorkspaceProps> = ({
  route,
  sender,
  branches,
  submissions,
  loadingData,
  onNavigate,
  onOpenLightbox,
  onProfileUpdated,
  showToast
}) => {
  const [connectedBranchId, setConnectedBranchId] = useState<string>('');
  const [branchCodeInput, setBranchCodeInput] = useState<string>('');
  const [dailyCodeInput, setDailyCodeInput] = useState<string>('');
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [activeDraft, setActiveDraft] = useState<Submission | null>(null);
  const [customSubName, setCustomSubName] = useState('');
  const [stagedItems, setStagedItems] = useState<StagedUploadItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);

  // Branch directory search
  const [branchSearch, setBranchSearch] = useState('');

  // Account settings state
  const [editName, setEditName] = useState(sender.name);
  const [editPhone, setEditPhone] = useState(sender.phone);
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  const activeCancelsRef = useRef<Map<string, () => void>>(new Map());
  const inFlightPromisesRef = useRef<Map<string, Promise<StagedUploadItem>>>(new Map());
  const removedIdsRef = useRef<Set<string>>(new Set());

  const selectedBranch = branches.find((b) => b.branchId === connectedBranchId) || null;
  const { month, day, year } = getGhanaDateParts();
  const todayMonthName = MONTHS_DATA[month]?.name || '';

  const connectToBranch = async (branchIdRaw: string) => {
    const clean = branchIdRaw.trim().toUpperCase();
    if (!clean) return;
    const found = branches.find((b) => b.branchId === clean);
    if (!found) {
      showToast('Branch Code not found. Please select a registered printing press.', 'error');
      return;
    }
    if (activeDraft) {
      for (const cancel of activeCancelsRef.current.values()) {
        cancel();
      }
      activeCancelsRef.current.clear();
      inFlightPromisesRef.current.clear();
      await deleteDraftSubmission(
        activeDraft.id,
        stagedItems.filter((i) => i.storagePath).map((i) => i.storagePath!)
      );
      setActiveDraft(null);
      setStagedItems([]);
    }
    setConnectedBranchId(found.branchId);
    setBranchCodeInput(found.branchId);
    setDailyCodeInput('');
    setStorageWarning(false);
    showToast(`Connected to ${found.name}`, 'success');
    if (route !== 'sender-submit') {
      onNavigate('sender-submit');
    }
  };

  const handleVerifyDailyCode = async () => {
    if (!selectedBranch) return;
    if (selectedBranch.quotaFull) {
      showToast('This printing press branch has reached its cloud storage limit. Please contact the branch.', 'error');
      return;
    }
    const entered = dailyCodeInput.trim().toUpperCase();
    if (entered.length < 5) {
      showToast('Please enter a valid Daily Submission Code.', 'error');
      return;
    }

    setVerifyingCode(true);
    try {
      const draft = await createVerifiedDraftSubmission({
        branchId: selectedBranch.branchId,
        dailyCode: entered,
        sender
      });
      removedIdsRef.current.clear();
      activeCancelsRef.current.clear();
      inFlightPromisesRef.current.clear();
      setActiveDraft(draft);
      setStagedItems([]);
      setStorageWarning(false);
      showToast('Daily Submission Code verified! Upload workspace unlocked.', 'success');
    } catch (err) {
      showToast(getFriendlyError(err).message, 'error');
    } finally {
      setVerifyingCode(false);
    }
  };

  const uploadSingleItem = (item: StagedUploadItem, draft: Submission): Promise<StagedUploadItem> => {
    if (item.status === 'done' && item.storagePath) {
      return Promise.resolve(item);
    }
    const existing = inFlightPromisesRef.current.get(item.fileId);
    if (existing) {
      return existing;
    }

    removedIdsRef.current.delete(item.fileId);
    setStagedItems((prev) =>
      prev.map((x) => (x.fileId === item.fileId ? { ...x, status: 'uploading', progress: 5, errorMsg: undefined } : x))
    );

    const { cancel, promise } = uploadSingleSubmissionFile({
      branchId: draft.branchId,
      submissionId: draft.id,
      dateStr: draft.date,
      fileId: item.fileId,
      file: item.file,
      onProgress: (pct) => {
        if (removedIdsRef.current.has(item.fileId)) return;
        setStagedItems((prev) => prev.map((x) => (x.fileId === item.fileId ? { ...x, progress: pct } : x)));
      }
    });

    activeCancelsRef.current.set(item.fileId, cancel);

    const wrappedPromise = promise
      .then((storagePath): StagedUploadItem => {
        activeCancelsRef.current.delete(item.fileId);
        inFlightPromisesRef.current.delete(item.fileId);
        if (removedIdsRef.current.has(item.fileId)) {
          deleteUploadedFileArtifact({ storagePath, senderUid: sender.uid }).catch(() => {});
          return { ...item, status: 'canceled', progress: 0 };
        }
        const updated: StagedUploadItem = { ...item, status: 'done', progress: 100, storagePath };
        setStagedItems((prev) => prev.map((x) => (x.fileId === item.fileId ? updated : x)));
        return updated;
      })
      .catch((err): StagedUploadItem => {
        activeCancelsRef.current.delete(item.fileId);
        inFlightPromisesRef.current.delete(item.fileId);
        const code = (err as { code?: string })?.code || '';
        if (code === 'storage/canceled' || removedIdsRef.current.has(item.fileId)) {
          const canceled: StagedUploadItem = { ...item, status: 'canceled', progress: 0, errorMsg: 'Upload canceled' };
          setStagedItems((prev) => prev.map((x) => (x.fileId === item.fileId ? canceled : x)));
          return canceled;
        }
        const friendly = getFriendlyError(err);
        if (friendly.needsStorageConsoleEnable) {
          setStorageWarning(true);
        }
        const failed: StagedUploadItem = { ...item, status: 'error', errorMsg: friendly.message };
        setStagedItems((prev) => prev.map((x) => (x.fileId === item.fileId ? failed : x)));
        return failed;
      });

    inFlightPromisesRef.current.set(item.fileId, wrappedPromise);
    return wrappedPromise;
  };

  const runWithConcurrency = async (items: StagedUploadItem[], draft: Submission, limit = 3): Promise<StagedUploadItem[]> => {
    const results: StagedUploadItem[] = new Array(items.length);
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const idx = nextIndex++;
        if (idx >= items.length) break;
        results[idx] = await uploadSingleItem(items[idx], draft);
      }
    });
    await Promise.all(workers);
    return results;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files || []);
    if (!chosen.length) return;

    const nextItems: StagedUploadItem[] = [];
    for (const file of chosen) {
      const check = detectFileCategory(file);
      if (!check.valid) {
        showToast(check.reason || 'File rejected.', 'error');
        continue;
      }
      if (stagedItems.length + nextItems.length >= 25) {
        showToast('Maximum 25 files per submission.', 'error');
        break;
      }
      nextItems.push({
        fileId: `FIL-${Date.now().toString().slice(-5)}-${Math.floor(100 + Math.random() * 900)}`,
        file,
        type: check.type,
        ext: check.ext,
        progress: 0,
        status: 'queued'
      });
    }

    if (nextItems.length > 0) {
      setStagedItems((prev) => [...prev, ...nextItems]);
      if (activeDraft) {
        // Start uploading immediately in background so Submit finishes near-instantly
        void runWithConcurrency(nextItems, activeDraft, 3);
      }
    }
    e.target.value = '';
  };

  const handleCancelSingleUpload = (fileId: string) => {
    removedIdsRef.current.add(fileId);
    const cancel = activeCancelsRef.current.get(fileId);
    if (cancel) {
      cancel();
      activeCancelsRef.current.delete(fileId);
    }
    const target = stagedItems.find((x) => x.fileId === fileId);
    if (target?.storagePath) {
      deleteUploadedFileArtifact({ storagePath: target.storagePath, senderUid: sender.uid }).catch(() => {});
    }
    setStagedItems((prev) => prev.filter((x) => x.fileId !== fileId));
  };

  const handleRetrySingleUpload = async (item: StagedUploadItem) => {
    if (!activeDraft) return;
    await uploadSingleItem({ ...item, status: 'queued', errorMsg: undefined }, activeDraft);
  };

  const handleCancelDraft = async () => {
    for (const cancel of activeCancelsRef.current.values()) {
      cancel();
    }
    activeCancelsRef.current.clear();
    inFlightPromisesRef.current.clear();
    if (activeDraft) {
      await deleteDraftSubmission(
        activeDraft.id,
        stagedItems.filter((i) => i.storagePath).map((i) => i.storagePath!)
      );
    }
    setActiveDraft(null);
    setStagedItems([]);
    setCustomSubName('');
    setDailyCodeInput('');
    showToast('Draft submission canceled and cleaned up.', 'info');
  };

  const handleSubmitPackage = async () => {
    if (!activeDraft || !selectedBranch) return;
    if (!customSubName.trim()) {
      showToast('Please enter a custom submission name.', 'error');
      return;
    }
    if (stagedItems.length === 0) {
      showToast('Please attach at least one file before submitting.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const results = await runWithConcurrency(stagedItems, activeDraft, 3);

      const failed = results.filter((r) => r.status !== 'done' || !r.storagePath);
      if (failed.length > 0) {
        showToast(
          `${failed.length} file(s) failed or were canceled. Retry failed files or remove them before finalizing.`,
          'error'
        );
        return;
      }

      const finalFiles: SubmissionFile[] = results.map((r) => ({
        fileId: r.fileId,
        originalName: r.file.name.slice(0, 200),
        type: r.type,
        ext: r.ext,
        sizeBytes: r.file.size,
        storagePath: r.storagePath!,
        pagesPreview: `Uploaded ${r.ext} file (${formatFileSize(r.file.size)})`
      }));

      await finalizeDraftSubmission({
        draft: activeDraft,
        customName: customSubName,
        files: finalFiles,
        senderName: sender.name
      });

      const refId = activeDraft.id;
      activeCancelsRef.current.clear();
      inFlightPromisesRef.current.clear();
      setActiveDraft(null);
      setStagedItems([]);
      setCustomSubName('');
      setDailyCodeInput('');
      showToast(`Success! Submitted to ${selectedBranch.name} (Ref: ${refId})`, 'success');
      onNavigate('sender-history');
    } catch (err) {
      showToast(getFriendlyError(err).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateSenderProfile(sender.uid, editName, editPhone);
      onProfileUpdated(editName.trim(), editPhone.trim());
      showToast('Sender profile updated.', 'success');
    } catch (err) {
      showToast(getFriendlyError(err).message, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin !== confirmPin) {
      showToast('New PIN and confirmation PIN do not match.', 'error');
      return;
    }
    setSavingPin(true);
    try {
      await changeCurrentUserPassword(currentPin, newPin, 'sender');
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      showToast('Your 4-digit security PIN has been updated!', 'success');
    } catch (err) {
      showToast(getFriendlyError(err).message, 'error');
    } finally {
      setSavingPin(false);
    }
  };

  // ================= ROUTE: SENDER SUBMIT =================
  if (route === 'sender-submit') {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        {/* Step 1: Connect to Printing Press Branch */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 luxury-shadow">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600">STEP 1 OF 3</span>
              <h3 className="text-lg font-extrabold text-slate-900">Select or Connect to a Printing Press</h3>
            </div>
            {selectedBranch && (
              <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">
                <i className="fa-solid fa-link mr-1"></i> Connected: {selectedBranch.branchId}
              </span>
            )}
          </div>

          {loadingData ? (
            <div className="py-6 text-center text-xs text-slate-500">
              <i className="fa-solid fa-circle-notch fa-spin mr-2 text-blue-600"></i>Loading registered printing presses...
            </div>
          ) : branches.length === 0 ? (
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-600">
              No printing press branches have registered yet. Ask your printing press manager to register their branch first.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Option A: Select Registered Printing Press
                </label>
                <select
                  value={connectedBranchId}
                  onChange={(e) => connectToBranch(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-900 outline-none"
                >
                  <option value="">-- Choose a Printing Press --</option>
                  {branches.map((b) => (
                    <option key={b.branchId} value={b.branchId}>
                      {b.name} ({b.area}, {b.city}) — [{b.branchId}]{b.quotaFull ? ' [STORAGE FULL]' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Option B: Enter Unique Branch Code
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={branchCodeInput}
                    onChange={(e) => setBranchCodeInput(e.target.value)}
                    placeholder="e.g. FANTA-ACC"
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono uppercase"
                  />
                  <button
                    type="button"
                    onClick={() => connectToBranch(branchCodeInput)}
                    className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
                  >
                    Verify
                  </button>
                </div>
              </div>
            </div>
          )}

          {selectedBranch?.quotaFull && (
            <div className="mt-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
              <i className="fa-solid fa-hard-drive"></i>
              <span>
                {selectedBranch.name} has reached its cloud storage quota and cannot accept new uploads right now.
              </span>
            </div>
          )}
        </div>

        {/* Step 2: Verify Daily Submission Code */}
        {selectedBranch && !selectedBranch.quotaFull && !activeDraft && (
          <div className="bg-white rounded-3xl p-6 border border-slate-200 luxury-shadow animate-fade-in">
            <div className="mb-4">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600">STEP 2 OF 3</span>
              <h3 className="text-lg font-extrabold text-slate-900">
                Enter Today&apos;s Daily Submission Code for {selectedBranch.name}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Ask the printing press desk for today&apos;s Daily Submission Code ({formatGhanaLongDate()}, GMT).
                Verified directly by Firestore Security Rules.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={dailyCodeInput}
                onChange={(e) => setDailyCodeInput(e.target.value)}
                placeholder="Enter Branch Daily Code (e.g. PPH-8492)"
                className="flex-1 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-mono text-sm uppercase font-bold"
              />
              <button
                type="button"
                disabled={verifyingCode}
                onClick={handleVerifyDailyCode}
                className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-2"
              >
                {verifyingCode && <i className="fa-solid fa-circle-notch fa-spin"></i>}
                {verifyingCode ? 'Verifying Code...' : 'Unlock Upload Workspace'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Multi-File Upload Workspace */}
        {selectedBranch && activeDraft && (
          <div className="bg-white rounded-3xl p-6 border border-blue-200 luxury-shadow animate-fade-in space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-600">
                  STEP 3 OF 3 • DAILY CODE VERIFIED ({activeDraft.dailyCode})
                </span>
                <h3 className="text-lg font-extrabold text-slate-900">
                  Upload Documents &amp; Pictures to {selectedBranch.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Your files will be routed to{' '}
                  <strong>
                    {todayMonthName} → Day {day}, {year}
                  </strong>{' '}
                  • Ref: <span className="font-mono">{activeDraft.id}</span>
                </p>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={handleCancelDraft}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 text-xs font-bold transition"
              >
                Cancel Draft
              </button>
            </div>

            {storageWarning && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5">
                <p className="font-bold">
                  <i className="fa-solid fa-triangle-exclamation mr-1.5 text-amber-600"></i>
                  Cloud Storage Setup Required
                </p>
                <p className="leading-relaxed">
                  File uploads require Cloud Storage for Firebase (Blaze plan) and deployed <code>storage.rules</code>.
                </p>
                <a
                  href={FIREBASE_CONSOLE_STORAGE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 font-bold text-amber-800 underline"
                >
                  Open Firebase Storage Console <i className="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                </a>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Custom Submission Name (Helps operators identify your print job)
              </label>
              <input
                type="text"
                value={customSubName}
                onChange={(e) => setCustomSubName(e.target.value)}
                required
                maxLength={180}
                placeholder="e.g. Final Year Project Thesis & Cover Page"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:border-blue-600 outline-none"
              />
            </div>

            {/* Real Device File Picker */}
            <div className="border-2 border-dashed border-blue-200 rounded-2xl p-6 text-center bg-blue-50/40">
              <i className="fa-solid fa-cloud-arrow-up text-3xl text-blue-600 mb-2"></i>
              <p className="text-xs font-bold text-slate-800">
                Select Images, PDF, Word, Excel, PowerPoint, or ZIP files (Max 50 MB per file)
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5 mt-4">
                <label className="cursor-pointer px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow transition">
                  <i className="fa-solid fa-folder-plus mr-1.5"></i> Choose Device Files
                  <input
                    type="file"
                    multiple
                    disabled={submitting}
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Staged Files with Real Per-File Progress, Cancel & Retry */}
            {stagedItems.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-extrabold text-slate-700">
                    Selected Files ({stagedItems.length})
                  </h4>
                  {stagedItems.every((i) => i.status === 'done') ? (
                    <span className="text-[11px] font-bold text-emerald-600">
                      <i className="fa-solid fa-circle-check mr-1"></i>All files uploaded &amp; ready
                    </span>
                  ) : stagedItems.some((i) => i.status === 'uploading') ? (
                    <span className="text-[11px] font-bold text-blue-600">
                      <i className="fa-solid fa-circle-notch fa-spin mr-1"></i>
                      Uploading {stagedItems.filter((i) => i.status === 'done').length}/{stagedItems.length}...
                    </span>
                  ) : null}
                </div>
                {stagedItems.map((item) => (
                  <div
                    key={item.fileId}
                    className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <i
                          className={`fa-solid ${
                            item.type === 'image'
                              ? 'fa-image text-blue-600'
                              : item.type === 'pdf'
                              ? 'fa-file-pdf text-red-600'
                              : 'fa-file-lines text-indigo-600'
                          }`}
                        ></i>
                        <span className="font-bold truncate">{item.file.name}</span>
                        <span className="font-mono text-[10px] text-slate-400 shrink-0">
                          ({formatFileSize(item.file.size)})
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {item.status === 'uploading' && (
                          <span className="text-blue-600 font-bold text-[11px] font-mono">
                            {item.progress}%
                          </span>
                        )}
                        {item.status === 'done' && (
                          <span className="text-emerald-600 font-bold text-[11px]">
                            <i className="fa-solid fa-circle-check mr-1"></i>Uploaded
                          </span>
                        )}
                        {(item.status === 'error' || item.status === 'canceled') && (
                          <button
                            type="button"
                            onClick={() => handleRetrySingleUpload(item)}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white font-bold text-[11px] transition"
                          >
                            Retry
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCancelSingleUpload(item.fileId)}
                          className="text-red-500 hover:text-red-700 font-bold px-2"
                        >
                          {item.status === 'uploading' ? 'Cancel' : 'Remove'}
                        </button>
                      </div>
                    </div>

                    {(item.status === 'uploading' || item.status === 'done') && (
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-200 ${
                            item.status === 'done' ? 'bg-emerald-500' : 'bg-blue-600'
                          }`}
                          style={{ width: `${item.progress}%` }}
                        ></div>
                      </div>
                    )}

                    {item.errorMsg && (
                      <p className="text-[11px] text-red-600 font-semibold">{item.errorMsg}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              disabled={submitting || stagedItems.length === 0}
              onClick={handleSubmitPackage}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 disabled:opacity-60 text-white font-bold text-sm shadow-lg shadow-blue-600/25 transition flex items-center justify-center gap-2"
            >
              {submitting ? (
                <i className="fa-solid fa-circle-notch fa-spin"></i>
              ) : (
                <i className="fa-solid fa-paper-plane"></i>
              )}
              {submitting ? 'Uploading & Finalizing Package...' : 'Confirm & Submit Files to Printing Press'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ================= ROUTE: SENDER HISTORY =================
  if (route === 'sender-history') {
    const visibleSubs = submissions.filter((s) => s.status !== 'Uploading');
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 luxury-shadow flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-extrabold text-base text-slate-900">
              My Cloud Submission History ({visibleSubs.length})
            </h3>
            <p className="text-xs text-slate-500">
              Live status updates from your printing press. Removing local files from your device never deletes the cloud copy.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('sender-submit')}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition"
          >
            + New File Submission
          </button>
        </div>

        {loadingData ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 text-xs text-slate-500">
            <i className="fa-solid fa-circle-notch fa-spin text-2xl text-blue-600 mb-3 block"></i>
            Loading your submission history...
          </div>
        ) : visibleSubs.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto text-2xl">
              <i className="fa-solid fa-cloud-arrow-up"></i>
            </div>
            <h4 className="font-extrabold text-base text-slate-900">No Submissions Yet</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Connect to a printing press branch, enter today&apos;s Daily Submission Code, and upload your files.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleSubs.map((s) => {
              const b = branches.find((br) => br.branchId === s.branchId);
              return (
                <div key={s.id} className="bg-white rounded-2xl p-5 border border-slate-200 luxury-shadow space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-blue-600">{s.id}</span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${getStatusBadgeClasses(
                        s.status
                      )}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                      {s.status}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-extrabold text-base text-slate-900">{s.customName}</h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      <i className="fa-solid fa-building mr-1 text-slate-400"></i> {b?.name || s.branchId} • {s.date} (
                      {s.time})
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5">
                    {s.files.map((f) => (
                      <div key={f.fileId} className="text-xs flex items-center justify-between gap-2 text-slate-700">
                        <button
                          type="button"
                          onClick={() => onOpenLightbox(s, f)}
                          className="truncate font-semibold hover:text-blue-600 text-left"
                        >
                          <i className="fa-regular fa-file mr-1.5 text-blue-600"></i>
                          {f.originalName}
                        </button>
                        <span className="font-mono text-[10px] text-slate-400 shrink-0">
                          {formatFileSize(f.sizeBytes)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {s.billing.totalAmount > 0 && (
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                      <span className="text-slate-500 font-semibold">
                        {s.billing.serviceType} ({s.billing.copies} copies)
                      </span>
                      <span className="font-mono font-bold text-slate-900">
                        Paid GH₵ {s.billing.amountPaid.toFixed(2)} / GH₵ {s.billing.totalAmount.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ================= ROUTE: SENDER BRANCHES DIRECTORY =================
  if (route === 'sender-branches') {
    const q = branchSearch.trim().toLowerCase();
    const filtered = branches.filter(
      (b) =>
        !q ||
        b.name.toLowerCase().includes(q) ||
        b.area.toLowerCase().includes(q) ||
        b.city.toLowerCase().includes(q) ||
        b.branchId.toLowerCase().includes(q)
    );

    const myBranchIds = new Set(submissions.map((s) => s.branchId));

    return (
      <div className="space-y-5 animate-fade-in">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 luxury-shadow">
          <div className="relative">
            <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input
              type="text"
              value={branchSearch}
              onChange={(e) => setBranchSearch(e.target.value)}
              placeholder="Search printing presses by name, area, city, or Branch Code..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:bg-white focus:border-blue-600 outline-none"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 text-xs text-slate-500">
            No registered printing presses match your search.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filtered.map((b) => (
              <div
                key={b.branchId}
                className="bg-white rounded-2xl p-6 border border-slate-200 luxury-shadow flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-extrabold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700">
                      {b.branchId}
                    </span>
                    {myBranchIds.has(b.branchId) && (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                        Used Previously
                      </span>
                    )}
                  </div>
                  <h4 className="text-lg font-extrabold text-slate-900 mt-2">{b.name}</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    <i className="fa-solid fa-location-dot mr-1 text-blue-600"></i> {b.area}, {b.city}
                  </p>
                  {b.phone && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      <i className="fa-solid fa-phone mr-1 text-slate-400"></i> {b.phone}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={b.quotaFull}
                  onClick={() => connectToBranch(b.branchId)}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500 text-white text-xs font-bold transition"
                >
                  {b.quotaFull ? 'Storage Quota Full' : 'Connect & Submit Files →'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ================= ROUTE: SENDER ACCOUNT SETTINGS =================
  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <div className="bg-white rounded-2xl p-6 border border-slate-200 luxury-shadow">
        <h3 className="font-extrabold text-base text-slate-900 mb-1">Sender Profile</h3>
        <p className="text-xs text-slate-500 mb-4">
          Your unique Sender ID is <strong className="font-mono text-blue-600">{sender.senderId}</strong>.
        </p>
        <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Name / Business Name</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">Phone Number</label>
            <input
              type="tel"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
            />
          </div>
          <button
            type="submit"
            disabled={savingProfile}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold"
          >
            {savingProfile ? 'Saving...' : 'Update Profile'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-slate-200 luxury-shadow">
        <h3 className="font-extrabold text-base text-slate-900 mb-1">Change 4-Digit Security PIN</h3>
        <p className="text-xs text-slate-500 mb-4">
          PINs are managed directly by Firebase Authentication and never stored in Firestore.
        </p>
        <form onSubmit={handleSavePin} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Current 4-Digit PIN</label>
              <input
                type="password"
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                maxLength={4}
                pattern="\d{4}"
                required
                placeholder="••••"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-center tracking-[0.4em]"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">New 4-Digit PIN</label>
              <input
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                maxLength={4}
                pattern="\d{4}"
                required
                placeholder="••••"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-center tracking-[0.4em]"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Confirm New PIN</label>
              <input
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                maxLength={4}
                pattern="\d{4}"
                required
                placeholder="••••"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-center tracking-[0.4em]"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={savingPin}
            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-bold"
          >
            {savingPin ? 'Updating PIN...' : 'Update Security PIN'}
          </button>
        </form>
      </div>
    </div>
  );
};
