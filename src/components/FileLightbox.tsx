import React, { useEffect, useState } from 'react';
import type { Submission, SubmissionFile } from '../types';
import { getFileDownloadUrl } from '../services/pphubService';
import { formatFileSize } from '../utils/dates';
import { getFriendlyError } from '../firebase';

interface FileLightboxProps {
  submission: Submission | null;
  file: SubmissionFile | null;
  onClose: () => void;
  onPrintFile: (sub: Submission, file: SubmissionFile, resolvedUrl: string | null) => void;
  onDownloadFile: (file: SubmissionFile, resolvedUrl: string | null) => void;
}

export const FileLightbox: React.FC<FileLightboxProps> = ({
  submission,
  file,
  onClose,
  onPrintFile,
  onDownloadFile
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!file) {
      setUrl(null);
      setError(null);
      return;
    }

    if (!file.storagePath) {
      setUrl(null);
      setError('This sample record does not have an uploaded file in Cloud Storage.');
      return;
    }

    setLoading(true);
    setError(null);
    getFileDownloadUrl(file.storagePath)
      .then((downloadUrl) => {
        if (active) setUrl(downloadUrl);
      })
      .catch((err) => {
        if (active) setError(getFriendlyError(err).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [file]);

  if (!submission || !file) return null;

  const iconClass =
    file.type === 'image'
      ? 'fa-image'
      : file.type === 'pdf'
      ? 'fa-file-pdf'
      : file.type === 'excel'
      ? 'fa-file-excel'
      : file.type === 'ppt'
      ? 'fa-file-powerpoint'
      : file.type === 'zip'
      ? 'fa-file-zipper'
      : 'fa-file-word';

  return (
    <div className="fixed inset-0 bg-navy-950/90 backdrop-blur-md z-[60] flex flex-col">
      <div className="px-6 py-4 bg-navy-900/90 border-b border-white/10 text-white flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <i className={`fa-solid ${iconClass} text-cyan-400 text-lg`}></i>
          <div className="min-w-0">
            <h4 className="font-bold text-sm sm:text-base truncate">{file.originalName}</h4>
            <p className="text-xs text-slate-400 truncate">
              Submission: {submission.customName} • Sender: {submission.senderName} • {submission.date}{' '}
              {submission.time} • {formatFileSize(file.sizeBytes)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onDownloadFile(file, url)}
            disabled={loading || !url}
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40 text-xs font-bold flex items-center gap-1.5 transition"
          >
            <i className="fa-solid fa-download"></i> <span className="hidden sm:inline">Download</span>
          </button>
          <button
            type="button"
            onClick={() => onPrintFile(submission, file, url)}
            disabled={loading || !url}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-xs font-bold flex items-center gap-1.5 transition"
          >
            <i className="fa-solid fa-print"></i> <span className="hidden sm:inline">Print Now</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-red-500/80 flex items-center justify-center transition"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 overflow-auto">
        {loading ? (
          <div className="text-center text-white space-y-3">
            <i className="fa-solid fa-circle-notch fa-spin text-3xl text-cyan-400"></i>
            <p className="text-xs font-bold text-slate-300">Fetching secure preview from Cloud Storage...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl max-w-md w-full p-7 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto text-xl">
              <i className="fa-solid fa-circle-exclamation"></i>
            </div>
            <h4 className="font-extrabold text-sm text-slate-900">Preview Unavailable</h4>
            <p className="text-xs text-slate-600 leading-relaxed">{error}</p>
          </div>
        ) : file.type === 'image' && url ? (
          <img
            src={url}
            alt={file.originalName}
            className="max-h-[78vh] max-w-full rounded-2xl shadow-2xl border border-white/15 object-contain"
          />
        ) : file.type === 'pdf' && url ? (
          <div className="w-full max-w-5xl h-[78vh] bg-white rounded-2xl overflow-hidden shadow-2xl border border-white/15">
            <iframe src={url} title={file.originalName} className="w-full h-full border-0" />
          </div>
        ) : (
          <div className="bg-white rounded-2xl max-w-2xl w-full p-8 sm:p-12 shadow-2xl text-slate-900 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-2xl shrink-0">
                  <i className={`fa-solid ${iconClass}`}></i>
                </div>
                <div className="min-w-0">
                  <h4 className="font-extrabold text-base truncate">{file.originalName}</h4>
                  <p className="text-xs text-slate-500">
                    {file.ext} Document • {formatFileSize(file.sizeBytes)} • Cloud Verified
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold shrink-0">
                Print-Ready
              </span>
            </div>
            <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 min-h-[200px] flex flex-col justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider text-blue-600 mb-2">
                  Document Details
                </p>
                <p className="text-sm font-semibold text-slate-800 leading-relaxed">
                  {file.pagesPreview || 'Uploaded office/archive file ready for download and press printing.'}
                </p>
                <p className="text-xs text-slate-500 mt-3">
                  Office documents ({file.ext}) cannot be rendered natively in-browser. Click{' '}
                  <strong>Download</strong> above to open in your desktop press application.
                </p>
              </div>
              <div className="border-t border-slate-200 pt-3 mt-6 flex justify-between text-[11px] text-slate-500 font-mono">
                <span>JOB: {submission.id}</span>
                <span>SENDER: {submission.senderName}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
