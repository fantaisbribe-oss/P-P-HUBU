import React, { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, getFriendlyError, testConnection } from './firebase';
import {
  cleanupSenderAbandonedDrafts,
  deleteFileFromSubmission,
  ensureTodayDailyCode,
  fetchUserProfile,
  getFileDownloadUrl,
  logFilePrintAction,
  regenerateDailyCode,
  signOutUser,
  subscribeBranchActivities,
  subscribeBranchDailyCodes,
  subscribeBranchExpenses,
  subscribeBranchNotifications,
  subscribeBranchPrivate,
  subscribeBranchStaff,
  subscribeBranchSubmissions,
  subscribePublicBranches,
  subscribeSenderSubmissions
} from './services/pphubService';
import {
  type Activity,
  type BranchNotification,
  type BranchPrivate,
  type BranchPublic,
  type DailyCodeDoc,
  type Expense,
  type RouteId,
  type StaffUserProfile,
  type Submission,
  type SubmissionFile,
  type ToastItem,
  type UserProfile
} from './types';
import { getGhanaDateParts } from './utils/dates';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthPortal } from './components/AuthPortal';
import { SentFilesExplorer } from './components/SentFilesExplorer';
import { SubmissionModal } from './components/SubmissionModal';
import { FileLightbox } from './components/FileLightbox';
import { QrCodeModal } from './components/QrCodeModal';
import { SenderWorkspace } from './components/SenderWorkspace';
import { StaffViews } from './components/StaffViews';

interface NavEntry {
  section?: string;
  id?: RouteId;
  icon?: string;
  label?: string;
  badge?: string;
}

