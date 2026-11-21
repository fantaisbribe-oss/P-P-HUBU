import React, { useState } from 'react';
import {
  registerManagerWithBranch,
  registerSenderAccount,
  signInSender,
  signInStaff
} from '../services/pphubService';
import {
  DEV_SEED_ACCOUNTS,
  ENABLE_DEV_DEMO_UI,
  runDevOnlySeed
} from '../services/devSeed';
import {
  FIREBASE_CONSOLE_AUTH_URL,
  getFriendlyError,
  type FriendlyError
} from '../firebase';
import { formatGhanaBannerDate } from '../utils/dates';
import type { UserProfile } from '../types';

interface AuthPortalProps {
  onAuthenticated: (profile: UserProfile) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const AuthPortal: React.FC<AuthPortalProps> = ({ onAuthenticated, showToast }) => {
  const [selectedRole, setSelectedRole] = useState<'manager' | 'operator' | 'sender'>('manager');
  const [managerTab, setManagerTab] = useState<'login' | 'register'>('login');
  const [senderTab, setSenderTab] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [errorBanner, setErrorBanner] = useState<FriendlyError | null>(null);
  const [seedLog, setSeedLog] = useState<string>('');

  // Manager Login
  const [mgrBranch, setMgrBranch] = useState('');
  const [mgrUser, setMgrUser] = useState('');
  const [mgrPass, setMgrPass] = useState('');

  // Manager Register
  const [regPressName, setRegPressName] = useState('');
  const [regPressArea, setRegPressArea] = useState('');
  const [regPressCity, setRegPressCity] = useState('');
  const [regPressPhone, setRegPressPhone] = useState('');
  const [regMgrName, setRegMgrName] = useState('');
  const [regMgrUser, setRegMgrUser] = useState('');
  const [regMgrPass, setRegMgrPass] = useState('');

  // Operator Login
  const [opBranch, setOpBranch] = useState('');
  const [opUser, setOpUser] = useState('');
  const [opPass, setOpPass] = useState('');

  // Sender Login
  const [sndLoginId, setSndLoginId] = useState('');
  const [sndLoginPin, setSndLoginPin] = useState('');

  // Sender Register
  const [regSndName, setRegSndName] = useState('');
  const [regSndPhone, setRegSndPhone] = useState('');
  const [regSndPin, setRegSndPin] = useState('');

  const bannerDate = formatGhanaBannerDate();

  const clearError = () => setErrorBanner(null);

  const handleManagerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setBusy(true);
    try {
      const profile = await signInStaff('manager', mgrBranch, mgrUser, mgrPass);
      showToast(`Signed in to ${profile.branchId} as ${profile.fullName}`, 'success');
      onAuthenticated(profile);
    } catch (err) {
      const friendly = getFriendlyError(err);
      setErrorBanner(friendly);
      showToast(friendly.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleManagerRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setBusy(true);
    try {
      const { profile, branchId, dailyCode } = await registerManagerWithBranch({
        pressName: regPressName,
        area: regPressArea,
        city: regPressCity,
        phone: regPressPhone,
        fullName: regMgrName,
        username: regMgrUser,
        password: regMgrPass
      });
      showToast(`Branch Created! Unique Branch Code: ${branchId} • Today's Code: ${dailyCode}`, 'success');
      onAuthenticated(profile);
    } catch (err) {
      const friendly = getFriendlyError(err);
      setErrorBanner(friendly);
      showToast(friendly.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleOperatorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setBusy(true);
    try {
      const profile = await signInStaff('operator', opBranch, opUser, opPass);
      showToast(`Welcome back, ${profile.fullName}`, 'success');
      onAuthenticated(profile);
    } catch (err) {
      const friendly = getFriendlyError(err);
      setErrorBanner(friendly);
      showToast(friendly.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSenderLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setBusy(true);
    try {
      const profile = await signInSender(sndLoginId, sndLoginPin);
      showToast(`Welcome back, ${profile.name} (${profile.senderId})`, 'success');
      onAuthenticated(profile);
    } catch (err) {
      const friendly = getFriendlyError(err);
      setErrorBanner(friendly);
      showToast(friendly.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSenderRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setBusy(true);
    try {
      const profile = await registerSenderAccount({
        name: regSndName,
        phone: regSndPhone,
        pin: regSndPin
      });
      showToast(`Account created! Save your Sender ID: ${profile.senderId}`, 'success');
      onAuthenticated(profile);
    } catch (err) {
      const friendly = getFriendlyError(err);
      setErrorBanner(friendly);
      showToast(friendly.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDevDemoLogin = async (kind: 'mgr1' | 'op1' | 'snd1' | 'mgr2') => {
    if (!ENABLE_DEV_DEMO_UI) return;
    clearError();
    setBusy(true);
    try {
      if (kind === 'mgr1') {
        const p = await signInStaff('manager', DEV_SEED_ACCOUNTS.fantaBranchId, DEV_SEED_ACCOUNTS.fantaManager.username, DEV_SEED_ACCOUNTS.fantaManager.pass);
        onAuthenticated(p);
      } else if (kind === 'op1') {
        const p = await signInStaff('operator', DEV_SEED_ACCOUNTS.fantaBranchId, DEV_SEED_ACCOUNTS.fantaOpAma.username, DEV_SEED_ACCOUNTS.fantaOpAma.pass);
        onAuthenticated(p);
      } else if (kind === 'mgr2') {
        const p = await signInStaff('manager', DEV_SEED_ACCOUNTS.royalBranchId, DEV_SEED_ACCOUNTS.royalManager.username, DEV_SEED_ACCOUNTS.royalManager.pass);
        onAuthenticated(p);
      } else if (kind === 'snd1') {
        const s = DEV_SEED_ACCOUNTS.senders[0];
        const p = await signInSender(s.name, s.pin);
        onAuthenticated(p);
      }
    } catch (err) {
      const friendly = getFriendlyError(err);
      setErrorBanner(friendly);
      showToast(friendly.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDevSeed = async () => {
    if (!ENABLE_DEV_DEMO_UI) return;
    clearError();
    setBusy(true);
    try {
      const res = await runDevOnlySeed((m) => setSeedLog(m));
      showToast(`Seeded FANTA-ACC (${res.fantaCode}) & ROYAL-KUM (${res.royalCode})`, 'success');
    } catch (err) {
      const friendly = getFriendlyError(err);
      setErrorBanner(friendly);
      showToast(friendly.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="auth-portal" className="min-h-screen w-full flex flex-col lg:flex-row">
      {/* LEFT PANEL: DEEP NAVY CHARIS BRANDING & ROLE SELECTOR */}
      <div className="lg:w-[50%] hero-gradient text-white p-6 sm:p-10 lg:p-14 flex flex-col justify-between relative overflow-hidden border-b lg:border-b-0 lg:border-r border-white/10">
        <div className="absolute -top-24 -left-24 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-10 right-10 w-72 h-72 bg-cyan-400/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* Brand Logo */}
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center font-extrabold text-xl text-white luxury-glow">
              <i className="fa-solid fa-print"></i>
            </div>
            <div>
              <span className="text-xl font-extrabold tracking-wide block leading-none">P&amp;P-HUB</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">Print &amp; Press Cloud</span>
            </div>
          </div>
          <span className="text-xs font-mono bg-white/10 border border-white/15 px-3 py-1 rounded-full text-cyan-300">
            {bannerDate} (GMT)
          </span>
        </div>

        {/* Headline & 3 Selectable Account Cards */}
        <div className="my-8 lg:my-0 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-400/25 text-cyan-300 text-xs font-bold mb-4">
            <i className="fa-solid fa-shield-halved"></i> Zero-Leakage Branch Isolation &amp; Daily Code Security
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-extrabold leading-[1.15] tracking-tight mb-4">
            Precision File Organization &amp; Press Operations.
          </h1>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-xl mb-8">
            Select your workspace role below to authenticate into your dedicated printing press branch or submit print-ready documents using a branch&apos;s Daily Submission Code.
          </p>

          {/* 3 Selectable Role Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 max-w-2xl">
            <button
              type="button"
              onClick={() => {
                setSelectedRole('manager');
                clearError();
              }}
              className={`role-select-card text-left p-4 rounded-2xl border transition-all duration-200 ${
                selectedRole === 'manager'
                  ? 'bg-cyan-400/15 border-cyan-400 luxury-glow'
                  : 'bg-white/[0.04] border-white/10 hover:border-cyan-400/60 hover:bg-white/[0.08]'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center text-cyan-300 mb-3 ${
                  selectedRole === 'manager' ? 'bg-blue-600/40 border border-cyan-400/40' : 'bg-white/10'
                }`}
              >
                <i className="fa-solid fa-crown"></i>
              </div>
              <h3 className="font-bold text-sm text-white">Branch Manager</h3>
              <p className="text-[11px] text-slate-300 mt-1 leading-snug">
                Own branch, staff roles, daily codes &amp; GH₵ reports
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedRole('operator');
                clearError();
              }}
              className={`role-select-card text-left p-4 rounded-2xl border transition-all duration-200 ${
                selectedRole === 'operator'
                  ? 'bg-cyan-400/15 border-cyan-400 luxury-glow'
                  : 'bg-white/[0.04] border-white/10 hover:border-cyan-400/60 hover:bg-white/[0.08]'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center text-cyan-300 mb-3 ${
                  selectedRole === 'operator' ? 'bg-blue-600/40 border border-cyan-400/40' : 'bg-white/10'
                }`}
              >
                <i className="fa-solid fa-gears"></i>
              </div>
              <h3 className="font-bold text-sm text-white">Printing Operator</h3>
              <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                Print queue, job statuses, copies &amp; billing
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedRole('sender');
                clearError();
              }}
              className={`role-select-card text-left p-4 rounded-2xl border transition-all duration-200 ${
                selectedRole === 'sender'
                  ? 'bg-cyan-400/15 border-cyan-400 luxury-glow'
                  : 'bg-white/[0.04] border-white/10 hover:border-cyan-400/60 hover:bg-white/[0.08]'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center text-cyan-300 mb-3 ${
                  selectedRole === 'sender' ? 'bg-blue-600/40 border border-cyan-400/40' : 'bg-white/10'
                }`}
              >
                <i className="fa-solid fa-cloud-arrow-up"></i>
              </div>
              <h3 className="font-bold text-sm text-white">Sender / Customer</h3>
              <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                Find press, enter daily code &amp; upload files
              </p>
            </button>
          </div>

          {/* DEV-ONLY DEMO SWITCHER STRIP (OFF BY DEFAULT, IMPOSSIBLE IN PRODUCTION) */}
          {ENABLE_DEV_DEMO_UI && (
            <div className="mt-7 p-4 rounded-2xl bg-white/[0.04] border border-amber-400/30 max-w-2xl">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  <i className="fa-solid fa-flask mr-1"></i> DEV-ONLY Test Tools (Disabled in Production)
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleDevSeed}
                  className="text-[11px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold px-2.5 py-1 rounded-lg border border-amber-400/30 transition"
                >
                  Seed Sample Branches
                </button>
              </div>
              {seedLog && <p className="text-[11px] text-cyan-300 font-mono mb-2">{seedLog}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDevDemoLogin('mgr1')}
                  className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-lg transition"
                >
                  Manager (Fanta Press)
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDevDemoLogin('op1')}
                  className="text-xs bg-white/10 hover:bg-white/20 text-white font-semibold px-3 py-1.5 rounded-lg transition"
                >
                  Operator (Ama)
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDevDemoLogin('snd1')}
                  className="text-xs bg-white/10 hover:bg-white/20 text-white font-semibold px-3 py-1.5 rounded-lg transition"
                >
                  Sender (Kofi Mensah)
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDevDemoLogin('mgr2')}
                  className="text-xs bg-emerald-600/80 hover:bg-emerald-500 text-white font-semibold px-3 py-1.5 rounded-lg transition"
                >
                  Branch 2 (Royal Kumasi)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-[11px] font-bold tracking-widest uppercase text-slate-400 relative z-10">
          <span>P&amp;P-HUB • ENTERPRISE ARCHITECTURE</span>
          <span className="text-cyan-400/80">FIREBASE AUTH &amp; FIRESTORE RULES</span>
        </div>
      </div>

      {/* RIGHT PANEL: WHITE AUTHENTICATION FORMS */}
      <div className="lg:w-[50%] bg-white p-6 sm:p-10 lg:p-14 flex flex-col justify-center overflow-y-auto">
        <div className="max-w-md w-full mx-auto">
          {errorBanner && (
            <div className="mb-5 p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-800 space-y-2 animate-fade-in">
              <div className="flex items-start gap-2.5 font-bold">
                <i className="fa-solid fa-shield-exclamation mt-0.5 text-red-600 text-sm"></i>
                <span>{errorBanner.message}</span>
              </div>
              {errorBanner.needsAuthConsoleEnable && (
                <div className="pt-1 pl-6 space-y-1.5 text-[11px] text-red-700">
                  <p>
                    1. Open Firebase Console → Authentication → Sign-in method.
                    <br />
                    2. Click <strong>Email/Password</strong>, toggle <strong>Enable</strong>, and click <strong>Save</strong>.
                  </p>
                  <a
                    href={FIREBASE_CONSOLE_AUTH_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold transition"
                  >
                    Open Firebase Auth Settings <i className="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                  </a>
                </div>
              )}
            </div>
          )}

          {/* ================= MANAGER AUTH PANEL ================= */}
          {selectedRole === 'manager' && (
            <div className="animate-fade-in">
              <div className="flex items-center gap-2 mb-6 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setManagerTab('login');
                    clearError();
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                    managerTab === 'login' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Manager Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManagerTab('register');
                    clearError();
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                    managerTab === 'register' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Register New Branch
                </button>
              </div>

              {managerTab === 'login' ? (
                <div>
                  <span className="text-[11px] font-extrabold tracking-widest uppercase text-blue-600">
                    BRANCH OWNER ACCESS
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">Branch Manager Login</h2>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1 mb-6">
                    Enter your unique Branch Code and private credentials to manage operations.
                  </p>

                  <form onSubmit={handleManagerLogin} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Unique Branch Code</label>
                      <input
                        type="text"
                        value={mgrBranch}
                        onChange={(e) => setMgrBranch(e.target.value)}
                        required
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-mono uppercase focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 outline-none transition"
                        placeholder="e.g. FANTA-ACC"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Manager Username</label>
                      <input
                        type="text"
                        value={mgrUser}
                        onChange={(e) => setMgrUser(e.target.value)}
                        required
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 outline-none transition"
                        placeholder="e.g. kwame.manager"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="block text-xs font-bold text-slate-700">Private Password</label>
                        <button
                          type="button"
                          onClick={() =>
                            showToast(
                              'Staff accounts use private username-based sign-in. Contact your Firebase project administrator if locked out.',
                              'info'
                            )
                          }
                          className="text-[11px] font-bold text-blue-600 hover:underline"
                        >
                          Forgot Password?
                        </button>
                      </div>
                      <input
                        type="password"
                        value={mgrPass}
                        onChange={(e) => setMgrPass(e.target.value)}
                        required
                        minLength={6}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 outline-none transition"
                        placeholder="••••••••"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 disabled:opacity-60 text-white font-bold text-sm shadow-lg shadow-blue-600/25 transition flex items-center justify-center gap-2"
                    >
                      {busy ? (
                        <i className="fa-solid fa-circle-notch fa-spin"></i>
                      ) : (
                        <i className="fa-solid fa-lock"></i>
                      )}
                      {busy ? 'Authenticating...' : 'Access Branch Workspace'}
                    </button>
                  </form>
                </div>
              ) : (
                <div>
                  <span className="text-[11px] font-extrabold tracking-widest uppercase text-blue-600">
                    CREATE PRINTING PRESS WORKSPACE
                  </span>
                  <h2 className="text-2xl font-extrabold text-slate-900 mt-1">Register Printing Press</h2>
                  <p className="text-xs text-slate-500 mt-1 mb-5">
                    Atomically creates your isolated cloud branch, Branch Code, manager account, and today&apos;s Daily Submission Code.
                  </p>

                  <form onSubmit={handleManagerRegister} className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Printing Press Name</label>
                      <input
                        type="text"
                        value={regPressName}
                        onChange={(e) => setRegPressName(e.target.value)}
                        required
                        placeholder="e.g. Apex Digital Printing Press"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:border-blue-600 outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Branch Location / Area</label>
                        <input
                          type="text"
                          value={regPressArea}
                          onChange={(e) => setRegPressArea(e.target.value)}
                          required
                          placeholder="e.g. Osu Oxford St"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:border-blue-600 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">City</label>
                        <input
                          type="text"
                          value={regPressCity}
                          onChange={(e) => setRegPressCity(e.target.value)}
                          required
                          placeholder="e.g. Accra"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:border-blue-600 outline-none"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Manager&apos;s Full Name</label>
                        <input
                          type="text"
                          value={regMgrName}
                          onChange={(e) => setRegMgrName(e.target.value)}
                          required
                          placeholder="e.g. Nana Yaw Boateng"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:border-blue-600 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Branch Phone</label>
                        <input
                          type="tel"
                          value={regPressPhone}
                          onChange={(e) => setRegPressPhone(e.target.value)}
                          placeholder="+233 24 000 0000"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:border-blue-600 outline-none"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Username / ID</label>
                        <input
                          type="text"
                          value={regMgrUser}
                          onChange={(e) => setRegMgrUser(e.target.value)}
                          required
                          placeholder="nana.manager"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:border-blue-600 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Secure Password (6+)</label>
                        <input
                          type="password"
                          value={regMgrPass}
                          onChange={(e) => setRegMgrPass(e.target.value)}
                          required
                          minLength={6}
                          placeholder="••••••••"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:border-blue-600 outline-none"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 disabled:opacity-60 text-white font-bold text-sm shadow-lg shadow-blue-600/25 transition"
                    >
                      {busy ? 'Creating Branch Workspace...' : 'Create Branch & Generate Branch Code'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* ================= OPERATOR AUTH PANEL ================= */}
          {selectedRole === 'operator' && (
            <div className="animate-fade-in">
              <span className="text-[11px] font-extrabold tracking-widest uppercase text-blue-600">
                AUTHORIZED STAFF PORTAL
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">Printing Operator Login</h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 mb-6">
                Sign in using the Branch Code and staff credentials assigned by your Branch Manager.
              </p>

              <form onSubmit={handleOperatorLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Assigned Branch Code</label>
                  <input
                    type="text"
                    value={opBranch}
                    onChange={(e) => setOpBranch(e.target.value)}
                    required
                    placeholder="e.g. FANTA-ACC"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-mono uppercase focus:bg-white focus:border-blue-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Staff Username / Account ID</label>
                  <input
                    type="text"
                    value={opUser}
                    onChange={(e) => setOpUser(e.target.value)}
                    required
                    placeholder="e.g. ama.operator"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:border-blue-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Private Password</label>
                  <input
                    type="password"
                    value={opPass}
                    onChange={(e) => setOpPass(e.target.value)}
                    required
                    minLength={6}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:border-blue-600 outline-none"
                  />
                </div>
                <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-800 flex items-start gap-2.5">
                  <i className="fa-solid fa-circle-info mt-0.5 text-blue-600"></i>
                  <span>
                    Staff accounts are provisioned exclusively by the Branch Manager with custom role permissions.
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 disabled:opacity-60 text-white font-bold text-sm shadow-lg shadow-blue-600/25 transition"
                >
                  {busy ? 'Signing In...' : 'Sign In to Operator Console'}
                </button>
              </form>
            </div>
          )}

          {/* ================= SENDER / CUSTOMER AUTH PANEL ================= */}
          {selectedRole === 'sender' && (
            <div className="animate-fade-in">
              <div className="flex items-center gap-2 mb-6 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setSenderTab('login');
                    clearError();
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                    senderTab === 'login' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sender Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSenderTab('register');
                    clearError();
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                    senderTab === 'register' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  New Sender Account
                </button>
              </div>

              {senderTab === 'login' ? (
                <div>
                  <span className="text-[11px] font-extrabold tracking-widest uppercase text-blue-600">
                    CUSTOMER SUBMISSION PORTAL
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">Sender Sign In</h2>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1 mb-6">
                    Log in with your Sender ID, Phone, or Registered Name and your 4-digit security PIN.
                  </p>

                  <form onSubmit={handleSenderLogin} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Sender ID, Phone, or Registered Name
                      </label>
                      <input
                        type="text"
                        value={sndLoginId}
                        onChange={(e) => setSndLoginId(e.target.value)}
                        required
                        placeholder="e.g. SND-1001, 024 555 0192, or Kofi Mensah"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:border-blue-600 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">4-Digit Security PIN</label>
                      <input
                        type="password"
                        value={sndLoginPin}
                        onChange={(e) => setSndLoginPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        maxLength={4}
                        pattern="\d{4}"
                        inputMode="numeric"
                        required
                        placeholder="••••"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-center text-xl font-mono tracking-[0.6em] focus:bg-white focus:border-blue-600 outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 disabled:opacity-60 text-white font-bold text-sm shadow-lg shadow-blue-600/25 transition"
                    >
                      {busy ? 'Verifying PIN...' : 'Continue to File Submission'}
                    </button>
                  </form>
                </div>
              ) : (
                <div>
                  <span className="text-[11px] font-extrabold tracking-widest uppercase text-blue-600">
                    QUICK CUSTOMER REGISTRATION
                  </span>
                  <h2 className="text-2xl font-extrabold text-slate-900 mt-1">Create Sender Account</h2>
                  <p className="text-xs text-slate-500 mt-1 mb-5">
                    Enter your name, phone number, and choose a 4-digit PIN. We will generate your unique Sender ID.
                  </p>

                  <form onSubmit={handleSenderRegister} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Your Name / Business Name</label>
                      <input
                        type="text"
                        value={regSndName}
                        onChange={(e) => setRegSndName(e.target.value)}
                        required
                        placeholder="e.g. Efua Sutherland"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:border-blue-600 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Phone Number</label>
                      <input
                        type="tel"
                        value={regSndPhone}
                        onChange={(e) => setRegSndPhone(e.target.value)}
                        required
                        placeholder="e.g. 024 555 0192"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:border-blue-600 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Create 4-Digit PIN</label>
                      <input
                        type="password"
                        value={regSndPin}
                        onChange={(e) => setRegSndPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        maxLength={4}
                        pattern="\d{4}"
                        inputMode="numeric"
                        required
                        placeholder="••••"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-center text-xl font-mono tracking-[0.6em] focus:bg-white focus:border-blue-600 outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 disabled:opacity-60 text-white font-bold text-sm shadow-lg shadow-blue-600/25 transition"
                    >
                      {busy ? 'Generating Unique Sender ID...' : 'Generate Sender ID & Enter'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
