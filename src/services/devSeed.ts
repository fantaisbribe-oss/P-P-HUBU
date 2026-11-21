import {
  addBranchExpense,
  createOperatorAccount,
  createVerifiedDraftSubmission,
  finalizeDraftSubmission,
  registerManagerWithBranch,
  registerSenderAccount,
  signInSender,
  signInStaff,
  signOutUser,
  updateSubmissionOperations
} from './pphubService';
import { getGhanaDateParts } from '../utils/dates';

/**
 * DEV-ONLY DEMO FLAG (OFF by default in production and development).
 * To show quick demo buttons locally during development, set VITE_ENABLE_DEV_DEMO=true
 * in a local .env file. In production builds (import.meta.env.PROD), this is always false.
 */
export const ENABLE_DEV_DEMO_UI =
  import.meta.env.DEV && String(import.meta.env.VITE_ENABLE_DEV_DEMO || '').toLowerCase() === 'true';

/**
 * Fresh non-production credentials (do NOT reuse legacy plain-text demo passwords).
 */
export const DEV_SEED_ACCOUNTS = {
  fantaBranchId: 'FANTA-ACC',
  royalBranchId: 'ROYAL-KUM',
  fantaManager: { username: 'kwame.mgr', pass: 'FantaPress#2026!', fullName: 'Kwame Boateng' },
  fantaOpAma: { username: 'ama.op', pass: 'AmaPrint#2026!', fullName: 'Ama Serwaa' },
  fantaOpDaniel: { username: 'daniel.op', pass: 'DanPrint#2026!', fullName: 'Daniel Ofori' },
  royalManager: { username: 'abena.mgr', pass: 'RoyalPress#2026!', fullName: 'Abena Konadu' },
  senders: [
    { name: 'Kofi Mensah', phone: '024 555 0192', pin: '7391' },
    { name: 'Grace Asante (EventPlus)', phone: '055 890 1123', pin: '8462' },
    { name: 'Dr. Samuel Owusu', phone: '020 331 9980', pin: '9154' }
  ]
};

/**
 * One-time DEV-ONLY seed runner that creates two isolated branches, staff, three senders,
 * sample submissions, and sample expenses through the real Firebase Auth & Firestore rules.
 * Strictly blocked from running in production builds.
 */
