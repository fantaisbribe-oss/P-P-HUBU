import React, { useEffect, useState } from 'react';
import {
  MONTHS_DATA,
  type Activity,
  type BranchNotification,
  type BranchPrivate,
  type DailyCodeDoc,
  type Expense,
  type RouteId,
  type StaffPermissions,
  type StaffUserProfile,
  type Submission
} from '../types';
import {
  formatFileSize,
  formatGhanaLongDate,
  formatTimestampRelative,
  getGhanaDateParts,
  getStatusBadgeClasses
} from '../utils/dates';
import {
  addBranchExpense,
  changeCurrentUserPassword,
  createOperatorAccount,
  deleteBranchExpense,
  markNotificationRead,
  removeStaff,
  toggleStaffActive,
  toggleStaffPerm,
  updateBranchProfile
} from '../services/pphubService';
import { getFriendlyError } from '../firebase';

interface StaffViewsProps {
  route: RouteId;
  staff: StaffUserProfile;
  branch: BranchPrivate | null;
  dailyCodes: DailyCodeDoc[];
  submissions: Submission[];
  expenses: Expense[];
  activities: Activity[];
  notifications: BranchNotification[];
  branchStaff: StaffUserProfile[];
  todayCode: string;
  loadingData: boolean;
  onNavigate: (route: RouteId) => void;
  onOpenDirectDayFolder: (year: number, month: number, day: number) => void;
  onOpenMonthlyCovers: () => void;
  onOpenSubmissionModal: (sub: Submission) => void;
  onCopyDailyCode: (code?: string) => void;
  onOpenQrModal: () => void;
  onRegenerateDailyCode: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const StaffViews: React.FC<StaffViewsProps> = ({
  route,
  staff,
  branch,
  dailyCodes,
  submissions,
  expenses,
  activities,
  notifications,
  branchStaff,
  todayCode,
  loadingData,
  onNavigate,
  onOpenDirectDayFolder,
  onOpenMonthlyCovers,
  onOpenSubmissionModal,
  onCopyDailyCode,
  onOpenQrModal,
  onRegenerateDailyCode,
  showToast
}) => {
  const { year: todayYear, month: todayMonth, day: todayDay, dateStr: todayStr } = getGhanaDateParts();
  const canSeeFinance = staff.role === 'manager' || staff.permissions.viewFinance;
  const canManageCodes = staff.role === 'manager' || staff.permissions.manageCodes;
  const canManageStaff = staff.role === 'manager' || staff.permissions.manageStaff;

  // Expenses form state
  const [expCat, setExpCat] = useState('Paper Stock & Card');
  const [expDesc, setExpDesc] = useState('');
  const [expAmt, setExpAmt] = useState('');
  const [savingExp, setSavingExp] = useState(false);

  // Date range filter for Reports / Money Management
  const [rangeStart, setRangeStart] = useState(`${todayYear}-${String(todayMonth + 1).padStart(2, '0')}-01`);
  const [rangeEnd, setRangeEnd] = useState(todayStr);

  // New Operator form state
  const [newOpName, setNewOpName] = useState('');
  const [newOpUser, setNewOpUser] = useState('');
  const [newOpPass, setNewOpPass] = useState('');
  const [newOpFin, setNewOpFin] = useState(false);
  const [creatingOp, setCreatingOp] = useState(false);

  // Branch Settings form state
  const [branchName, setBranchName] = useState(branch?.name || '');
  const [branchArea, setBranchArea] = useState(branch?.area || '');
  const [branchCity, setBranchCity] = useState(branch?.city || '');
  const [branchPhone, setBranchPhone] = useState(branch?.phone || '');
  const [retentionDays, setRetentionDays] = useState(branch?.retentionDays || 365);
  const [savingBranch, setSavingBranch] = useState(false);

  // Password Change state (Settings > Account)
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [savingPass, setSavingPass] = useState(false);

  useEffect(() => {
    if (branch) {
      setBranchName(branch.name);
      setBranchArea(branch.area);
      setBranchCity(branch.city);
      setBranchPhone(branch.phone);
      setRetentionDays(branch.retentionDays);
    }
  }, [branch]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(expAmt);
    if (!expDesc.trim() || !Number.isFinite(amt) || amt <= 0) {
      showToast('Enter a valid expense description and positive GH₵ amount.', 'error');
      return;
    }
    setSavingExp(true);
    try {
      await addBranchExpense({
        branchId: staff.branchId,
        category: expCat,
        description: expDesc,
        amount: amt,
        recordedBy: staff.fullName
      });
      setExpDesc('');
      setExpAmt('');
      showToast('Expense recorded successfully.', 'success');
    } catch (err) {
      showToast(getFriendlyError(err).message, 'error');
    } finally {
      setSavingExp(false);
    }
  };

  const handleCreateOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingOp(true);
    try {
      await createOperatorAccount({
        branchId: staff.branchId,
        managerName: staff.fullName,
        fullName: newOpName,
        username: newOpUser,
        password: newOpPass,
        viewFinance: newOpFin
      });
      setNewOpName('');
      setNewOpUser('');
      setNewOpPass('');
      setNewOpFin(false);
      showToast(`Operator "${newOpName}" provisioned for ${staff.branchId}!`, 'success');
    } catch (err) {
      showToast(getFriendlyError(err).message, 'error');
    } finally {
      setCreatingOp(false);
    }
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branch) return;
    setSavingBranch(true);
    try {
      await updateBranchProfile({
        branchId: branch.branchId,
        name: branchName,
        area: branchArea,
        city: branchCity,
        phone: branchPhone,
        retentionDays,
        storageQuotaMB: branch.storageQuotaMB,
        storageUsedBytes: branch.storageUsedBytes
      });
      showToast('Branch profile and settings updated.', 'success');
    } catch (err) {
      showToast(getFriendlyError(err).message, 'error');
    } finally {
      setSavingBranch(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass !== confirmPass) {
      showToast('New password and confirmation do not match.', 'error');
      return;
    }
    setSavingPass(true);
    try {
      await changeCurrentUserPassword(curPass, newPass, staff.role);
      setCurPass('');
      setNewPass('');
      setConfirmPass('');
      showToast('Password updated successfully!', 'success');
    } catch (err) {
      showToast(getFriendlyError(err).message, 'error');
    } finally {
      setSavingPass(false);
    }
  };