function WorkspaceApp() {
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeRoute, setActiveRoute] = useState<RouteId>('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Real-time Firestore state (zero hardcoded business data!)
  const [branch, setBranch] = useState<BranchPrivate | null>(null);
  const [dailyCodes, setDailyCodes] = useState<DailyCodeDoc[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [notifications, setNotifications] = useState<BranchNotification[]>([]);
  const [branchStaff, setBranchStaff] = useState<StaffUserProfile[]>([]);
  const [publicBranches, setPublicBranches] = useState<BranchPublic[]>([]);

  // Sent Files 4-level explorer state
  const todayParts = getGhanaDateParts();
  const [explorerLevel, setExplorerLevel] = useState<1 | 2 | 3>(1);
  const [explorerYear, setExplorerYear] = useState<number>(todayParts.year);
  const [explorerMonth, setExplorerMonth] = useState<number>(todayParts.month);
  const [explorerDay, setExplorerDay] = useState<number>(todayParts.day);

  // Modals
  const [modalSubmissionId, setModalSubmissionId] = useState<string | null>(null);
  const [lightboxState, setLightboxState] = useState<{ sub: Submission; file: SubmissionFile } | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  // Run startup Firestore connection test
  useEffect(() => {
    testConnection().then((ok) => {
      if (!ok) {
        showToast('Unable to reach Firebase servers. Check your internet connection.', 'error');
      }
    });
  }, [showToast]);

  // Persistent Firebase Auth session listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setProfile(null);
        setAuthReady(true);
        return;
      }
      try {
        const userDoc = await fetchUserProfile(fbUser.uid);
        if (!userDoc) {
          // Might still be mid-registration batch; wait briefly then re-check once
          setAuthReady(true);
          return;
        }
        if ((userDoc.role === 'manager' || userDoc.role === 'operator') && !userDoc.active) {
          await signOutUser();
          setProfile(null);
          showToast('Your staff account has been deactivated by the Branch Manager.', 'error');
          setAuthReady(true);
          return;
        }
        setProfile(userDoc);
        setActiveRoute(userDoc.role === 'sender' ? 'sender-submit' : 'dashboard');
      } catch (err) {
        showToast(getFriendlyError(err).message, 'error');
      } finally {
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, [showToast]);

  // Attach real-time Firestore onSnapshot listeners ONLY when authenticated
  useEffect(() => {
    if (!profile) {
      setBranch(null);
      setDailyCodes([]);
      setSubmissions([]);
      setExpenses([]);
      setActivities([]);
      setNotifications([]);
      setBranchStaff([]);
      setPublicBranches([]);
      return;
    }

    setLoadingData(true);
    const unsubs: Array<() => void> = [];
    const onErr = (err: unknown) => {
      const f = getFriendlyError(err);
      showToast(f.message, 'error');
    };

    if (profile.role === 'sender') {
      unsubs.push(
        subscribePublicBranches((data) => {
          setPublicBranches(data);
          setLoadingData(false);
        }, onErr)
      );
      unsubs.push(subscribeSenderSubmissions(profile.uid, setSubmissions, onErr));
      cleanupSenderAbandonedDrafts(profile.uid).catch(() => {});
    } else {
      const bId = profile.branchId;
      const canManageCodes = profile.role === 'manager' || profile.permissions.manageCodes;
      const canViewFinance = profile.role === 'manager' || profile.permissions.viewFinance;
      const canManageStaff = profile.role === 'manager' || profile.permissions.manageStaff;

      // Ensure today's daily code exists (only if staff has manageCodes)
      ensureTodayDailyCode(bId, profile.fullName, canManageCodes).catch(() => {});

      unsubs.push(
        subscribeBranchPrivate(
          bId,
          (b) => {
            setBranch(b);
            setLoadingData(false);
          },
          onErr
        )
      );
      unsubs.push(subscribeBranchDailyCodes(bId, setDailyCodes, onErr));
      unsubs.push(subscribeBranchSubmissions(bId, setSubmissions, onErr));
      unsubs.push(subscribeBranchActivities(bId, setActivities, onErr));
      unsubs.push(subscribeBranchNotifications(bId, setNotifications, onErr));

      if (canViewFinance) {
        unsubs.push(subscribeBranchExpenses(bId, setExpenses, onErr));
      } else {
        setExpenses([]);
      }

      if (canManageStaff) {
        unsubs.push(subscribeBranchStaff(bId, setBranchStaff, onErr));
      } else {
        setBranchStaff([]);
      }
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [profile, showToast]);

  const todayCode = dailyCodes.find((d) => d.date === todayParts.dateStr)?.code || '';
  const unreadCount = notifications.filter((n) => !n.read).length;
  const activeModalSubmission = modalSubmissionId
    ? submissions.find((s) => s.id === modalSubmissionId) || null
    : null;

  const handleAuthenticated = (newProfile: UserProfile) => {
    setProfile(newProfile);
    setActiveRoute(newProfile.role === 'sender' ? 'sender-submit' : 'dashboard');
  };

  const handleLogout = async () => {
    try {
      await signOutUser();
      setProfile(null);
      setModalSubmissionId(null);
      setLightboxState(null);
      setQrOpen(false);
      showToast('Logged out securely.', 'info');
    } catch (err) {
      showToast(getFriendlyError(err).message, 'error');
    }
  };

  const handleCopyDailyCode = async (specificCode?: string) => {
    const code = specificCode || todayCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      showToast(`Copied Daily Code "${code}" to clipboard!`, 'success');
    } catch {
      showToast(`Today's Daily Code: ${code}`, 'info');
    }
  };

  const handleRegenerateCode = async () => {
    if (!profile || profile.role === 'sender') return;
    try {
      const code = await regenerateDailyCode(profile.branchId, profile.fullName);
      showToast(`New Daily Submission Code generated: ${code}`, 'success');
    } catch (err) {
      showToast(getFriendlyError(err).message, 'error');
    }
  };

  const handleDownloadFile = async (file: SubmissionFile, preResolvedUrl?: string | null) => {
    if (!file.storagePath) {
      showToast('No Cloud Storage file attached to this sample record.', 'info');
      return;
    }
    try {
      const url = preResolvedUrl || (await getFileDownloadUrl(file.storagePath));
      const a = document.createElement('a');
      a.href = url;
      a.download = file.originalName;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast(`Downloading "${file.originalName}"...`, 'info');
    } catch (err) {
      showToast(getFriendlyError(err).message, 'error');
    }
  };

  const handlePrintFile = async (
    sub: Submission,
    file: SubmissionFile,
    preResolvedUrl?: string | null
  ) => {
    if (!file.storagePath) {
      showToast('No Cloud Storage file attached to print.', 'info');
      return;
    }
    try {
      const url = preResolvedUrl || (await getFileDownloadUrl(file.storagePath));
      if (profile && profile.role !== 'sender') {
        await logFilePrintAction(sub, file.originalName, profile);
      }

      // Print real file via hidden iframe without blocked window.open popups
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = url;
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          // Cross-origin fallback: trigger download so operator prints locally
          handleDownloadFile(file, url);
        }
        setTimeout(() => {
          iframe.remove();
        }, 60_000);
      };
      document.body.appendChild(iframe);
      showToast(`Print spooler triggered for "${file.originalName}"!`, 'success');
    } catch (err) {
      showToast(getFriendlyError(err).message, 'error');
    }
  };

  const handleDeleteFile = async (sub: Submission, fileId: string) => {
    if (!profile || profile.role === 'sender') return;
    try {
      await deleteFileFromSubmission(sub, fileId, profile);
      showToast('File removed from Cloud Storage and branch archive.', 'info');
    } catch (err) {
      showToast(getFriendlyError(err).message, 'error');
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen hero-gradient flex items-center justify-center p-6 text-white">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center mx-auto text-2xl luxury-glow">
            <i className="fa-solid fa-print"></i>
          </div>
          <p className="text-sm font-bold tracking-wide">Connecting to P&amp;P-HUB Cloud...</p>
        </div>
      </div>
    );
  }

  // Toast overlay
  const toastOverlay = (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => {
        const colors =
          t.type === 'success'
            ? 'bg-emerald-600 text-white border-emerald-500'
            : t.type === 'error'
            ? 'bg-red-600 text-white border-red-500'
            : 'bg-navy-900 text-white border-cyan-400/40';
        const icon =
          t.type === 'success'
            ? 'fa-circle-check'
            : t.type === 'error'
            ? 'fa-triangle-exclamation'
            : 'fa-circle-info';
        return (
          <div
            key={t.id}
            className={`pointer-events-auto px-4 py-3 rounded-2xl shadow-xl border text-xs font-bold flex items-center gap-3 animate-fade-in ${colors}`}
          >
            <i className={`fa-solid ${icon} text-base`}></i>
            <span className="flex-1 leading-snug">{t.message}</span>
          </div>
        );
      })}
    </div>
  );

  if (!profile) {
    return (
      <>
        {toastOverlay}
        <AuthPortal onAuthenticated={handleAuthenticated} showToast={showToast} />
      </>
    );
  }

  // Build role-based sidebar menu matching PP-HUB.html
  let navItems: NavEntry[] = [];
  if (profile.role === 'manager') {
    navItems = [
      { section: 'Operations & Files' },
      { id: 'dashboard', icon: 'fa-chart-pie', label: 'Dashboard Overview' },
      { id: 'sent-files', icon: 'fa-folder-tree', label: 'Sent Files Management', badge: 'P&P' },
      { id: 'daily-codes', icon: 'fa-key', label: 'Daily Submission Codes' },
      { id: 'printing-queue', icon: 'fa-print', label: 'Printing Activities & Queue' },
      { id: 'printing-history', icon: 'fa-clock-rotate-left', label: 'Printing History' },
      { section: 'People & Finance' },
      { id: 'money-management', icon: 'fa-coins', label: 'Money Management (GH₵)' },
      { id: 'expenses', icon: 'fa-receipt', label: 'Expenses & Profit' },
      { id: 'reports-analytics', icon: 'fa-chart-line', label: 'Reports & Analytics' },
      { id: 'sender-management', icon: 'fa-address-book', label: 'Sender Management' },
      { id: 'staff-management', icon: 'fa-users-gear', label: 'Staff & Permissions' },
      { section: 'Administration' },
      { id: 'storage-settings', icon: 'fa-hard-drive', label: 'Storage & Archives' },
      { id: 'notifications', icon: 'fa-bell', label: 'Notifications & Audit Log' },
      { id: 'branch-settings', icon: 'fa-sliders', label: 'Branch & Account Settings' }
    ];
  } else if (profile.role === 'operator') {
    const perms = profile.permissions;
    navItems = [
      { section: 'Operator Workspace' },
      { id: 'dashboard', icon: 'fa-gauge-high', label: 'Operator Dashboard' },
      ...(perms.viewFiles ? [{ id: 'sent-files' as RouteId, icon: 'fa-folder-tree', label: 'Sent Files Management', badge: 'P&P' }] : []),
      { id: 'printing-queue', icon: 'fa-print', label: 'Printing Queue' },
      { id: 'printing-history', icon: 'fa-clock-rotate-left', label: 'Printing History' },
      ...(perms.viewFinance
        ? [
            { id: 'money-management' as RouteId, icon: 'fa-coins', label: 'Money Management (GH₵)' },
            { id: 'expenses' as RouteId, icon: 'fa-receipt', label: 'Expenses & Profit' },
            { id: 'reports-analytics' as RouteId, icon: 'fa-chart-line', label: 'Reports & Analytics' }
          ]
        : []),
      ...(perms.manageCodes ? [{ id: 'daily-codes' as RouteId, icon: 'fa-key', label: 'Daily Submission Codes' }] : []),
      { id: 'notifications', icon: 'fa-bell', label: 'Activity & Notifications' },
      { id: 'account-settings', icon: 'fa-user-shield', label: 'Account Security' }
    ];
  } else {
    navItems = [
      { section: 'Customer Portal' },
      { id: 'sender-submit', icon: 'fa-cloud-arrow-up', label: 'Submit Files to Press' },
      { id: 'sender-history', icon: 'fa-list-check', label: 'My Submissions & Status' },
      { id: 'sender-branches', icon: 'fa-building', label: 'Find Printing Presses' },
      { id: 'account-settings', icon: 'fa-user-shield', label: 'Account & PIN Security' }
    ];
  }

  const displayName = profile.role === 'sender' ? profile.name : profile.fullName;
  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const branchLabel = branch ? `${branch.name} • ${branch.area}, ${branch.city}` : profile.role === 'sender' ? `${profile.name} (${profile.senderId})` : profile.branchId;

  const titles: Record<RouteId, [string, string]> = {
    dashboard: ['Dashboard Overview', branchLabel],
    'sent-files': ['SENT FILES MANAGEMENT', `Exact P&P-HUB Monthly & Daily Visual Archive • ${branch?.name || ''}`],
    'daily-codes': ['Daily Submission Code System', `Shared daily security code for ${branch?.name || ''}`],
    'printing-queue': ['Printing Operations & Active Queue', 'Update job statuses, print specs, copies & customer billing'],
    'printing-history': ['Completed Printing History', 'Historical log of printed and collected jobs'],
    'money-management': ['Financial & Money Management (GH₵)', 'Track job income, payments received & outstanding balances'],
    expenses: ['Expenses & Profit Overview', 'Record operational expenses and calculate net branch profit'],
    'reports-analytics': ['Reports & Business Analytics', 'Service breakdown, staff performance & revenue trends'],
    'sender-management': ['Branch Sender Directory', 'Customers who have submitted documents to this branch'],
    'staff-management': ['Staff & Operator Permissions', 'Create operators, toggle active status & control access rights'],
    'storage-settings': ['Cloud Storage & Retention Settings', 'Real branch storage usage & archive policies'],
    notifications: ['Notifications & Audit Activity Log', 'Real-time branch alerts and immutable user action trail'],
    'branch-settings': ['Branch & Security Settings', 'Manage printing press identity, Branch Code & password'],
    'sender-submit': ['Submit Documents to Printing Press', `Logged in as ${displayName} (${profile.role === 'sender' ? profile.senderId : ''})`],
    'sender-history': ['My Submission History & Status', 'Track your uploaded files across printing presses'],
    'sender-branches': ['Registered Printing Presses', 'Search presses by name or city and connect directly'],
    'account-settings': ['Account & Security Settings', 'Manage profile and update your password / PIN']
  };

  const [topTitle, topSub] = titles[activeRoute] || ['P&P-HUB Workspace', ''];

  const navigateTo = (route: RouteId) => {
    setActiveRoute(route);
    setMobileSidebarOpen(false);
  };

  return (
    <>
      {toastOverlay}
      <div className="min-h-screen flex bg-slate-50">
        {mobileSidebarOpen && (
          <div
            onClick={() => setMobileSidebarOpen(false)}
            className="fixed inset-0 bg-navy-950/70 backdrop-blur-sm z-30 lg:hidden"
          ></div>
        )}

        {/* DARK NAVY CHARIS SIDEBAR */}
        <aside
          className={`fixed lg:static inset-y-0 left-0 w-72 bg-navy-900 text-white flex flex-col z-40 transform transition-transform duration-300 border-r border-white/10 shrink-0 ${
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-400 flex items-center justify-center font-extrabold text-lg text-white shadow-lg shadow-blue-600/30">
                <i className="fa-solid fa-print"></i>
              </div>
              <div>
                <h1 className="font-extrabold text-base tracking-wide leading-tight">P&amp;P-HUB</h1>
                <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">
                  {profile.role === 'sender' ? profile.senderId : profile.branchId}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              className="lg:hidden text-slate-400 hover:text-white p-1"
            >
              <i className="fa-solid fa-xmark text-lg"></i>
            </button>
          </div>

          <div className="m-4 p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center font-extrabold text-sm text-white shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white truncate">{displayName}</p>
              <p className="text-[11px] text-cyan-300 font-semibold truncate">
                {profile.role === 'manager'
                  ? 'Branch Manager'
                  : profile.role === 'operator'
                  ? 'Printing Operator'
                  : 'Customer / Sender'}
              </p>
            </div>
          </div>

          <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
            {navItems.map((item, idx) => {
              if (item.section) {
                return (
                  <div
                    key={`sec-${idx}`}
                    className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500 px-3 pt-4 pb-1.5"
                  >
                    {item.section}
                  </div>
                );
              }
              const isActive = activeRoute === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => item.id && navigateTo(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/30'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-3 truncate">
                    <i
                      className={`fa-solid ${item.icon} w-4 text-center ${
                        isActive ? 'text-cyan-300' : 'text-slate-400'
                      }`}
                    ></i>
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge && (
                    <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-cyan-400/20 text-cyan-300 border border-cyan-400/30">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-white/10 text-[11px] text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Live Sync
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="text-red-400 hover:text-red-300 font-bold flex items-center gap-1"
            >
              <i className="fa-solid fa-right-from-bracket"></i> Logout
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="bg-white border-b border-slate-200 px-4 sm:px-8 py-4 flex items-center justify-between gap-4 sticky top-0 z-20">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="lg:hidden w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700"
              >
                <i className="fa-solid fa-bars"></i>
              </button>
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 truncate">{topTitle}</h2>
                <p className="text-xs text-slate-500 truncate">{topSub}</p>
              </div>
            </div>

            {profile.role !== 'sender' && (
              <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
                <div className="hidden sm:flex items-center gap-2.5 bg-blue-50 border border-blue-200 px-3.5 py-2 rounded-xl">
                  <div>
                    <span className="block text-[9px] font-extrabold uppercase tracking-wider text-blue-600">
                      Today&apos;s Submission Code
                    </span>
                    <span className="font-mono font-extrabold text-sm text-slate-900">
                      {todayCode || '— — —'}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={!todayCode}
                    onClick={() => handleCopyDailyCode()}
                    title="Copy Daily Code"
                    className="w-8 h-8 rounded-lg bg-white border border-blue-200 text-blue-600 hover:bg-blue-600 hover:text-white disabled:opacity-40 transition flex items-center justify-center"
                  >
                    <i className="fa-regular fa-copy text-xs"></i>
                  </button>
                  <button
                    type="button"
                    disabled={!todayCode}
                    onClick={() => setQrOpen(true)}
                    title="Display QR Code"
                    className="w-8 h-8 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition flex items-center justify-center"
                  >
                    <i className="fa-solid fa-qrcode text-xs"></i>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => navigateTo('notifications')}
                  className="relative w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center justify-center text-slate-700 transition"
                >
                  <i className="fa-regular fa-bell"></i>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-extrabold flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
              </div>
            )}
          </header>

          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
            {profile.role === 'sender' ? (
              <SenderWorkspace
                route={activeRoute}
                sender={profile}
                branches={publicBranches}
                submissions={submissions}
                loadingData={loadingData}
                onNavigate={navigateTo}
                onOpenLightbox={(sub, file) => setLightboxState({ sub, file })}
                onProfileUpdated={(name, phone) =>
                  setProfile((prev) => (prev && prev.role === 'sender' ? { ...prev, name, phone } : prev))
                }
                showToast={showToast}
              />
            ) : activeRoute === 'sent-files' ? (
              <SentFilesExplorer
                branch={branch}
                staff={profile}
                submissions={submissions}
                dailyCodes={dailyCodes}
                level={explorerLevel}
                selectedYear={explorerYear}
                selectedMonth={explorerMonth}
                selectedDay={explorerDay}
                onChangeExplorer={(next) => {
                  if (next.level !== undefined) setExplorerLevel(next.level);
                  if (next.year !== undefined) setExplorerYear(next.year);
                  if (next.month !== undefined) setExplorerMonth(next.month);
                  if (next.day !== undefined) setExplorerDay(next.day);
                }}
                onOpenSubmissionModal={(sub) => setModalSubmissionId(sub.id)}
                onOpenFileLightbox={(sub, file) => setLightboxState({ sub, file })}
                onDownloadFile={(file) => handleDownloadFile(file)}
                onPrintFile={(sub, file) => handlePrintFile(sub, file)}
                onDeleteFile={handleDeleteFile}
              />
            ) : (
              <StaffViews
                route={activeRoute}
                staff={profile}
                branch={branch}
                dailyCodes={dailyCodes}
                submissions={submissions}
                expenses={expenses}
                activities={activities}
                notifications={notifications}
                branchStaff={branchStaff}
                todayCode={todayCode}
                loadingData={loadingData}
                onNavigate={navigateTo}
                onOpenDirectDayFolder={(yr, m, d) => {
                  setExplorerYear(yr);
                  setExplorerMonth(m);
                  setExplorerDay(d);
                  setExplorerLevel(3);
                  navigateTo('sent-files');
                }}
                onOpenMonthlyCovers={() => {
                  setExplorerLevel(1);
                  navigateTo('sent-files');
                }}
                onOpenSubmissionModal={(sub) => setModalSubmissionId(sub.id)}
                onCopyDailyCode={handleCopyDailyCode}
                onOpenQrModal={() => setQrOpen(true)}
                onRegenerateDailyCode={handleRegenerateCode}
                showToast={showToast}
              />
            )}
          </main>
        </div>
      </div>

      {/* MODALS */}
      {profile.role !== 'sender' && (
        <>
          <SubmissionModal
            submission={activeModalSubmission}
            staff={profile}
            onClose={() => setModalSubmissionId(null)}
            onPreviewFile={(sub, file) => setLightboxState({ sub, file })}
            onPrintFile={(sub, file) => handlePrintFile(sub, file)}
            showToast={showToast}
          />
          <QrCodeModal
            open={qrOpen}
            branchName={branch?.name || profile.branchId}
            branchId={profile.branchId}
            code={todayCode}
            onCopy={() => handleCopyDailyCode()}
            onClose={() => setQrOpen(false)}
          />
        </>
      )}

      <FileLightbox
        submission={lightboxState?.sub || null}
        file={lightboxState?.file || null}
        onClose={() => setLightboxState(null)}
        onPrintFile={(sub, file, url) => handlePrintFile(sub, file, url)}
        onDownloadFile={(file, url) => handleDownloadFile(file, url)}
      />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <WorkspaceApp />
    </ErrorBoundary>
  );
}
