import type { Timestamp } from 'firebase/firestore';
import { ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES, type FileCategory } from '../types';

/**
 * Ghana operates on GMT / UTC+0 year-round (no daylight saving).
 * Using UTC components keeps client display aligned with Firestore server request.time.
 */
export function getGhanaDateParts(date: Date = new Date()) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0..11
  const day = date.getUTCDate();
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return {
    year,
    month,
    day,
    mm,
    dd,
    dateStr: `${year}-${mm}-${dd}`
  };
}

export function formatGhanaBannerDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).toUpperCase();
}

export function formatGhanaLongDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

export function formatGhanaTime(date: Date = new Date()): string {
  return date.toLocaleTimeString('en-US', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

export function getDaysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatTimestampRelative(ts?: Timestamp | null): string {
  if (!ts || typeof ts.toDate !== 'function') return 'Just now';
  const d = ts.toDate();
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hr ago`;
  return d.toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
}

export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 140);
  return cleaned || 'file';
}

export function normalizeLookupKey(prefix: 'name' | 'phone', raw: string): string {
  if (prefix === 'phone') {
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 6 ? `phone_${digits}` : '';
  }
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return slug.length >= 2 ? `name_${slug}` : '';
}

export function generateBranchDailyCode(branchId: string): string {
  const prefix = branchId.split('-')[0].replace(/[^A-Z0-9]/gi, '').substring(0, 3).toUpperCase() || 'PPH';
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${rand}`;
}

export function getFileMimeType(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    tiff: 'image/tiff',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip'
  };
  return map[ext] || 'application/octet-stream';
}

export function detectFileCategory(file: File): { valid: boolean; reason?: string; type: FileCategory; ext: string } {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (file.size <= 0) {
    return {
      valid: false,
      reason: `"${file.name}" is empty (0 bytes) and cannot be printed.`,
      type: 'pdf',
      ext: ext.toUpperCase() || 'FILE'
    };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      reason: `"${file.name}" exceeds the 50 MB file limit (${formatFileSize(file.size)}).`,
      type: 'pdf',
      ext: ext.toUpperCase()
    };
  }
  const mimeOk = file.type.startsWith('image/') || ALLOWED_MIME_TYPES.includes(file.type);
  const extOk = ALLOWED_EXTENSIONS.includes(ext);
  if (!mimeOk && !extOk) {
    return {
      valid: false,
      reason: `"${file.name}" is not a supported file type. Allowed: Images, PDF, Word, Excel, PowerPoint, and ZIP.`,
      type: 'pdf',
      ext: ext.toUpperCase() || 'FILE'
    };
  }

  let type: FileCategory = 'word';
  if (file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'svg'].includes(ext)) {
    type = 'image';
  } else if (ext === 'pdf' || file.type === 'application/pdf') {
    type = 'pdf';
  } else if (['xls', 'xlsx'].includes(ext) || file.type.includes('spreadsheet') || file.type.includes('excel')) {
    type = 'excel';
  } else if (['ppt', 'pptx'].includes(ext) || file.type.includes('presentation') || file.type.includes('powerpoint')) {
    type = 'ppt';
  } else if (ext === 'zip' || file.type.includes('zip')) {
    type = 'zip';
  }

  return { valid: true, type, ext: (ext || 'FILE').toUpperCase() };
}

export function getStatusBadgeClasses(status: string): string {
  const map: Record<string, string> = {
    'Uploading': 'bg-slate-100 text-slate-500 border-slate-200',
    'Received': 'bg-slate-100 text-slate-700 border-slate-200',
    'Processing': 'bg-amber-50 text-amber-700 border-amber-200',
    'Ready for Printing': 'bg-cyan-50 text-cyan-700 border-cyan-200',
    'Printing': 'bg-blue-50 text-blue-700 border-blue-200',
    'Printed': 'bg-indigo-50 text-indigo-700 border-indigo-200',
    'Ready for Collection': 'bg-purple-50 text-purple-700 border-purple-200',
    'Collected': 'bg-emerald-50 text-emerald-700 border-emerald-200'
  };
  return map[status] || map['Received'];
}
