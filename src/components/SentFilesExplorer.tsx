import React, { useEffect, useState } from 'react';
import {
  JOB_STATUSES,
  MONTHS_DATA,
  type BranchPrivate,
  type DailyCodeDoc,
  type StaffUserProfile,
  type Submission,
  type SubmissionFile
} from '../types';
import {
  formatFileSize,
  getDaysInMonth,
  getGhanaDateParts,
  getStatusBadgeClasses
} from '../utils/dates';
import { getFileDownloadUrl } from '../services/pphubService';

interface FileThumbnailProps {
  file: SubmissionFile;
  onClick: () => void;
}

const FileThumbnail: React.FC<FileThumbnailProps> = ({ file, onClick }) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (file.type === 'image' && file.storagePath) {
      setLoading(true);
      getFileDownloadUrl(file.storagePath)
        .then((u) => {
          if (active) setThumbUrl(u);
        })
        .catch(() => {
          if (active) setThumbUrl(null);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [file.storagePath, file.type]);

  const isImg = file.type === 'image';
  const isPdf = file.type === 'pdf';
  const isExcel = file.type === 'excel';
  const isPpt = file.type === 'ppt';
  const isZip = file.type === 'zip';

  const cardBg = isPdf
    ? 'bg-red-50/70'
    : isExcel
    ? 'bg-emerald-50/70'
    : isPpt
    ? 'bg-orange-50/70'
    : isZip
    ? 'bg-slate-100'
    : 'bg-blue-50/70';

  const iconBg = isPdf
    ? 'bg-red-100 text-red-600'
    : isExcel
    ? 'bg-emerald-100 text-emerald-600'
    : isPpt
    ? 'bg-orange-100 text-orange-600'
    : isZip
    ? 'bg-slate-200 text-slate-700'
    : 'bg-blue-100 text-blue-600';

  const pillBg = isPdf
    ? 'bg-red-600 text-white'
    : isExcel
    ? 'bg-emerald-600 text-white'
    : isPpt
    ? 'bg-orange-600 text-white'
    : isZip
    ? 'bg-slate-700 text-white'
    : 'bg-blue-600 text-white';

  const iconFa = isPdf
    ? 'fa-file-pdf'
    : isExcel
    ? 'fa-file-excel'
    : isPpt
    ? 'fa-file-powerpoint'
    : isZip
    ? 'fa-file-zipper'
    : isImg
    ? 'fa-image'
    : 'fa-file-word';

  return (
    <div
      onClick={onClick}
      className="relative h-44 bg-slate-100 cursor-pointer overflow-hidden flex items-center justify-center"
    >
      {isImg && thumbUrl ? (
        <>
          <img
            src={thumbUrl}
            alt={file.originalName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition flex items-center justify-center">
            <span className="opacity-0 group-hover:opacity-100 bg-black/75 text-white text-xs font-bold px-3 py-1.5 rounded-full transition">
              <i className="fa-solid fa-expand mr-1"></i> View Full Image
            </span>
          </div>
        </>
      ) : loading ? (
        <div className="flex flex-col items-center gap-2 text-slate-400">
          <i className="fa-solid fa-circle-notch fa-spin text-xl text-blue-600"></i>
          <span className="text-[11px] font-semibold">Loading thumbnail...</span>
        </div>
      ) : (
        <div className={`p-5 text-center w-full h-full flex flex-col items-center justify-center ${cardBg}`}>
          <div className={`w-14 h-14 rounded-2xl ${iconBg} flex items-center justify-center text-2xl mb-2 shadow-sm`}>
            <i className={`fa-solid ${iconFa}`}></i>
          </div>
          <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${pillBg}`}>
            {file.ext} DOCUMENT
          </span>
          <p className="text-[11px] text-slate-600 mt-2 line-clamp-2 px-2">
            {file.pagesPreview || 'Ready for press preview'}
          </p>
        </div>
      )}
      <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-navy-900/80 backdrop-blur text-white font-mono text-[10px] font-bold">
        {file.ext} • {formatFileSize(file.sizeBytes)}
      </span>
    </div>
  );
};

interface SentFilesExplorerProps {
  branch: BranchPrivate | null;
  staff: StaffUserProfile;
  submissions: Submission[];
  dailyCodes: DailyCodeDoc[];
  level: 1 | 2 | 3;
  selectedYear: number;
  selectedMonth: number;
  selectedDay: number;
  onChangeExplorer: (next: { level?: 1 | 2 | 3; year?: number; month?: number; day?: number }) => void;
  onOpenSubmissionModal: (sub: Submission) => void;
  onOpenFileLightbox: (sub: Submission, file: SubmissionFile) => void;
  onDownloadFile: (file: SubmissionFile) => void;
  onPrintFile: (sub: Submission, file: SubmissionFile) => void;
  onDeleteFile: (sub: Submission, fileId: string) => void;
}

export const SentFilesExplorer: React.FC<SentFilesExplorerProps> = ({
  branch,
  staff,
  submissions,
  dailyCodes,
  level,
  selectedYear,
  selectedMonth,
  selectedDay,
  onChangeExplorer,
  onOpenSubmissionModal,
  onOpenFileLightbox,
  onDownloadFile,
  onPrintFile,
  onDeleteFile
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const { year: todayYear, dateStr: todayStr } = getGhanaDateParts();
  const canDelete = staff.role === 'manager' || staff.permissions.deleteFiles;

  const dailyCodeMap = new Map<string, string>();
  dailyCodes.forEach((dc) => dailyCodeMap.set(dc.date, dc.code));

  const availableYears = Array.from(
    new Set([todayYear, selectedYear, ...submissions.map((s) => s.year)])
  ).sort((a, b) => b - a);

  const renderSearchBar = () => (
    <div className="bg-white rounded-2xl p-4 border border-slate-200 luxury-shadow mb-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
      <div className="relative flex-1">
        <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search historical archives by submission name, file name, sender, ID, or date..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:bg-white focus:border-blue-600 outline-none"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selectedYear}
          onChange={(e) => onChangeExplorer({ year: Number(e.target.value) })}
          className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-700 outline-none"
        >
          {availableYears.map((yr) => (
            <option key={yr} value={yr}>
              Year {yr}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 outline-none"
        >
          <option value="ALL">All Job Statuses</option>
          {JOB_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
        {(searchQuery || statusFilter !== 'ALL') && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('ALL');
            }}
            className="px-3.5 py-2.5 rounded-xl bg-red-50 text-red-600 font-bold text-xs hover:bg-red-100"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );

  // GLOBAL SEARCH MODE
  if (searchQuery.trim() !== '' || statusFilter !== 'ALL') {
    const q = searchQuery.toLowerCase();
    const filtered = submissions.filter((s) => {
      const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
      const matchesText =
        !q ||
        s.customName.toLowerCase().includes(q) ||
        s.senderName.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.date.includes(q) ||
        (MONTHS_DATA[s.month]?.name || '').toLowerCase().includes(q) ||
        s.files.some((f) => f.originalName.toLowerCase().includes(q));
      return matchesStatus && matchesText;
    });

    return (
      <div className="animate-fade-in">
        {renderSearchBar()}
        <div className="bg-white rounded-2xl border border-slate-200 luxury-shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-extrabold text-base text-slate-900">Archive Search Results ({filtered.length})</h3>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('ALL');
                onChangeExplorer({ level: 1 });
              }}
              className="text-xs font-bold text-blue-600 hover:underline"
            >
              ← Back to 12 Monthly Covers
            </button>
          </div>
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <i className="fa-solid fa-folder-open text-4xl mb-3"></i>
              <p className="text-sm font-bold">No matching archived submissions found in this branch.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((s) => (
                <div
                  key={s.id}
                  className="border border-slate-200 rounded-2xl p-4 hover:border-blue-400 transition bg-slate-50/60"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[11px] font-bold text-blue-600">{s.id}</span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${getStatusBadgeClasses(
                        s.status
                      )}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                      {s.status}
                    </span>
                  </div>
                  <h4 className="font-extrabold text-sm text-slate-900 mb-1">{s.customName}</h4>
                  <p className="text-xs text-slate-600 mb-2">
                    Sender: <strong>{s.senderName}</strong>
                  </p>
                  <p className="text-[11px] text-slate-500 mb-3">
                    <i className="fa-regular fa-calendar mr-1"></i> {MONTHS_DATA[s.month]?.name} Day {s.day}, {s.year} (
                    {s.time}) • {s.files.length} file(s)
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setStatusFilter('ALL');
                        onChangeExplorer({ year: s.year, month: s.month, day: s.day, level: 3 });
                      }}
                      className="flex-1 py-2 rounded-xl bg-white border border-slate-200 hover:border-blue-500 text-xs font-bold text-slate-800"
                    >
                      Open Day Folder
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenSubmissionModal(s)}
                      className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                    >
                      Details &amp; Print
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // LEVEL 1: 12 MONTHLY COVER TILES
  if (level === 1) {
    return (
      <div className="animate-fade-in">
        {renderSearchBar()}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-blue-600">
              P&amp;P-HUB ARCHIVE HIERARCHY • LEVEL 1
            </span>
            <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900">
              SENT FILES MANAGEMENT — {selectedYear}
            </h3>
          </div>
          <span className="text-xs font-semibold text-slate-500 bg-white px-3.5 py-2 rounded-xl border border-slate-200">
            Select a month cover to open its daily folders
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {MONTHS_DATA.map((m) => {
            const monthSubs = submissions.filter((s) => s.year === selectedYear && s.month === m.index);
            const totalFiles = monthSubs.reduce((sum, s) => sum + s.files.length, 0);
            const completed = monthSubs.filter((s) =>
              ['Printed', 'Ready for Collection', 'Collected'].includes(s.status)
            ).length;
            const pending = monthSubs.length - completed;
            const daysCount = getDaysInMonth(selectedYear, m.index);

            return (
              <div
                key={m.index}
                onClick={() => onChangeExplorer({ month: m.index, level: 2 })}
                className="group relative h-64 rounded-3xl overflow-hidden cursor-pointer border border-slate-200 luxury-shadow hover:-translate-y-1.5 transition-all duration-300 bg-navy-900"
              >
                <img
                  src={m.img}
                  alt={`${m.name} Cover`}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 opacity-75"
                />
                <div className={`absolute inset-0 bg-gradient-to-br ${m.theme} opacity-55 mix-blend-multiply`}></div>
                <div className="absolute inset-0 month-card-overlay"></div>

                <div className="relative z-10 p-5 flex items-center justify-between">
                  <span className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center text-cyan-300">
                    <i className={`fa-solid ${m.icon}`}></i>
                  </span>
                  <span className="px-3 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/15 text-[11px] font-mono font-bold text-white">
                    {daysCount} DAYS
                  </span>
                </div>

                <div className="absolute bottom-0 inset-x-0 p-5 z-10 text-white">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300 mb-0.5">{m.tagline}</p>
                  <h4 className="text-2xl font-extrabold tracking-tight uppercase">{m.name}</h4>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/15 text-[11px]">
                    <div>
                      <span className="text-slate-300 block">Files / Submissions</span>
                      <span className="font-mono font-extrabold text-white">
                        {totalFiles} files • {monthSubs.length} subs
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-emerald-300 font-bold block">{completed} Completed</span>
                      <span className="text-amber-300 font-bold block">{pending} Pending</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // LEVEL 2: DAILY FOLDERS GRID
  const m = MONTHS_DATA[selectedMonth];
  const totalDays = getDaysInMonth(selectedYear, m.index);

  if (level === 2) {
    const days = Array.from({ length: totalDays }, (_, idx) => idx + 1);
    return (
      <div className="animate-fade-in">
        {renderSearchBar()}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 luxury-shadow mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 mb-1">
              <button
                type="button"
                onClick={() => onChangeExplorer({ level: 1 })}
                className="text-blue-600 hover:underline flex items-center gap-1"
              >
                <i className="fa-solid fa-arrow-left"></i> SENT FILES MANAGEMENT
              </button>
              <span>/</span>
              <span className="uppercase text-slate-800">{m.name} FILES</span>
            </div>
            <h3 className="text-2xl font-extrabold text-slate-900 uppercase">
              {m.name} {selectedYear} ({totalDays} DAILY FOLDERS)
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onChangeExplorer({ level: 1 })}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition"
          >
            <i className="fa-solid fa-grip mr-1"></i> All 12 Months
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3.5">
          {days.map((d) => {
            const dateStr = `${selectedYear}-${String(m.index + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const daySubs = submissions.filter((s) => s.year === selectedYear && s.month === m.index && s.day === d);
            const dayFilesCount = daySubs.reduce((sum, s) => sum + s.files.length, 0);
            const isToday = dateStr === todayStr;
            const dayCode = dailyCodeMap.get(dateStr) || daySubs[0]?.dailyCode || '—';
            const hasActivity = daySubs.length > 0;

            return (
              <div
                key={d}
                onClick={() => onChangeExplorer({ day: d, level: 3 })}
                className={`group cursor-pointer rounded-2xl p-4 border transition-all duration-200 hover:-translate-y-1 ${
                  isToday
                    ? 'bg-gradient-to-br from-blue-600 to-navy-900 text-white border-cyan-400 luxury-glow'
                    : hasActivity
                    ? 'bg-white border-blue-200 hover:border-blue-500 luxury-shadow'
                    : 'bg-white border-slate-200/80 hover:border-blue-400 opacity-85 hover:opacity-100'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                      isToday
                        ? 'bg-white/15 text-cyan-300'
                        : hasActivity
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <i className="fa-solid fa-folder-closed group-hover:hidden"></i>
                    <i className="fa-solid fa-folder-open hidden group-hover:inline"></i>
                  </div>
                  {hasActivity ? (
                    <span
                      className={`flex items-center gap-1.5 text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        isToday ? 'bg-emerald-400/20 text-emerald-300' : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-indicator"></span> Active
                    </span>
                  ) : (
                    <span className={`text-[10px] font-semibold ${isToday ? 'text-cyan-200' : 'text-slate-400'}`}>
                      {isToday ? 'Today' : 'Empty'}
                    </span>
                  )}
                </div>

                <div className={`font-extrabold text-base tracking-tight ${isToday ? 'text-white' : 'text-slate-900'}`}>
                  DAY {d}
                </div>
                <div className={`text-[11px] font-medium ${isToday ? 'text-cyan-200' : 'text-slate-500'}`}>
                  {d} {m.name.slice(0, 3)} {selectedYear}
                </div>

                <div className={`mt-3 pt-2.5 border-t ${isToday ? 'border-white/15' : 'border-slate-100'} space-y-1`}>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className={isToday ? 'text-slate-300' : 'text-slate-400'}>Code:</span>
                    <span className={`font-mono font-bold ${isToday ? 'text-cyan-300' : 'text-blue-600'}`}>
                      {dayCode}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className={isToday ? 'text-white' : 'text-slate-700'}>{daySubs.length} Subs</span>
                    <span className={isToday ? 'text-cyan-300' : 'text-slate-500'}>{dayFilesCount} Files</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // LEVEL 3: WHATSAPP-STYLE DAILY FILE GALLERY
  const dateStr = `${selectedYear}-${String(m.index + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
  const daySubs = submissions.filter(
    (s) => s.year === selectedYear && s.month === m.index && s.day === selectedDay
  );
  const dayCode = dailyCodeMap.get(dateStr) || daySubs[0]?.dailyCode || 'NO CODE RECORDED';

  return (
    <div className="animate-fade-in">
      <div className="bg-white rounded-2xl p-5 border border-slate-200 luxury-shadow mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500 mb-1">
            <button
              type="button"
              onClick={() => onChangeExplorer({ level: 1 })}
              className="text-blue-600 hover:underline"
            >
              SENT FILES
            </button>
            <span>/</span>
            <button
              type="button"
              onClick={() => onChangeExplorer({ level: 2 })}
              className="text-blue-600 hover:underline uppercase"
            >
              {m.name} FILES
            </button>
            <span>/</span>
            <span className="text-slate-900">DAY {selectedDay}</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900">
            {m.name} — DAY {selectedDay}, {selectedYear} Gallery
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Daily Submission Code Reference: <span className="font-mono font-bold text-blue-600">{dayCode}</span> •{' '}
            {daySubs.length} Submission(s)
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChangeExplorer({ level: 2 })}
          className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition self-start lg:self-auto"
        >
          ← Back to {m.name} Days
        </button>
      </div>

      <div className="whatsapp-wallpaper rounded-3xl p-4 sm:p-6 lg:p-8 border border-slate-200 min-h-[460px]">
        {daySubs.length === 0 ? (
          <div className="bg-white/95 backdrop-blur rounded-3xl p-12 text-center max-w-md mx-auto my-10 shadow-sm border border-slate-200">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto text-2xl mb-4">
              <i className="fa-regular fa-folder-open"></i>
            </div>
            <h4 className="text-lg font-extrabold text-slate-900">No Files Submitted on Day {selectedDay}</h4>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              No customers uploaded documents to {branch?.name || 'this branch'} on {selectedDay} {m.name}{' '}
              {selectedYear}.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {daySubs.map((sub) => (
              <div
                key={sub.id}
                className="bg-white rounded-3xl shadow-md border border-slate-200/90 overflow-hidden max-w-5xl"
              >
                <div className="px-5 py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center font-extrabold text-xs">
                      {sub.senderName.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold text-sm text-white">{sub.customName}</span>
                        <span className="text-[10px] font-mono bg-white/15 px-2 py-0.5 rounded text-cyan-300">
                          {sub.id}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300">
                        Sender: <strong>{sub.senderName}</strong> ({sub.senderId}) •{' '}
                        <i className="fa-regular fa-clock"></i> {sub.time}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${getStatusBadgeClasses(
                        sub.status
                      )}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                      {sub.status}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenSubmissionModal(sub)}
                      className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition"
                    >
                      <i className="fa-solid fa-sliders mr-1"></i> Operations &amp; Billing
                    </button>
                  </div>
                </div>

                <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 bg-[#f7f9fc]">
                  {sub.files.map((file) => (
                    <div
                      key={file.fileId}
                      className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md hover:border-blue-400 transition flex flex-col"
                    >
                      <FileThumbnail file={file} onClick={() => onOpenFileLightbox(sub, file)} />

                      <div className="p-3.5 flex-1 flex flex-col justify-between">
                        <div>
                          <p className="font-bold text-xs text-slate-900 truncate" title={file.originalName}>
                            {file.originalName}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {sub.date} • {sub.time}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => onOpenFileLightbox(sub, file)}
                            className="flex-1 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-600 text-slate-700 hover:text-white text-[11px] font-bold transition"
                          >
                            <i className="fa-solid fa-eye mr-1"></i> Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => onDownloadFile(file)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition"
                            title="Download"
                          >
                            <i className="fa-solid fa-download"></i>
                          </button>
                          <button
                            type="button"
                            onClick={() => onPrintFile(sub, file)}
                            className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white text-[11px] font-bold transition"
                            title="Print File"
                          >
                            <i className="fa-solid fa-print"></i>
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => onDeleteFile(sub, file.fileId)}
                              className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-600 text-red-600 hover:text-white text-[11px] font-bold transition"
                              title="Delete File"
                            >
                              <i className="fa-solid fa-trash"></i>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
