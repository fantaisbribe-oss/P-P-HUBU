import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'manager' | 'operator' | 'sender';

export interface StaffPermissions {
  viewFiles: boolean;
  updateStatus: boolean;
  recordBilling: boolean;
  viewFinance: boolean;
  deleteFiles: boolean;
  manageCodes: boolean;
  manageStaff: boolean;
}

export interface StaffUserProfile {
  uid: string;
  role: 'manager' | 'operator';
  branchId: string;
  fullName: string;
  username: string;
  active: boolean;
  permissions: StaffPermissions;
  createdAt?: Timestamp | null;
}

export interface SenderUserProfile {
  uid: string;
  role: 'sender';
  senderId: string;
  name: string;
  phone: string;
  createdAt?: Timestamp | null;
}

export type UserProfile = StaffUserProfile | SenderUserProfile;

export interface BranchPublic {
  branchId: string;
  name: string;
  area: string;
  city: string;
  phone: string;
  ownerUid: string;
  quotaFull: boolean;
  createdAt?: Timestamp | null;
}

export interface BranchPrivate {
  branchId: string;
  name: string;
  area: string;
  city: string;
  phone: string;
  storageQuotaMB: number;
  retentionDays: number;
  storageUsedBytes: number;
  ownerUid: string;
  createdAt?: Timestamp | null;
}

export interface DailyCodeDoc {
  code: string;
  date: string; // YYYY-MM-DD (UTC / Ghana time)
  branchId: string;
  createdBy: string;
  createdAt?: Timestamp | null;
}

export type SubmissionStatus =
  | 'Uploading'
  | 'Received'
  | 'Processing'
  | 'Ready for Printing'
  | 'Printing'
  | 'Printed'
  | 'Ready for Collection'
  | 'Collected';

export type PaymentMethod = 'Cash' | 'MoMo' | 'Bank Transfer' | 'Unpaid';

export type FileCategory = 'image' | 'pdf' | 'word' | 'excel' | 'ppt' | 'zip';

export interface SubmissionBilling {
  serviceType: string;
  copies: number;
  pages: number;
  unitPrice: number;
  totalAmount: number;
  amountPaid: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
}

export interface SubmissionFile {
  fileId: string;
  originalName: string;
  type: FileCategory;
  ext: string;
  sizeBytes: number;
  storagePath: string;
  pagesPreview: string;
}

export interface Submission {
  id: string;
  branchId: string;
  senderUid: string;
  senderId: string;
  senderName: string;
  customName: string;
  dailyCode: string;
  year: number;
  month: number; // 0..11
  day: number;
  date: string; // YYYY-MM-DD
  time: string;
  status: SubmissionStatus;
  assignedTo: string;
  billing: SubmissionBilling;
  files: SubmissionFile[];
  createdAt?: Timestamp | null;
}

export interface Expense {
  id: string;
  branchId: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  recordedBy: string;
  createdAt?: Timestamp | null;
}

export interface Activity {
  id: string;
  branchId: string;
  user: string;
  action: string;
  target: string;
  date: string;
  time: string;
  createdAt?: Timestamp | null;
}

export interface BranchNotification {
  id: string;
  branchId: string;
  type: 'submission' | 'payment' | 'code' | 'job' | 'system';
  title: string;
  msg: string;
  read: boolean;
  createdAt?: Timestamp | null;
}

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export type RouteId =
  | 'dashboard'
  | 'sent-files'
  | 'daily-codes'
  | 'printing-queue'
  | 'printing-history'
  | 'money-management'
  | 'expenses'
  | 'reports-analytics'
  | 'sender-management'
  | 'staff-management'
  | 'storage-settings'
  | 'notifications'
  | 'branch-settings'
  | 'sender-submit'
  | 'sender-history'
  | 'sender-branches'
  | 'account-settings';

export interface MonthCoverInfo {
  index: number;
  name: string;
  days: number;
  theme: string;
  icon: string;
  tagline: string;
  img: string;
}

