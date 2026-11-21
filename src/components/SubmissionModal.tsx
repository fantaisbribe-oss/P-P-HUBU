import React, { useEffect, useState } from 'react';
import {
  JOB_STATUSES,
  MONTHS_DATA,
  PAYMENT_METHODS,
  SERVICE_TYPES,
  type PaymentMethod,
  type StaffUserProfile,
  type Submission,
  type SubmissionFile,
  type SubmissionStatus
} from '../types';
import { formatFileSize, getGhanaDateParts, getStatusBadgeClasses } from '../utils/dates';
import { updateSubmissionOperations } from '../services/pphubService';
import { getFriendlyError } from '../firebase';

interface SubmissionModalProps {
  submission: Submission | null;
  staff: StaffUserProfile;
  onClose: () => void;
  onPreviewFile: (sub: Submission, file: SubmissionFile) => void;
  onPrintFile: (sub: Submission, file: SubmissionFile) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const SubmissionModal: React.FC<SubmissionModalProps> = ({
  submission,
  staff,
  onClose,
  onPreviewFile,
  onPrintFile,
  showToast
}) => {
  const [status, setStatus] = useState<Exclude<SubmissionStatus, 'Uploading'>>('Received');
  const [serviceType, setServiceType] = useState(SERVICE_TYPES[0]);
  const [copies, setCopies] = useState(1);
  const [pages, setPages] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [amountPaid, setAmountPaid] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Unpaid');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!submission) return;
    setStatus(submission.status === 'Uploading' ? 'Received' : submission.status);
    setServiceType(submission.billing.serviceType || SERVICE_TYPES[0]);
    setCopies(submission.billing.copies || 1);
    setPages(submission.billing.pages || 1);
    setUnitPrice(submission.billing.unitPrice || 0);
    setTotalAmount(submission.billing.totalAmount || 0);
    setAmountPaid(submission.billing.amountPaid || 0);
    setPaymentMethod(submission.billing.paymentMethod || 'Unpaid');
  }, [submission]);

  if (!submission) return null;

  const canEditStatus = staff.role === 'manager' || staff.permissions.updateStatus;
  const canEditBilling = staff.role === 'manager' || staff.permissions.recordBilling;
  const balance = Math.max(0, totalAmount - amountPaid);

  const handleCopiesChange = (val: number) => {
    const nextCopies = Math.max(1, val || 1);
    setCopies(nextCopies);
    setTotalAmount(Number((nextCopies * unitPrice).toFixed(2)));
  };

  const handleUnitPriceChange = (val: number) => {
    const nextUnit = Math.max(0, val || 0);
    setUnitPrice(nextUnit);
    setTotalAmount(Number((copies * nextUnit).toFixed(2)));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditStatus && !canEditBilling) {
      showToast('You do not have permission to update job status or billing.', 'error');
      return;
    }
    setSaving(true);
    try {
      const { dateStr } = getGhanaDateParts();
      await updateSubmissionOperations({
        submission,
        staff,
        newStatus: canEditStatus ? status : undefined,
        newBilling: canEditBilling
          ? {
              serviceType,
              copies,
              pages,
              unitPrice,
              totalAmount,
              amountPaid,
              paymentMethod,
              paymentDate: dateStr
            }
          : undefined
      });
      showToast(`Saved job updates for ${submission.id}`, 'success');
      onClose();
    } catch (err) {
      showToast(getFriendlyError(err).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const monthName = MONTHS_DATA[submission.month]?.name || 'Archive';

  return (
    <div className="fixed inset-0 bg-navy-950/75 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-5xl w-full overflow-hidden shadow-2xl border border-slate-200 my-auto animate-fade-in">
        {/* Modal Header */}
        <div className="bg-navy-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-cyan-400/30 flex items-center justify-center text-cyan-400 shrink-0">
              <i className="fa-solid fa-file-invoice"></i>
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-base sm:text-lg truncate">{submission.customName}</h3>
              <p className="text-xs text-cyan-300 font-mono truncate">
                {submission.id} • Branch: {submission.branchId} • Daily Code: {submission.dailyCode}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition shrink-0"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 max-h-[82vh] overflow-y-auto space-y-6">
          {/* Top Metadata Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Sender Details</span>
              <p className="font-extrabold text-sm text-slate-900 mt-1">{submission.senderName}</p>
              <p className="text-xs font-mono text-blue-600">{submission.senderId}</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Archive Location
              </span>
              <p className="font-extrabold text-sm text-slate-900 mt-1">
                {monthName} Day {submission.day}, {submission.year}
              </p>
              <p className="text-xs text-slate-500">
                {submission.date} at {submission.time}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Current Job Status
              </span>
              <div className="mt-1.5">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${getStatusBadgeClasses(
                    submission.status
                  )}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                  {submission.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Handler: <strong>{submission.assignedTo || 'Unassigned'}</strong>
              </p>
            </div>
          </div>

          {/* Uploaded Files List */}
          <div>
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-2.5">
              Submitted Cloud Files ({submission.files.length})
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {submission.files.map((f) => (
                <div
                  key={f.fileId}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <i
                        className={`fa-solid ${
                          f.type === 'image' ? 'fa-image' : f.type === 'pdf' ? 'fa-file-pdf' : 'fa-file-word'
                        }`}
                      ></i>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">{f.originalName}</p>
                      <p className="text-[10px] font-mono text-slate-500">
                        {f.ext} • {formatFileSize(f.sizeBytes)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onPreviewFile(submission, f)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-600 text-slate-700 hover:text-white text-xs font-bold transition"
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => onPrintFile(submission, f)}
                      className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white text-xs font-bold transition"
                      title="Print File"
                    >
                      <i className="fa-solid fa-print"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Printing Workflow & Financial Billing Form */}
          <form onSubmit={handleSave} className="border-t border-slate-200 pt-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Status Workflow */}
              <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-100 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-blue-800">
                    <i className="fa-solid fa-list-check mr-1"></i> 1. Printing Workflow Status
                  </h4>
                  {!canEditStatus && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-600">
                      Read Only
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Update Job Status</label>
                  <select
                    value={status}
                    disabled={!canEditStatus}
                    onChange={(e) => setStatus(e.target.value as Exclude<SubmissionStatus, 'Uploading'>)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white disabled:bg-slate-100 disabled:text-slate-400 text-xs font-bold text-slate-900 outline-none"
                  >
                    {JOB_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Printing Service Type</label>
                  <select
                    value={serviceType}
                    disabled={!canEditBilling}
                    onChange={(e) => setServiceType(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white disabled:bg-slate-100 disabled:text-slate-400 text-xs font-bold text-slate-900 outline-none"
                  >
                    {SERVICE_TYPES.map((sv) => (
                      <option key={sv} value={sv}>
                        {sv}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Print Quantities & Financial Charges (GH₵) */}
              <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-800">
                    <i className="fa-solid fa-cedi-sign mr-1"></i> 2. Print Specs &amp; Financial Record (GH₵)
                  </h4>
                  {!canEditBilling && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-600">
                      No Billing Permission
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Copies</label>
                    <input
                      type="number"
                      min={1}
                      value={copies}
                      disabled={!canEditBilling}
                      onChange={(e) => handleCopiesChange(parseInt(e.target.value, 10))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white disabled:bg-slate-100 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Pages</label>
                    <input
                      type="number"
                      min={1}
                      value={pages}
                      disabled={!canEditBilling}
                      onChange={(e) => setPages(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white disabled:bg-slate-100 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Unit Price (₵)</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={unitPrice}
                      disabled={!canEditBilling}
                      onChange={(e) => handleUnitPriceChange(parseFloat(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white disabled:bg-slate-100 text-xs font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Total (GH₵)</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={totalAmount}
                      disabled={!canEditBilling}
                      onChange={(e) => setTotalAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white disabled:bg-slate-100 text-xs font-mono font-extrabold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Amount Paid (₵)</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={amountPaid}
                      disabled={!canEditBilling}
                      onChange={(e) => setAmountPaid(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white disabled:bg-slate-100 text-xs font-mono font-extrabold text-emerald-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Payment Method</label>
                    <select
                      value={paymentMethod}
                      disabled={!canEditBilling}
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white disabled:bg-slate-100 text-xs font-bold"
                    >
                      {PAYMENT_METHODS.map((pm) => (
                        <option key={pm} value={pm}>
                          {pm}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="font-bold text-slate-600">Outstanding Balance:</span>
                  <span
                    className={`font-mono font-extrabold text-sm ${
                      balance > 0 ? 'text-rose-600' : 'text-emerald-600'
                    }`}
                  >
                    GH₵ {balance.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold"
              >
                Cancel
              </button>
              {(canEditStatus || canEditBilling) && (
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold shadow-lg shadow-blue-600/25"
                >
                  <i className={`fa-solid ${saving ? 'fa-circle-notch fa-spin' : 'fa-floppy-disk'} mr-1`}></i>
                  {saving ? 'Saving...' : 'Save Status & Financial Record'}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