  if (loadingData && !branch) {
    return (
      <div className="bg-white rounded-3xl p-14 text-center border border-slate-200 luxury-shadow">
        <i className="fa-solid fa-circle-notch fa-spin text-3xl text-blue-600 mb-3 block"></i>
        <p className="text-sm font-bold text-slate-700">Synchronizing branch workspace...</p>
      </div>
    );
  }

  // ===========================================================================
  // 1. DASHBOARD OVERVIEW
  // ===========================================================================
  if (route === 'dashboard') {
    const todaySubs = submissions.filter((s) => s.date === todayStr);
    const pendingJobs = submissions.filter((s) => !['Printed', 'Ready for Collection', 'Collected'].includes(s.status));
    const completedJobs = submissions.filter((s) => ['Printed', 'Ready for Collection', 'Collected'].includes(s.status));
    const activeStaffCount = branchStaff.filter((s) => s.active).length;

    const todayIncome = todaySubs.reduce((sum, s) => sum + (Number(s.billing?.amountPaid) || 0), 0);
    const monthlyIncome = submissions
      .filter((s) => s.year === todayYear && s.month === todayMonth)
      .reduce((sum, s) => sum + (Number(s.billing?.amountPaid) || 0), 0);
    const outstandingBalance = submissions.reduce(
      (sum, s) => sum + Math.max(0, (Number(s.billing?.totalAmount) || 0) - (Number(s.billing?.amountPaid) || 0)),
      0
    );

    // Build real last-6-months bar chart data
    const last6Months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(Date.UTC(todayYear, todayMonth - 5 + i, 1));
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth();
      const val = submissions
        .filter((s) => s.year === y && s.month === m)
        .reduce((sum, s) => sum + (Number(s.billing?.amountPaid) || 0), 0);
      return {
        label: MONTHS_DATA[m].name.slice(0, 3),
        val,
        active: y === todayYear && m === todayMonth
      };
    });
    const maxMonthVal = Math.max(1, ...last6Months.map((b) => b.val));

    // Real service breakdown
    const svcMap = new Map<string, number>();
    submissions.forEach((s) => {
      const sv = s.billing.serviceType || 'Other Printing Service';
      svcMap.set(sv, (svcMap.get(sv) || 0) + 1);
    });
    const svcEntries = Array.from(svcMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    const svcColors = ['bg-blue-600', 'bg-cyan-500', 'bg-indigo-600', 'bg-emerald-500'];

    return (
      <div className="space-y-6 animate-fade-in">
        {/* Top Hero Daily Code & Quick Folder Access Banner */}
        <div className="rounded-3xl hero-gradient text-white p-6 sm:p-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 luxury-shadow relative overflow-hidden">
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-400/15 border border-cyan-400/30 text-cyan-300 text-xs font-bold mb-3">
              <i className="fa-solid fa-building-shield"></i> Branch Code:{' '}
              <span className="font-mono">{staff.branchId}</span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Welcome back, {staff.fullName}</h3>
            <p className="text-slate-300 text-xs sm:text-sm mt-1.5 leading-relaxed">
              All customer uploads for <strong className="text-white">{formatGhanaLongDate()}</strong> are
              automatically routed into{' '}
              <strong className="text-cyan-300">
                {MONTHS_DATA[todayMonth].name} → Day {todayDay}
              </strong>{' '}
              using your branch&apos;s active daily submission code.
            </p>
            <div className="flex flex-wrap gap-3 mt-5">
              {(staff.role === 'manager' || staff.permissions.viewFiles) && (
                <>
                  <button
                    type="button"
                    onClick={() => onOpenDirectDayFolder(todayYear, todayMonth, todayDay)}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition flex items-center gap-2"
                  >
                    <i className="fa-solid fa-images"></i> Open Today&apos;s Gallery ({MONTHS_DATA[todayMonth].name.slice(0, 3)}{' '}
                    Day {todayDay})
                  </button>
                  <button
                    type="button"
                    onClick={onOpenMonthlyCovers}
                    className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/15 transition flex items-center gap-2"
                  >
                    <i className="fa-solid fa-folder-open"></i> Browse 12 Monthly Covers
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Daily Code Highlight Card */}
          <div className="relative z-10 w-full lg:w-auto bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-5 min-w-[280px]">
            <div className="flex items-center justify-between text-xs text-cyan-300 font-bold mb-1">
              <span>SHARED DAILY CODE</span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">
                {todayCode ? 'ACTIVE TODAY' : 'NOT GENERATED'}
              </span>
            </div>
            <div className="font-mono text-3xl font-extrabold tracking-widest text-white my-2">
              {todayCode || '— — —'}
            </div>
            <p className="text-[11px] text-slate-300 mb-3">Share with all walk-in &amp; remote senders today.</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!todayCode}
                onClick={() => onCopyDailyCode()}
                className="flex-1 py-2 rounded-xl bg-white text-navy-950 font-bold text-xs hover:bg-cyan-50 disabled:opacity-40 transition"
              >
                <i className="fa-regular fa-copy mr-1"></i> Copy
              </button>
              <button
                type="button"
                disabled={!todayCode}
                onClick={onOpenQrModal}
                className="flex-1 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-500 disabled:opacity-40 transition"
              >
                <i className="fa-solid fa-qrcode mr-1"></i> QR Code
              </button>
              {canManageCodes && (
                <button
                  type="button"
                  onClick={onRegenerateDailyCode}
                  title="Regenerate Code"
                  className="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition"
                >
                  <i className="fa-solid fa-rotate"></i>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* KPI Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 luxury-shadow relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-600 to-cyan-400"></div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                Total / Today Submissions
              </span>
              <span className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <i className="fa-solid fa-file-arrow-up"></i>
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold font-mono text-slate-900">{submissions.length}</span>
              <span className="text-xs font-bold text-emerald-600">+{todaySubs.length} today</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {submissions.reduce((a, s) => a + s.files.length, 0)} total cloud files stored
            </p>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200 luxury-shadow relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-500 to-orange-400"></div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                Pending / Completed Jobs
              </span>
              <span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <i className="fa-solid fa-print"></i>
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold font-mono text-slate-900">{pendingJobs.length}</span>
              <span className="text-xs font-bold text-slate-500">pending</span>
              <span className="text-xs font-bold text-emerald-600 ml-auto">{completedJobs.length} completed</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {canManageStaff ? `${activeStaffCount} active branch staff` : `Operator: ${staff.fullName}`}
            </p>
          </div>

          {canSeeFinance ? (
            <>
              <div className="bg-white rounded-2xl p-5 border border-slate-200 luxury-shadow relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-400"></div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    Today&apos;s Income (GH₵)
                  </span>
                  <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <i className="fa-solid fa-cedi-sign"></i>
                  </span>
                </div>
                <div className="mt-3 text-2xl font-extrabold font-mono text-slate-900">
                  GH₵ {todayIncome.toFixed(2)}
                </div>
                <p className="text-xs text-emerald-600 font-semibold mt-1">
                  {MONTHS_DATA[todayMonth].name.slice(0, 3)} Total: GH₵ {monthlyIncome.toFixed(2)}
                </p>
              </div>

              <div className="bg-white rounded-2xl p-5 border border-slate-200 luxury-shadow relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-rose-500 to-pink-500"></div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    Outstanding Balances
                  </span>
                  <span className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                    <i className="fa-solid fa-hand-holding-dollar"></i>
                  </span>
                </div>
                <div className="mt-3 text-2xl font-extrabold font-mono text-rose-600">
                  GH₵ {outstandingBalance.toFixed(2)}
                </div>
                <p className="text-xs text-slate-500 mt-1">Unpaid balances on active jobs</p>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-2xl p-5 border border-slate-200 luxury-shadow sm:col-span-2 flex items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-600">
                  Operator Quick Access
                </span>
                <h4 className="text-base font-extrabold text-slate-900 mt-1">Ready for Production</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Click any submission below to preview files, update print status, or record job specs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('printing-queue')}
                className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold shrink-0"
              >
                Open Print Queue
              </button>
            </div>
          )}
        </div>

        {/* Charts Row */}
        {canSeeFinance && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 luxury-shadow">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="font-extrabold text-sm text-slate-900">Monthly Income Overview (GH₵)</h4>
                  <p className="text-xs text-slate-500">Real confirmed customer payments across the last 6 months</p>
                </div>
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
                  {todayYear} Live
                </span>
              </div>
              <div className="h-44 flex items-end justify-between gap-3 pt-6 px-2 border-b border-slate-100">
                {last6Months.map((bar) => {
                  const pct = bar.val > 0 ? Math.max(12, Math.round((bar.val / maxMonthVal) * 100)) : 6;
                  return (
                    <div key={bar.label} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                      <span className="text-[10px] font-mono font-bold text-slate-600">₵{Math.round(bar.val)}</span>
                      <div
                        className={`w-full max-w-[42px] rounded-t-xl transition-all ${
                          bar.active
                            ? 'bg-gradient-to-t from-blue-600 to-cyan-400 shadow-md shadow-blue-500/25'
                            : 'bg-slate-200 hover:bg-blue-300'
                        }`}
                        style={{ height: `${pct}%` }}
                      ></div>
                      <span className={`text-xs font-bold ${bar.active ? 'text-blue-600' : 'text-slate-500'}`}>
                        {bar.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-200 luxury-shadow">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="font-extrabold text-sm text-slate-900">Printing Service Performance</h4>
                  <p className="text-xs text-slate-500">Live distribution of printing press job categories</p>
                </div>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">
                  {submissions.length} Jobs
                </span>
              </div>
              {svcEntries.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Service distribution will appear automatically as customer jobs arrive.
                </div>
              ) : (
                <div className="space-y-3.5 mt-2">
                  {svcEntries.map(([label, count], idx) => {
                    const pct = Math.round((count / Math.max(1, submissions.length)) * 100);
                    return (
                      <div key={label}>
                        <div className="flex justify-between text-xs font-bold mb-1">
                          <span className="text-slate-700">{label}</span>
                          <span className="font-mono text-slate-900">
                            {pct}% ({count})
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`${svcColors[idx % svcColors.length]} h-full rounded-full`}
                            style={{ width: `${pct}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recent Submissions & Live Activity Feed */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 luxury-shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h4 className="font-extrabold text-sm text-slate-900">
                <i className="fa-solid fa-clock text-blue-600 mr-2"></i>Recent Branch Submissions
              </h4>
              <button
                type="button"
                onClick={() => onNavigate('printing-queue')}
                className="text-xs font-bold text-blue-600 hover:underline"
              >
                View All Jobs →
              </button>
            </div>
            {submissions.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-400">
                No customer submissions yet. Share today&apos;s Daily Submission Code (
                <strong className="font-mono text-blue-600">{todayCode || '—'}</strong>) with customers to receive files in real time.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4">Submission</th>
                      <th className="py-3 px-4">Sender</th>
                      <th className="py-3 px-4">Folder</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {submissions.slice(0, 6).map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{s.customName}</div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {s.id} • {s.files.length} file(s)
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-700">{s.senderName}</td>
                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() => onOpenDirectDayFolder(s.year, s.month, s.day)}
                            className="text-blue-600 font-bold hover:underline"
                          >
                            {MONTHS_DATA[s.month]?.name.slice(0, 3)} Day {s.day}
                          </button>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${getStatusBadgeClasses(
                              s.status
                            )}`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                            {s.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => onOpenSubmissionModal(s)}
                            className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white font-bold transition"
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Live Activity Feed */}
          <div className="bg-white rounded-2xl border border-slate-200 luxury-shadow p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-extrabold text-sm text-slate-900">
                <i className="fa-solid fa-bolt text-cyan-500 mr-1.5"></i>Live Activity Feed
              </h4>
              <button
                type="button"
                onClick={() => onNavigate('notifications')}
                className="text-[11px] font-bold text-blue-600 hover:underline"
              >
                Full Log
              </button>
            </div>
            {activities.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">No activity recorded yet.</p>
            ) : (
              <div className="space-y-3.5">
                {activities.slice(0, 6).map((act) => (
                  <div
                    key={act.id}
                    className="flex items-start gap-3 text-xs border-b border-slate-100 pb-3 last:border-0 last:pb-0"
                  >
                    <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                      <i className="fa-solid fa-check text-[11px]"></i>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-800 truncate">{act.user}</p>
                      <p className="text-slate-600 leading-snug mt-0.5">{act.action}</p>
                      <span className="text-[10px] font-mono text-slate-400 mt-1 block">
                        {act.date} • {act.time}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 2. DAILY SUBMISSION CODES
  // ===========================================================================
  if (route === 'daily-codes') {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 luxury-shadow flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="max-w-xl">
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-blue-600">
              SHARED DAILY SECURITY TOKEN
            </span>
            <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{branch?.name} — Active Code</h3>
            <p className="text-xs sm:text-sm text-slate-500 mt-2 leading-relaxed">
              All customers submitting files to <strong>{branch?.name}</strong> on{' '}
              <strong>{formatGhanaLongDate()}</strong> share this single daily code. Firestore Security Rules
              automatically reject yesterday&apos;s code at 00:00 GMT without affecting historical files.
            </p>
            <div className="flex flex-wrap gap-3 mt-5">
              <button
                type="button"
                disabled={!todayCode}
                onClick={() => onCopyDailyCode()}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold shadow-lg shadow-blue-600/20 transition"
              >
                <i className="fa-regular fa-copy mr-1.5"></i> Copy Code
              </button>
              <button
                type="button"
                disabled={!todayCode}
                onClick={onOpenQrModal}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold transition"
              >
                <i className="fa-solid fa-qrcode mr-1.5"></i> Display QR Code
              </button>
              {canManageCodes && (
                <button
                  type="button"
                  onClick={onRegenerateDailyCode}
                  className="px-5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition"
                >
                  <i className="fa-solid fa-rotate mr-1.5"></i> Regenerate Code
                </button>
              )}
            </div>
          </div>

          <div className="w-full lg:w-auto bg-navy-900 text-white rounded-3xl p-6 text-center min-w-[280px] border border-cyan-400/30 luxury-glow">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-cyan-400">
              {todayStr} (GMT)
            </span>
            <div className="font-mono text-4xl font-extrabold tracking-widest my-3 text-white">
              {todayCode || '— — —'}
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 pulse-indicator"></span> Valid for New Uploads
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 luxury-shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h4 className="font-extrabold text-sm text-slate-900">Historical Daily Codes Archive</h4>
          </div>
          {dailyCodes.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">No daily codes recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white uppercase text-[10px] tracking-wider">
                    <th className="py-3.5 px-5">Calendar Date</th>
                    <th className="py-3.5 px-5">Daily Submission Code</th>
                    <th className="py-3.5 px-5">Generated By</th>
                    <th className="py-3.5 px-5">Status</th>
                    <th className="py-3.5 px-5">Submissions Linked</th>
                    <th className="py-3.5 px-5 text-right">Archive Folder</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dailyCodes.map((dc) => {
                    const isToday = dc.date === todayStr;
                    const linkedCount = submissions.filter((s) => s.date === dc.date).length;
                    const parts = dc.date.split('-').map((n) => parseInt(n, 10));
                    return (
                      <tr key={dc.date} className="hover:bg-slate-50">
                        <td className="py-3.5 px-5 font-bold text-slate-900">{dc.date}</td>
                        <td className="py-3.5 px-5 font-mono font-extrabold text-blue-600">{dc.code}</td>
                        <td className="py-3.5 px-5 text-slate-600">{dc.createdBy}</td>
                        <td className="py-3.5 px-5">
                          {isToday ? (
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[11px]">
                              Active Today
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold text-[11px]">
                              Expired (Files Preserved)
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-5 font-semibold text-slate-700">{linkedCount} submission(s)</td>
                        <td className="py-3.5 px-5 text-right">
                          <button
                            type="button"
                            onClick={() => onOpenDirectDayFolder(parts[0], parts[1] - 1, parts[2])}
                            className="text-blue-600 font-bold hover:underline"
                          >
                            Open Day {parts[2]} Folder →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 3. PRINTING QUEUE & PRINTING HISTORY
  // ===========================================================================
  if (route === 'printing-queue' || route === 'printing-history') {
    const completedOnly = route === 'printing-history';
    const list = submissions.filter((s) => {
      const isDone = ['Printed', 'Ready for Collection', 'Collected'].includes(s.status);
      return completedOnly ? isDone : true;
    });

    return (
      <div className="bg-white rounded-2xl border border-slate-200 luxury-shadow overflow-hidden animate-fade-in">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-extrabold text-base text-slate-900">
              {completedOnly ? 'Completed Printing History' : 'All Printing Jobs & Operations Queue'}
            </h3>
            <p className="text-xs text-slate-500">
              Click &quot;Manage Job&quot; to update status (7 stages), print copies, or record GH₵ payments.
            </p>
          </div>
          <span className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 text-xs font-extrabold">
            {list.length} Record(s)
          </span>
        </div>

        {list.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            {completedOnly ? 'No completed printing jobs yet.' : 'No submissions in the queue yet.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white uppercase text-[10px] tracking-wider">
                  <th className="py-3.5 px-4">Job ID &amp; Custom Name</th>
                  <th className="py-3.5 px-4">Sender</th>
                  <th className="py-3.5 px-4">Service &amp; Specs</th>
                  <th className="py-3.5 px-4">Amount / Paid (GH₵)</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((s) => {
                  const bal = Math.max(0, s.billing.totalAmount - s.billing.amountPaid);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-slate-900">{s.customName}</div>
                        <div className="font-mono text-[10px] text-slate-400">
                          {s.id} • {s.date}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-700">{s.senderName}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{s.billing.serviceType}</div>
                        <div className="text-[11px] text-slate-500">
                          {s.billing.copies} copies × {s.billing.pages} pgs
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <div className="font-bold text-slate-900">Total: ₵{s.billing.totalAmount.toFixed(2)}</div>
                        <div className={`text-[11px] ${bal > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600'}`}>
                          {bal > 0 ? `Bal: ₵${bal.toFixed(2)}` : 'Paid in Full'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${getStatusBadgeClasses(
                            s.status
                          )}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                          {s.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenDirectDayFolder(s.year, s.month, s.day)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                            title="Open Gallery"
                          >
                            <i className="fa-solid fa-images"></i>
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenSubmissionModal(s)}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold"
                          >
                            Manage Job
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ===========================================================================
  // 4. MONEY MANAGEMENT, EXPENSES & REPORTS (STRICT viewFinance GATE)
  // ===========================================================================
  if (route === 'money-management' || route === 'expenses' || route === 'reports-analytics') {
    if (!canSeeFinance) {
      return (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 luxury-shadow max-w-lg mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto text-2xl mb-3">
            <i className="fa-solid fa-lock"></i>
          </div>
          <h3 className="text-lg font-extrabold text-slate-900">Financial Access Restricted</h3>
          <p className="text-xs text-slate-500 mt-1.5">
            Your operator account does not have the <strong>viewFinance</strong> permission enabled. Ask your Branch
            Manager to grant financial access if needed.
          </p>
        </div>
      );
    }

    const rangedSubs = submissions.filter((s) => (!rangeStart || s.date >= rangeStart) && (!rangeEnd || s.date <= rangeEnd));
    const rangedExps = expenses.filter((e) => (!rangeStart || e.date >= rangeStart) && (!rangeEnd || e.date <= rangeEnd));

    if (route === 'money-management') {
      const totalBilled = rangedSubs.reduce((a, s) => a + s.billing.totalAmount, 0);
      const totalCollected = rangedSubs.reduce((a, s) => a + s.billing.amountPaid, 0);
      const totalOutstanding = Math.max(0, totalBilled - totalCollected);

      return (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white rounded-2xl p-4 border border-slate-200 luxury-shadow flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="font-extrabold text-slate-700">Date Range Filter (GMT):</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-mono"
              />
              <span className="text-slate-400 font-bold">to</span>
              <input
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-mono"
              />
              <button
                type="button"
                onClick={() => {
                  setRangeStart('');
                  setRangeEnd('');
                }}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-700"
              >
                All Time
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 luxury-shadow">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                Total Billed Revenue
              </span>
              <div className="text-2xl font-extrabold font-mono text-slate-900 mt-2">GH₵ {totalBilled.toFixed(2)}</div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 luxury-shadow">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-600">
                Confirmed Payments Collected
              </span>
              <div className="text-2xl font-extrabold font-mono text-emerald-600 mt-2">
                GH₵ {totalCollected.toFixed(2)}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 luxury-shadow">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-600">
                Outstanding Customer Balances
              </span>
              <div className="text-2xl font-extrabold font-mono text-rose-600 mt-2">
                GH₵ {totalOutstanding.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 luxury-shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h4 className="font-extrabold text-sm text-slate-900">Job-Linked Financial Ledger (GH₵)</h4>
              <span className="text-xs text-slate-500">
                Only actual charges entered by authorized staff are counted
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white uppercase text-[10px] tracking-wider">
                    <th className="py-3.5 px-4">Job ID</th>
                    <th className="py-3.5 px-4">Sender</th>
                    <th className="py-3.5 px-4">Service Type</th>
                    <th className="py-3.5 px-4">Qty × Unit</th>
                    <th className="py-3.5 px-4">Total (GH₵)</th>
                    <th className="py-3.5 px-4">Paid (GH₵)</th>
                    <th className="py-3.5 px-4">Balance</th>
                    <th className="py-3.5 px-4">Method</th>
                    <th className="py-3.5 px-4 text-right">Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rangedSubs.map((s) => {
                    const bal = Math.max(0, s.billing.totalAmount - s.billing.amountPaid);
                    return (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="py-3.5 px-4 font-mono font-bold text-blue-600">{s.id}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">{s.senderName}</td>
                        <td className="py-3.5 px-4">{s.billing.serviceType}</td>
                        <td className="py-3.5 px-4 font-mono">
                          {s.billing.copies} × ₵{s.billing.unitPrice.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold">₵{s.billing.totalAmount.toFixed(2)}</td>
                        <td className="py-3.5 px-4 font-mono font-bold text-emerald-600">
                          ₵{s.billing.amountPaid.toFixed(2)}
                        </td>
                        <td
                          className={`py-3.5 px-4 font-mono font-bold ${bal > 0 ? 'text-rose-600' : 'text-slate-400'}`}
                        >
                          ₵{bal.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded bg-slate-100 font-bold text-[10px]">
                            {s.billing.paymentMethod}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => onOpenSubmissionModal(s)}
                            className="text-blue-600 font-bold hover:underline"
                          >
                            Update
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    if (route === 'expenses') {
      const income = submissions.reduce((a, s) => a + s.billing.amountPaid, 0);
      const totalExp = expenses.reduce((a, e) => a + e.amount, 0);
      const profit = income - totalExp;

      return (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 luxury-shadow">
              <span className="text-[11px] font-extrabold uppercase text-slate-500">Total Collected Income</span>
              <div className="text-2xl font-extrabold font-mono text-emerald-600 mt-1">GH₵ {income.toFixed(2)}</div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 luxury-shadow">
              <span className="text-[11px] font-extrabold uppercase text-slate-500">Total Branch Expenses</span>
              <div className="text-2xl font-extrabold font-mono text-rose-600 mt-1">GH₵ {totalExp.toFixed(2)}</div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 luxury-shadow">
              <span className="text-[11px] font-extrabold uppercase text-slate-500">Estimated Net Profit</span>
              <div
                className={`text-2xl font-extrabold font-mono mt-1 ${
                  profit >= 0 ? 'text-blue-600' : 'text-rose-600'
                }`}
              >
                GH₵ {profit.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 luxury-shadow">
            <h4 className="font-extrabold text-sm text-slate-900 mb-4">Record Operational Expense</h4>
            <form onSubmit={handleAddExpense} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <select
                value={expCat}
                onChange={(e) => setExpCat(e.target.value)}
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold"
              >
                <option>Paper Stock &amp; Card</option>
                <option>Toner &amp; Ink Cartridges</option>
                <option>Machine Maintenance</option>
                <option>Utilities &amp; Power</option>
                <option>Other Operational Expense</option>
              </select>
              <input
                type="text"
                value={expDesc}
                onChange={(e) => setExpDesc(e.target.value)}
                required
                placeholder="Expense description..."
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
              />
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={expAmt}
                onChange={(e) => setExpAmt(e.target.value)}
                required
                placeholder="Amount (GH₵)"
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono"
              />
              <button
                type="submit"
                disabled={savingExp}
                className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold"
              >
                {savingExp ? 'Saving...' : '+ Add Expense'}
              </button>
            </form>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 luxury-shadow overflow-hidden">
            {expenses.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-400">No expenses recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white uppercase text-[10px] tracking-wider">
                      <th className="py-3.5 px-5">Date</th>
                      <th className="py-3.5 px-5">Category</th>
                      <th className="py-3.5 px-5">Description</th>
                      <th className="py-3.5 px-5">Recorded By</th>
                      <th className="py-3.5 px-5 text-right">Amount (GH₵)</th>
                      <th className="py-3.5 px-5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expenses.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="py-3.5 px-5 font-mono">{e.date}</td>
                        <td className="py-3.5 px-5 font-bold text-slate-800">{e.category}</td>
                        <td className="py-3.5 px-5 text-slate-600">{e.description}</td>
                        <td className="py-3.5 px-5">{e.recordedBy}</td>
                        <td className="py-3.5 px-5 text-right font-mono font-bold text-rose-600">
                          GH₵ {e.amount.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-5 text-right">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await deleteBranchExpense(e, staff.fullName);
                                showToast('Expense removed.', 'info');
                              } catch (err) {
                                showToast(getFriendlyError(err).message, 'error');
                              }
                            }}
                            className="text-red-500 hover:text-red-700 font-bold"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      );
    }

    // REPORTS & ANALYTICS
    const byService: Record<string, { count: number; revenue: number }> = {};
    rangedSubs.forEach((s) => {
      const sv = s.billing.serviceType || 'Other Printing Service';
      if (!byService[sv]) byService[sv] = { count: 0, revenue: 0 };
      byService[sv].count += 1;
      byService[sv].revenue += s.billing.amountPaid;
    });
    const periodRevenue = rangedSubs.reduce((a, s) => a + s.billing.amountPaid, 0);
    const periodExpenses = rangedExps.reduce((a, e) => a + e.amount, 0);

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 luxury-shadow flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="font-extrabold text-slate-700">Report Date Range (GMT):</span>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-mono"
            />
            <span className="text-slate-400 font-bold">to</span>
            <input
              type="date"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 luxury-shadow">
            <span className="text-[11px] font-extrabold uppercase text-slate-500">Period Collected Revenue</span>
            <div className="text-2xl font-extrabold font-mono text-emerald-600 mt-1">
              GH₵ {periodRevenue.toFixed(2)}
            </div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-200 luxury-shadow">
            <span className="text-[11px] font-extrabold uppercase text-slate-500">Period Expenses</span>
            <div className="text-2xl font-extrabold font-mono text-rose-600 mt-1">
              GH₵ {periodExpenses.toFixed(2)}
            </div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-200 luxury-shadow">
            <span className="text-[11px] font-extrabold uppercase text-slate-500">Period Net Margin</span>
            <div className="text-2xl font-extrabold font-mono text-blue-600 mt-1">
              GH₵ {(periodRevenue - periodExpenses).toFixed(2)}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 luxury-shadow">
          <h3 className="font-extrabold text-base text-slate-900 mb-1">Revenue Breakdown by Printing Service</h3>
          <p className="text-xs text-slate-500 mb-5">Aggregated live performance for {branch?.name}</p>
          {Object.keys(byService).length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              No submissions recorded in the selected date range.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(byService).map(([sv, data]) => (
                <div key={sv} className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <span className="text-xs font-extrabold text-blue-700 block">{sv}</span>
                  <div className="text-xl font-extrabold font-mono text-slate-900 mt-2">
                    GH₵ {data.revenue.toFixed(2)}
                  </div>
                  <span className="text-[11px] text-slate-500">{data.count} completed/active job(s)</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 5. SENDER MANAGEMENT
  // ===========================================================================
  if (route === 'sender-management') {
    const senderMap = new Map<
      string,
      { senderId: string; senderName: string; count: number; totalFiles: number; paid: number }
    >();
    submissions.forEach((s) => {
      const cur = senderMap.get(s.senderId) || {
        senderId: s.senderId,
        senderName: s.senderName,
        count: 0,
        totalFiles: 0,
        paid: 0
      };
      cur.count += 1;
      cur.totalFiles += s.files.length;
      cur.paid += s.billing.amountPaid;
      senderMap.set(s.senderId, cur);
    });
    const rows = Array.from(senderMap.values());

    return (
      <div className="bg-white rounded-2xl border border-slate-200 luxury-shadow overflow-hidden animate-fade-in">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="font-extrabold text-base text-slate-900">Branch Customers &amp; Senders ({rows.length})</h3>
          <p className="text-xs text-slate-500">Customers who have submitted files to this branch</p>
        </div>
        {rows.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400">No customers have submitted to this branch yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white uppercase text-[10px] tracking-wider">
                  <th className="py-3.5 px-5">Sender ID</th>
                  <th className="py-3.5 px-5">Customer Name</th>
                  <th className="py-3.5 px-5">Submissions to Branch</th>
                  <th className="py-3.5 px-5">Total Files</th>
                  <th className="py-3.5 px-5">Total Paid (GH₵)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.senderId} className="hover:bg-slate-50">
                    <td className="py-3.5 px-5 font-mono font-bold text-blue-600">{r.senderId}</td>
                    <td className="py-3.5 px-5 font-extrabold text-slate-900">{r.senderName}</td>
                    <td className="py-3.5 px-5 font-bold">{r.count}</td>
                    <td className="py-3.5 px-5">{r.totalFiles} files</td>
                    <td className="py-3.5 px-5 font-mono font-bold text-emerald-600">GH₵ {r.paid.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ===========================================================================
  // 6. STAFF & PERMISSIONS MANAGEMENT
  // ===========================================================================
  if (route === 'staff-management') {
    if (!canManageStaff) {
      return (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 max-w-lg mx-auto">
          <h3 className="text-lg font-extrabold text-slate-900">Manager Access Required</h3>
          <p className="text-xs text-slate-500 mt-1">Only the Branch Manager can manage staff accounts.</p>
        </div>
      );
    }

    const permColumns: { key: keyof StaffPermissions; label: string }[] = [
      { key: 'viewFiles', label: 'Files' },
      { key: 'updateStatus', label: 'Status' },
      { key: 'recordBilling', label: 'Billing' },
      { key: 'viewFinance', label: 'Finance' },
      { key: 'deleteFiles', label: 'Delete' },
      { key: 'manageCodes', label: 'Codes' }
    ];

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 luxury-shadow">
          <h3 className="font-extrabold text-base text-slate-900 mb-1">Register Printing Operator / Staff</h3>
          <p className="text-xs text-slate-500 mb-4">
            Operators are provisioned via an isolated secondary Firebase Auth session so you stay logged in, and bound
            exclusively to Branch Code <strong className="font-mono text-blue-600">{staff.branchId}</strong>.
          </p>
          <form onSubmit={handleCreateOperator} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <input
              type="text"
              value={newOpName}
              onChange={(e) => setNewOpName(e.target.value)}
              required
              placeholder="Staff Full Name"
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
            />
            <input
              type="text"
              value={newOpUser}
              onChange={(e) => setNewOpUser(e.target.value)}
              required
              placeholder="Username (e.g. kwesi.print)"
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
            />
            <input
              type="password"
              value={newOpPass}
              onChange={(e) => setNewOpPass(e.target.value)}
              required
              minLength={6}
              placeholder="Private Password (6+)"
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
            />
            <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={newOpFin}
                onChange={(e) => setNewOpFin(e.target.checked)}
                className="rounded text-blue-600"
              />{' '}
              Allow Finance Access
            </label>
            <button
              type="submit"
              disabled={creatingOp}
              className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold"
            >
              {creatingOp ? 'Provisioning...' : '+ Register Operator'}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 luxury-shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-extrabold text-sm text-slate-900">Branch Staff &amp; Granular Permissions</h4>
            <span className="text-[11px] text-slate-500">
              Deactivating or removing an operator blocks all Firestore/Storage access immediately. Deleting the
              underlying Firebase Auth record requires Firebase Console / Admin SDK.
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white uppercase text-[10px] tracking-wider">
                  <th className="py-3.5 px-4">Staff Member</th>
                  <th className="py-3.5 px-4">Role</th>
                  {permColumns.map((pc) => (
                    <th key={pc.key} className="py-3.5 px-3 text-center">
                      {pc.label}
                    </th>
                  ))}
                  <th className="py-3.5 px-4 text-right">Status / Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {branchStaff.map((st) => {
                  const isMgr = st.role === 'manager';
                  return (
                    <tr key={st.uid} className="hover:bg-slate-50">
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-slate-900">{st.fullName}</div>
                        <div className="font-mono text-[11px] text-slate-500">{st.username}</div>
                      </td>
                      <td className="py-3.5 px-4 uppercase font-bold text-blue-600">{st.role}</td>
                      {permColumns.map((pc) => (
                        <td key={pc.key} className="py-3.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={Boolean(st.permissions?.[pc.key])}
                            disabled={isMgr}
                            onChange={async () => {
                              try {
                                await toggleStaffPerm(st, pc.key, staff.fullName);
                                showToast(`Updated ${pc.label} permission for ${st.fullName}`, 'info');
                              } catch (err) {
                                showToast(getFriendlyError(err).message, 'error');
                              }
                            }}
                            className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                          />
                        </td>
                      ))}
                      <td className="py-3.5 px-4 text-right">
                        {isMgr ? (
                          <span className="text-[11px] font-bold text-slate-400">Branch Owner</span>
                        ) : (
                          <div className="inline-flex gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await toggleStaffActive(st, staff.fullName);
                                  showToast(
                                    `${st.fullName} ${st.active ? 'deactivated' : 'reactivated'}.`,
                                    'info'
                                  );
                                } catch (err) {
                                  showToast(getFriendlyError(err).message, 'error');
                                }
                              }}
                              className={`px-2.5 py-1 rounded-lg font-bold ${
                                st.active ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {st.active ? 'Active' : 'Deactivated'}
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await removeStaff(st, staff.fullName);
                                  showToast('Operator profile removed from branch.', 'info');
                                } catch (err) {
                                  showToast(getFriendlyError(err).message, 'error');
                                }
                              }}
                              className="px-2.5 py-1 rounded-lg bg-red-50 text-red-600 font-bold"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 7. STORAGE & ARCHIVES (REAL USAGE, NO FAKE BACKUP BUTTON)
  // ===========================================================================
  if (route === 'storage-settings') {
    const usedBytes = branch?.storageUsedBytes || 0;
    const quotaMB = branch?.storageQuotaMB || 10240;
    const quotaBytes = quotaMB * 1024 * 1024;
    const pct = Math.min(100, Number(((usedBytes / Math.max(1, quotaBytes)) * 100).toFixed(2)));
    const totalFiles = submissions.reduce((a, s) => a + s.files.length, 0);

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 luxury-shadow space-y-6">
          <div>
            <h3 className="font-extrabold text-base text-slate-900">Cloud Storage &amp; Archive Retention</h3>
            <p className="text-xs text-slate-500">
              All submitted files are stored in Cloud Storage under{' '}
              <span className="font-mono font-bold text-blue-600">
                branches/{branch?.branchId}/YYYY/MM/DD/SUBMISSION_ID/
              </span>
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="flex flex-wrap justify-between text-xs font-bold mb-2 gap-2">
              <span>
                Real Cloud Storage Used: {formatFileSize(usedBytes)} of {quotaMB.toLocaleString()} MB ({totalFiles}{' '}
                files)
              </span>
              <span className={pct >= 90 ? 'text-red-600' : 'text-blue-600'}>{pct}%</span>
            </div>
            <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-red-600' : 'bg-blue-600'}`}
                style={{ width: `${Math.max(usedBytes > 0 ? 2 : 0, pct)}%` }}
              ></div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-100 space-y-1.5">
              <h4 className="font-extrabold text-blue-900">
                <i className="fa-solid fa-clock-rotate-left mr-1.5"></i>Archive Retention ({branch?.retentionDays || 365}{' '}
                Days)
              </h4>
              <p className="text-slate-600 leading-relaxed">
                Automatic file expiration after {branch?.retentionDays || 365} days is configured via a{' '}
                <strong>Google Cloud Storage Object Lifecycle Rule</strong> (Delete after N days on the bucket) or a
                scheduled Cloud Function (requires the Firebase Blaze plan).
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
              <h4 className="font-extrabold text-slate-900">
                <i className="fa-solid fa-database mr-1.5 text-slate-600"></i>Automated Backups
              </h4>
              <p className="text-slate-600 leading-relaxed">
                The simulated one-click backup button has been removed so nothing is faked. For real backups, enable{' '}
                <strong>Cloud Firestore Scheduled Backups / Managed Exports</strong> in Google Cloud Console (Blaze plan;
                billed per GB stored in Cloud Storage).
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 8. NOTIFICATIONS & IMMUTABLE AUDIT LOG
  // ===========================================================================
  if (route === 'notifications') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 luxury-shadow">
          <h3 className="font-extrabold text-base text-slate-900 mb-4">Branch Notifications</h3>
          {notifications.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">No notifications yet.</p>
          ) : (
            <div className="space-y-3 max-h-[540px] overflow-y-auto">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => {
                    if (!n.read) markNotificationRead(n.id).catch(() => {});
                  }}
                  className={`p-3.5 rounded-xl border transition cursor-pointer ${
                    n.read ? 'border-slate-200 bg-slate-50/70' : 'border-blue-200 bg-blue-50/60'
                  }`}
                >
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-extrabold text-xs text-blue-700 flex items-center gap-1.5">
                      {!n.read && <span className="w-2 h-2 rounded-full bg-blue-600"></span>}
                      {n.title}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {formatTimestampRelative(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{n.msg}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 luxury-shadow">
          <h3 className="font-extrabold text-base text-slate-900 mb-4">Immutable Security &amp; Activity Audit Log</h3>
          {activities.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">No audit activity logged yet.</p>
          ) : (
            <div className="space-y-3 max-h-[540px] overflow-y-auto">
              {activities.map((a) => (
                <div key={a.id} className="p-3 rounded-xl border border-slate-100 text-xs">
                  <div className="font-bold text-slate-900">{a.user}</div>
                  <div className="text-slate-600 mt-0.5">{a.action}</div>
                  <div className="font-mono text-[10px] text-slate-400 mt-1">
                    {a.date} • {a.time} • Ref: {a.target}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===========================================================================
  // 9. BRANCH SETTINGS & ACCOUNT PASSWORD SETTINGS
  // ===========================================================================
  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      {staff.role === 'manager' && branch && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 luxury-shadow">
          <h3 className="font-extrabold text-base text-slate-900 mb-4">Branch Workspace Settings</h3>
          <form onSubmit={handleSaveBranch} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Unique Branch Code (Immutable)</label>
              <input
                type="text"
                value={branch.branchId}
                disabled
                className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 font-mono font-bold text-blue-700"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Printing Press Name</label>
              <input
                type="text"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Location / Area</label>
                <input
                  type="text"
                  value={branchArea}
                  onChange={(e) => setBranchArea(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">City</label>
                <input
                  type="text"
                  value={branchCity}
                  onChange={(e) => setBranchCity(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Branch Phone</label>
                <input
                  type="tel"
                  value={branchPhone}
                  onChange={(e) => setBranchPhone(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Archive Retention (Days)</label>
                <input
                  type="number"
                  min={7}
                  max={3650}
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Math.max(7, parseInt(e.target.value, 10) || 365))}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={savingBranch}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold"
            >
              {savingBranch ? 'Saving...' : 'Save Branch Info'}
            </button>
          </form>
        </div>
      )}

      {/* Account Password Update for ALL Staff */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 luxury-shadow">
        <h3 className="font-extrabold text-base text-slate-900 mb-1">Account Security — Change Password</h3>
        <p className="text-xs text-slate-500 mb-4">
          Signed in as <strong className="font-mono text-blue-600">{staff.username}</strong> ({staff.role}). Passwords
          are stored securely in Firebase Authentication only.
        </p>
        <form onSubmit={handleUpdatePassword} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Current Password</label>
            <input
              type="password"
              value={curPass}
              onChange={(e) => setCurPass(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">New Password (6+ chars)</label>
              <input
                type="password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={savingPass}
            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-bold"
          >
            {savingPass ? 'Updating Password...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
};