export const MONTHS_DATA: MonthCoverInfo[] = [
  { index: 0, name: 'January', days: 31, theme: 'from-blue-900 via-indigo-800 to-cyan-700', icon: 'fa-snowflake', tagline: 'New Year Corporate Branding', img: 'https://images.unsplash.com/photo-1562654501-a0ccc0fc3fb1?auto=format&fit=crop&w=600&q=80' },
  { index: 1, name: 'February', days: 28, theme: 'from-rose-900 via-pink-800 to-amber-700', icon: 'fa-heart', tagline: 'Event Flyers & Luxury Invites', img: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=600&q=80' },
  { index: 2, name: 'March', days: 31, theme: 'from-emerald-900 via-teal-800 to-cyan-700', icon: 'fa-flag', tagline: 'Independence & Civic Prints', img: 'https://images.unsplash.com/photo-1503694978374-8a2fa686963a?auto=format&fit=crop&w=600&q=80' },
  { index: 3, name: 'April', days: 30, theme: 'from-violet-900 via-purple-800 to-indigo-700', icon: 'fa-book-open', tagline: 'Academic Journals & Programs', img: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80' },
  { index: 4, name: 'May', days: 31, theme: 'from-sky-900 via-blue-800 to-indigo-700', icon: 'fa-layer-group', tagline: 'Large Format Banners & Vinyl', img: 'https://images.unsplash.com/photo-1572949645841-094f3a9c4c94?auto=format&fit=crop&w=600&q=80' },
  { index: 5, name: 'June', days: 30, theme: 'from-amber-900 via-orange-800 to-yellow-700', icon: 'fa-graduation-cap', tagline: 'Graduation Brochures & Certificates', img: 'https://images.unsplash.com/photo-1589829085413-56de8ae18c73?auto=format&fit=crop&w=600&q=80' },
  { index: 6, name: 'July', days: 31, theme: 'from-cyan-900 via-blue-800 to-slate-800', icon: 'fa-newspaper', tagline: 'Mid-Year Annual Reports', img: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=600&q=80' },
  { index: 7, name: 'August', days: 31, theme: 'from-teal-900 via-emerald-800 to-green-700', icon: 'fa-id-card', tagline: 'Custom Packaging & Labels', img: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=600&q=80' },
  { index: 8, name: 'September', days: 30, theme: 'from-indigo-950 via-blue-900 to-sky-700', icon: 'fa-pen-nib', tagline: 'Back-to-School Exercise Books', img: 'https://images.unsplash.com/photo-1456735190827-d1262f71b8a3?auto=format&fit=crop&w=600&q=80' },
  { index: 9, name: 'October', days: 31, theme: 'from-orange-950 via-red-900 to-amber-700', icon: 'fa-palette', tagline: 'Campaign Posters & Stickers', img: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=600&q=80' },
  { index: 10, name: 'November', days: 30, theme: 'from-slate-900 via-blue-900 to-cyan-700', icon: 'fa-calendar-check', tagline: 'Calendars, Diaries & Souvenirs', img: 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=600&q=80' },
  { index: 11, name: 'December', days: 31, theme: 'from-red-950 via-rose-900 to-amber-700', icon: 'fa-gift', tagline: 'Festive Cards & Hampers Branding', img: 'https://images.unsplash.com/photo-1513885535751-8b9238bd345a?auto=format&fit=crop&w=600&q=80' }
];

export const JOB_STATUSES: Exclude<SubmissionStatus, 'Uploading'>[] = [
  'Received',
  'Processing',
  'Ready for Printing',
  'Printing',
  'Printed',
  'Ready for Collection',
  'Collected'
];

export const SERVICE_TYPES: string[] = [
  'Colour Printing',
  'Black-and-White Printing',
  'Photocopying',
  'Scanning',
  'Binding',
  'Lamination',
  'Large Format / Banner',
  'Other Printing Service'
];

export const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'MoMo', 'Bank Transfer', 'Unpaid'];

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export const ALLOWED_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'svg',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip'
];

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed'
];

export const ALL_STAFF_PERMISSIONS: StaffPermissions = {
  viewFiles: true,
  updateStatus: true,
  recordBilling: true,
  viewFinance: true,
  deleteFiles: true,
  manageCodes: true,
  manageStaff: true
};
