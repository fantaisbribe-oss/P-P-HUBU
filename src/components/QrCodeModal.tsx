import React from 'react';
import { formatGhanaLongDate } from '../utils/dates';

interface QrCodeModalProps {
  open: boolean;
  branchName: string;
  branchId: string;
  code: string;
  onCopy: () => void;
  onClose: () => void;
}

export const QrCodeModal: React.FC<QrCodeModalProps> = ({
  open,
  branchName,
  branchId,
  code,
  onCopy,
  onClose
}) => {
  if (!open) return null;

  const seed = (code || 'PPH-0000').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const rects: React.ReactElement[] = [];
  for (let r = 0; r < 11; r++) {
    for (let c = 0; c < 11; c++) {
      const isFinder = (r < 3 && c < 3) || (r < 3 && c > 7) || (r > 7 && c < 3);
      const bit = isFinder || (r * 13 + c * 7 + seed) % 3 === 0;
      if (bit) {
        rects.push(
          <rect key={`${r}-${c}`} x={c * 10} y={r * 10} width="8.5" height="8.5" rx="1.5" fill="#0f172a" />
        );
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-navy-950/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-7 text-center shadow-2xl animate-fade-in">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto text-xl mb-3">
          <i className="fa-solid fa-qrcode"></i>
        </div>
        <h3 className="text-xl font-extrabold text-slate-900">Branch Daily Submission QR</h3>
        <p className="text-xs text-slate-500 mt-1">
          {branchName} ({branchId}) • {formatGhanaLongDate()}
        </p>

        <div className="my-6 p-5 rounded-2xl bg-slate-50 border-2 border-dashed border-blue-200 inline-block">
          <div className="w-48 h-48 mx-auto bg-white p-3 rounded-xl shadow-sm flex items-center justify-center">
            <svg viewBox="0 0 110 110" className="w-full h-full">
              {rects}
            </svg>
          </div>
          <div className="mt-3 font-mono text-2xl font-extrabold tracking-widest text-blue-700">
            {code || 'NO CODE'}
          </div>
          <div className="text-[11px] font-semibold text-slate-500 mt-1">
            Valid Today Only (GMT / UTC+0) • Expires 11:59 PM
          </div>
        </div>

        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onCopy}
            className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition"
          >
            <i className="fa-regular fa-copy mr-1"></i> Copy Code
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