export async function runDevOnlySeed(onProgress?: (msg: string) => void): Promise<{
  fantaCode: string;
  royalCode: string;
  senderIds: string[];
}> {
  if (!import.meta.env.DEV) {
    throw new Error('Seed script is strictly disabled in production builds.');
  }

  const log = (m: string) => {
    onProgress?.(m);
    console.info('[P&P-HUB DEV SEED]', m);
  };

  const { dateStr } = getGhanaDateParts();

  // 1. Register Branch 1: Fanta Digital Printing (Accra)
  log('Creating Fanta Digital Printing (FANTA-ACC) and manager...');
  let fantaCode = '';
  let fantaMgrProfile;
  try {
    const res = await registerManagerWithBranch({
      pressName: 'Fanta Digital Printing',
      area: 'Osu Oxford Street',
      city: 'Accra',
      phone: '+233 24 412 8890',
      fullName: DEV_SEED_ACCOUNTS.fantaManager.fullName,
      username: DEV_SEED_ACCOUNTS.fantaManager.username,
      password: DEV_SEED_ACCOUNTS.fantaManager.pass,
      customBranchId: DEV_SEED_ACCOUNTS.fantaBranchId
    });
    fantaCode = res.dailyCode;
    fantaMgrProfile = res.profile;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'auth/email-already-in-use') {
      fantaMgrProfile = await signInStaff(
        'manager',
        DEV_SEED_ACCOUNTS.fantaBranchId,
        DEV_SEED_ACCOUNTS.fantaManager.username,
        DEV_SEED_ACCOUNTS.fantaManager.pass
      );
    } else {
      throw err;
    }
  }

  // 2. Provision operators for Branch 1 while manager is signed in
  log('Provisioning Fanta Digital Printing operators (Ama & Daniel)...');
  for (const op of [
    { ...DEV_SEED_ACCOUNTS.fantaOpAma, viewFinance: false, recordBilling: true },
    { ...DEV_SEED_ACCOUNTS.fantaOpDaniel, viewFinance: false, recordBilling: false }
  ]) {
    try {
      await createOperatorAccount({
        branchId: DEV_SEED_ACCOUNTS.fantaBranchId,
        managerName: fantaMgrProfile.fullName,
        fullName: op.fullName,
        username: op.username,
        password: op.pass,
        viewFinance: op.viewFinance,
        recordBilling: op.recordBilling
      });
    } catch (err) {
      if ((err as { code?: string })?.code !== 'auth/email-already-in-use') {
        throw err;
      }
    }
  }

  // Record sample expenses for Branch 1
  log('Recording sample expenses for Fanta Digital Printing...');
  await addBranchExpense({
    branchId: DEV_SEED_ACCOUNTS.fantaBranchId,
    category: 'Toner & Ink Cartridges',
    description: 'CMYK Laser Toner Refill Pack',
    amount: 420,
    recordedBy: fantaMgrProfile.fullName
  });
  await addBranchExpense({
    branchId: DEV_SEED_ACCOUNTS.fantaBranchId,
    category: 'Paper Stock & Card',
    description: '5 Boxes A4 80gsm Bond Paper',
    amount: 310,
    recordedBy: fantaMgrProfile.fullName
  });

  await signOutUser();

  // 3. Register Branch 2: Royal Press Kumasi
  log('Creating Royal Press Kumasi (ROYAL-KUM) and manager...');
  let royalCode = '';
  try {
    const res2 = await registerManagerWithBranch({
      pressName: 'Royal Press Kumasi',
      area: 'Adum Central',
      city: 'Kumasi',
      phone: '+233 20 881 3340',
      fullName: DEV_SEED_ACCOUNTS.royalManager.fullName,
      username: DEV_SEED_ACCOUNTS.royalManager.username,
      password: DEV_SEED_ACCOUNTS.royalManager.pass,
      customBranchId: DEV_SEED_ACCOUNTS.royalBranchId
    });
    royalCode = res2.dailyCode;
    await addBranchExpense({
      branchId: DEV_SEED_ACCOUNTS.royalBranchId,
      category: 'Paper Stock & Card',
      description: 'Glossy Art Card 300gsm Pack',
      amount: 250,
      recordedBy: res2.profile.fullName
    });
  } catch (err) {
    if ((err as { code?: string })?.code !== 'auth/email-already-in-use') {
      throw err;
    }
  }

  await signOutUser();

  // 4. Register 3 Senders & submit sample print jobs using today's real UTC daily codes
  log('Registering 3 sample senders and submitting sample jobs...');
  const senderIds: string[] = [];
  const createdSubIds: { branchId: string; subId: string; draft: Awaited<ReturnType<typeof createVerifiedDraftSubmission>> }[] = [];

  for (let i = 0; i < DEV_SEED_ACCOUNTS.senders.length; i++) {
    const s = DEV_SEED_ACCOUNTS.senders[i];
    let profile;
    try {
      profile = await registerSenderAccount(s);
    } catch {
      profile = await signInSender(s.name, s.pin);
    }
    senderIds.push(profile.senderId);

    if (i === 0 && fantaCode) {
      const draft = await createVerifiedDraftSubmission({
        branchId: DEV_SEED_ACCOUNTS.fantaBranchId,
        dailyCode: fantaCode,
        sender: profile
      });
      await finalizeDraftSubmission({
        draft,
        customName: 'Royal Wedding Gold Invitation & Program',
        senderName: profile.name,
        files: [
          {
            fileId: 'FIL-DEMO-1',
            originalName: 'Wedding_Order_of_Service.pdf',
            type: 'pdf',
            ext: 'PDF',
            sizeBytes: 0,
            storagePath: '',
            pagesPreview: 'Sample seeded record (upload a real file to test Cloud Storage previews)'
          }
        ]
      });
      createdSubIds.push({ branchId: DEV_SEED_ACCOUNTS.fantaBranchId, subId: draft.id, draft });
    }

    if (i === 1 && royalCode) {
      const draft = await createVerifiedDraftSubmission({
        branchId: DEV_SEED_ACCOUNTS.royalBranchId,
        dailyCode: royalCode,
        sender: profile
      });
      await finalizeDraftSubmission({
        draft,
        customName: 'Kumasi Trade Fair Promotional Flyers',
        senderName: profile.name,
        files: [
          {
            fileId: 'FIL-DEMO-2',
            originalName: 'Kumasi_Expo_Flyer_A5.pdf',
            type: 'pdf',
            ext: 'PDF',
            sizeBytes: 0,
            storagePath: '',
            pagesPreview: 'Sample seeded record for Royal Press Kumasi branch isolation test'
          }
        ]
      });
      createdSubIds.push({ branchId: DEV_SEED_ACCOUNTS.royalBranchId, subId: draft.id, draft });
    }

    await signOutUser();
  }

  // 5. Sign back in as Branch 1 manager and record billing on sample submission
  if (createdSubIds[0]) {
    const mgr = await signInStaff(
      'manager',
      DEV_SEED_ACCOUNTS.fantaBranchId,
      DEV_SEED_ACCOUNTS.fantaManager.username,
      DEV_SEED_ACCOUNTS.fantaManager.pass
    );
    await updateSubmissionOperations({
      submission: { ...createdSubIds[0].draft, status: 'Received' },
      staff: mgr,
      newStatus: 'Printing',
      newBilling: {
        serviceType: 'Colour Printing',
        copies: 150,
        pages: 4,
        unitPrice: 2.5,
        totalAmount: 375,
        amountPaid: 250,
        paymentMethod: 'MoMo',
        paymentDate: dateStr
      }
    });
    await signOutUser();
  }

  log('Seed complete! Signed out cleanly.');
  return { fantaCode, royalCode, senderIds };
}

// Expose dev-only helper on window solely during local development
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __pphubSeedDevData?: typeof runDevOnlySeed }).__pphubSeedDevData = runDevOnlySeed;
}
