/**
 * Seed texts of the notification templates (NOTIFICATIONS.md §6): the Phase 1 events of §4.1 and
 * §4.2. Loaded into notification_templates by the base seed; officials edit them later through the
 * admin screens, each change a new version. Variables use {{name}}; numbers and dates are formatted
 * with English digits before rendering (UX-05). SMS texts carry no personal data except the
 * recipient's own code. Later phases add their keys here. The Bengali texts are reviewed by the
 * owner in T1.14.
 */
export type NotificationChannel = 'in_app' | 'email' | 'sms';
export type Locale = 'bn' | 'en';

interface Text {
  subject?: string;
  title?: string;
  body: string;
}

export interface NotificationTemplateSeed {
  key: string;
  variables: string[];
  channels: Partial<Record<NotificationChannel, Record<Locale, Text>>>;
}

const inApp = (bn: Text, en: Text) => ({ in_app: { bn, en } });

export const NOTIFICATION_TEMPLATES: NotificationTemplateSeed[] = [
  // ---- 4.1 Registration, accounts and security ----
  {
    key: 'otp_registration_sms',
    variables: ['code', 'minutes'],
    channels: {
      sms: {
        bn: {
          body: 'আপনার নিবন্ধন যাচাই কোড {{code}}। কোডটি {{minutes}} মিনিট বৈধ। কাউকে জানাবেন না।',
        },
        en: {
          body: 'Your registration code is {{code}}. It is valid for {{minutes}} minutes. Do not share it.',
        },
      },
    },
  },
  {
    key: 'otp_registration_email',
    variables: ['code', 'minutes'],
    channels: {
      email: {
        bn: {
          subject: 'নিবন্ধনের ইমেইল যাচাই কোড',
          body: 'আপনার ইমেইল যাচাই কোড {{code}}। কোডটি {{minutes}} মিনিট বৈধ। আপনি নিবন্ধন না করে থাকলে এই ইমেইলটি উপেক্ষা করুন।',
        },
        en: {
          subject: 'Email verification code for your registration',
          body: 'Your email verification code is {{code}}. It is valid for {{minutes}} minutes. If you did not register, ignore this email.',
        },
      },
    },
  },
  {
    key: 'otp_password_reset',
    variables: ['code', 'minutes'],
    channels: {
      sms: {
        bn: {
          body: 'পাসওয়ার্ড রিসেট কোড {{code}}। কোডটি {{minutes}} মিনিট বৈধ। কাউকে জানাবেন না।',
        },
        en: {
          body: 'Your password reset code is {{code}}. It is valid for {{minutes}} minutes. Do not share it.',
        },
      },
      email: {
        bn: {
          subject: 'পাসওয়ার্ড রিসেট কোড',
          body: 'আপনার পাসওয়ার্ড রিসেট কোড {{code}}। কোডটি {{minutes}} মিনিট বৈধ। আপনি অনুরোধ না করে থাকলে এই ইমেইলটি উপেক্ষা করুন এবং দরকার হলে মনিটরিং টিমকে জানান।',
        },
        en: {
          subject: 'Password reset code',
          body: 'Your password reset code is {{code}}. It is valid for {{minutes}} minutes. If you did not ask for it, ignore this email and tell the Monitoring Team if needed.',
        },
      },
    },
  },
  {
    key: 'otp_contact_change',
    variables: ['code', 'minutes'],
    channels: {
      sms: {
        bn: {
          body: 'নতুন মোবাইল নম্বর যাচাই কোড {{code}}। কোডটি {{minutes}} মিনিট বৈধ। কাউকে জানাবেন না।',
        },
        en: {
          body: 'Your code for the new mobile number is {{code}}. It is valid for {{minutes}} minutes. Do not share it.',
        },
      },
      email: {
        bn: {
          subject: 'নতুন ইমেইল যাচাই কোড',
          body: 'আপনার নতুন ইমেইল যাচাই কোড {{code}}। কোডটি {{minutes}} মিনিট বৈধ। আপনি অনুরোধ না করে থাকলে এই ইমেইলটি উপেক্ষা করুন।',
        },
        en: {
          subject: 'Verification code for your new email',
          body: 'Your verification code for the new email is {{code}}. It is valid for {{minutes}} minutes. If you did not ask for it, ignore this email.',
        },
      },
    },
  },
  {
    key: 'registration_pending',
    variables: ['applicant_name', 'region_name'],
    channels: inApp(
      {
        title: 'নতুন নিবন্ধন অপেক্ষমাণ',
        body: '{{region_name}} থেকে {{applicant_name}} নিবন্ধন করেছেন। যাচাই করে অনুমোদন দিন।',
      },
      {
        title: 'New registration waiting',
        body: '{{applicant_name}} from {{region_name}} has registered. Please review and approve.',
      },
    ),
  },
  {
    key: 'registration_correction_requested',
    variables: ['field_name', 'note'],
    channels: inApp(
      { title: 'নিবন্ধনে সংশোধন দরকার', body: '"{{field_name}}" সংশোধন করতে বলা হয়েছে: {{note}}' },
      {
        title: 'Correction needed in your registration',
        body: 'Please correct "{{field_name}}": {{note}}',
      },
    ),
  },
  {
    key: 'registration_approved',
    variables: [],
    channels: inApp(
      {
        title: 'নিবন্ধন অনুমোদিত',
        body: 'আপনার নিবন্ধন অনুমোদিত হয়েছে। এখন আপনি সিস্টেম ব্যবহার করতে পারবেন।',
      },
      {
        title: 'Registration approved',
        body: 'Your registration has been approved. You can now use the system.',
      },
    ),
  },
  {
    key: 'registration_rejected',
    variables: ['reason'],
    channels: inApp(
      { title: 'নিবন্ধন গৃহীত হয়নি', body: 'আপনার নিবন্ধন গৃহীত হয়নি। কারণ: {{reason}}' },
      {
        title: 'Registration not accepted',
        body: 'Your registration was not accepted. Reason: {{reason}}',
      },
    ),
  },
  {
    key: 'staff_registration_pending',
    variables: ['applicant_name'],
    channels: {
      ...inApp(
        {
          title: 'কর্মীর নিবন্ধন অপেক্ষমাণ',
          body: '{{applicant_name}} কর্মী হিসেবে নিবন্ধন করেছেন। যাচাই করে অনুমোদন দিন।',
        },
        {
          title: 'Staff registration waiting',
          body: '{{applicant_name}} has registered as staff. Please review and approve.',
        },
      ),
      email: {
        bn: {
          subject: 'কর্মীর নিবন্ধন অপেক্ষমাণ',
          body: '{{applicant_name}} কর্মী হিসেবে নিবন্ধন করেছেন। সিস্টেমে লগইন করে যাচাই ও অনুমোদন দিন।',
        },
        en: {
          subject: 'Staff registration waiting',
          body: '{{applicant_name}} has registered as staff. Please log in to review and approve.',
        },
      },
    },
  },
  {
    key: 'edit_request_submitted',
    variables: ['volunteer_name', 'field_name'],
    channels: inApp(
      {
        title: 'প্রোফাইল সম্পাদনার অনুরোধ',
        body: '{{volunteer_name}} "{{field_name}}" বদলানোর অনুরোধ করেছেন।',
      },
      {
        title: 'Profile edit request',
        body: '{{volunteer_name}} asked to change "{{field_name}}".',
      },
    ),
  },
  {
    key: 'edit_request_approved',
    variables: ['field_name'],
    channels: inApp(
      { title: 'সম্পাদনার অনুরোধ অনুমোদিত', body: '"{{field_name}}" এখন বদলানো যাবে।' },
      { title: 'Edit request approved', body: 'You can now change "{{field_name}}".' },
    ),
  },
  {
    key: 'permission_changed',
    variables: ['summary'],
    channels: inApp(
      {
        title: 'আপনার অনুমতি পরিবর্তিত হয়েছে',
        body: 'আপনার ভূমিকা বা অনুমতিতে পরিবর্তন হয়েছে: {{summary}}',
      },
      { title: 'Your permissions changed', body: 'Your role or permissions changed: {{summary}}' },
    ),
  },
  {
    key: 'account_blocked',
    variables: [],
    channels: inApp(
      {
        title: 'অ্যাকাউন্ট ব্লক করা হয়েছে',
        body: 'আপনার অ্যাকাউন্ট ব্লক করা হয়েছে। বিস্তারিত জানতে আপনার রিজিওনাল প্রোগ্রাম ম্যানেজারের সাথে যোগাযোগ করুন।',
      },
      {
        title: 'Account blocked',
        body: 'Your account has been blocked. Contact your Regional Program Manager for details.',
      },
    ),
  },
  {
    key: 'account_unblocked',
    variables: [],
    channels: inApp(
      { title: 'অ্যাকাউন্ট আবার চালু', body: 'আপনার অ্যাকাউন্টের ব্লক তুলে নেওয়া হয়েছে।' },
      { title: 'Account unblocked', body: 'The block on your account has been lifted.' },
    ),
  },
  {
    key: 'session_revoked',
    variables: ['device_name'],
    channels: inApp(
      {
        title: 'একটি ডিভাইস থেকে লগআউট করা হয়েছে',
        body: '"{{device_name}}" ডিভাইসের সেশন একজন অফিসিয়াল বন্ধ করেছেন। সেটি আপনার না হলে আপনার রিজিওনাল প্রোগ্রাম ম্যানেজারকে জানান।',
      },
      {
        title: 'A device was logged out',
        body: 'An official ended the session on "{{device_name}}". If this was not your device, tell your Regional Program Manager.',
      },
    ),
  },
  {
    key: 'account_locked',
    variables: ['minutes'],
    channels: inApp(
      {
        title: 'অ্যাকাউন্ট সাময়িক বন্ধ',
        body: 'বারবার ভুল পাসওয়ার্ড দেওয়ায় আপনার অ্যাকাউন্ট {{minutes}} মিনিটের জন্য বন্ধ ছিল।',
      },
      {
        title: 'Account temporarily locked',
        body: 'Your account was locked for {{minutes}} minutes after repeated wrong passwords.',
      },
    ),
  },
  {
    key: 'security_lockout_alert',
    variables: ['count', 'date'],
    channels: {
      email: {
        bn: {
          subject: 'নিরাপত্তা সতর্কতা: অনেক অ্যাকাউন্ট লক',
          body: '{{date}} তারিখে {{count}} বার অ্যাকাউন্ট লক হয়েছে। অডিট লগ দেখে কারণ যাচাই করুন।',
        },
        en: {
          subject: 'Security alert: many account lockouts',
          body: 'There were {{count}} account lockouts on {{date}}. Please check the audit log for the cause.',
        },
      },
    },
  },
  {
    key: 'security_refresh_reuse',
    variables: ['user_name'],
    channels: {
      ...inApp(
        {
          title: 'নিরাপত্তা সতর্কতা',
          body: 'আপনার একটি সেশনের টোকেন আবার ব্যবহারের চেষ্টা হয়েছে, তাই সব ডিভাইস থেকে লগআউট করা হয়েছে। আবার লগইন করুন এবং পাসওয়ার্ড বদলান।',
        },
        {
          title: 'Security alert',
          body: 'A token of one of your sessions was used again, so all your devices were logged out. Log in again and change your password.',
        },
      ),
      email: {
        bn: {
          subject: 'নিরাপত্তা সতর্কতা: টোকেন পুনর্ব্যবহার',
          body: '{{user_name}}-এর একটি রিফ্রেশ টোকেন আবার ব্যবহারের চেষ্টা হয়েছে। সব সেশন বন্ধ করা হয়েছে; অডিট লগ দেখুন।',
        },
        en: {
          subject: 'Security alert: token reuse',
          body: 'A refresh token of {{user_name}} was used again. All sessions were ended; please check the audit log.',
        },
      },
    },
  },
  {
    key: 'handover_items_assigned',
    variables: ['from_name', 'count'],
    channels: {
      ...inApp(
        {
          title: 'হস্তান্তরিত কাজ',
          body: '{{from_name}}-এর {{count}}টি কাজ আপনাকে দেওয়া হয়েছে।',
        },
        {
          title: 'Handed-over work',
          body: '{{count}} items of {{from_name}} have been assigned to you.',
        },
      ),
      email: {
        bn: {
          subject: 'আপনাকে কাজ হস্তান্তর করা হয়েছে',
          body: '{{from_name}}-এর {{count}}টি কাজ আপনাকে দেওয়া হয়েছে। সিস্টেমে "আমার কাজ" দেখুন।',
        },
        en: {
          subject: 'Work has been handed over to you',
          body: '{{count}} items of {{from_name}} have been assigned to you. See "My Work" in the system.',
        },
      },
    },
  },
  {
    key: 'handover_completed',
    variables: ['from_name'],
    channels: inApp(
      {
        title: 'হস্তান্তর সম্পন্ন',
        body: '{{from_name}}-এর সব কাজ হস্তান্তর হয়েছে এবং অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে।',
      },
      {
        title: 'Handover completed',
        body: 'All work of {{from_name}} has been handed over and the account has been deactivated.',
      },
    ),
  },
  {
    key: 'system_owner_transferred',
    variables: ['previous_name', 'new_name'],
    channels: {
      ...inApp(
        {
          title: 'মেইন অ্যাডমিন বদল',
          body: 'মেইন অ্যাডমিনের দায়িত্ব {{previous_name}} থেকে {{new_name}}-এর কাছে গেছে।',
        },
        {
          title: 'Main Admin changed',
          body: 'The Main Admin role moved from {{previous_name}} to {{new_name}}.',
        },
      ),
      email: {
        bn: {
          subject: 'মেইন অ্যাডমিন বদল',
          body: 'মেইন অ্যাডমিনের দায়িত্ব {{previous_name}} থেকে {{new_name}}-এর কাছে গেছে। আপনি এটি না করে থাকলে এখনই মনিটরিং টিমকে জানান।',
        },
        en: {
          subject: 'Main Admin changed',
          body: 'The Main Admin role moved from {{previous_name}} to {{new_name}}. If you did not do this, tell the Monitoring Team now.',
        },
      },
    },
  },
  // ---- 4.2 Projects, assignment and consent ----
  {
    key: 'project_activated',
    variables: ['project_name'],
    channels: inApp(
      { title: 'প্রকল্প চালু হয়েছে', body: '"{{project_name}}" প্রকল্প চালু হয়েছে।' },
      { title: 'Project activated', body: 'The project "{{project_name}}" is now active.' },
    ),
  },
  {
    key: 'project_assignment',
    variables: ['project_name'],
    channels: inApp(
      {
        title: 'নতুন প্রকল্পে আমন্ত্রণ',
        body: 'আপনাকে "{{project_name}}" প্রকল্পে যুক্ত করা হয়েছে। নিয়মগুলো পড়ে সম্মতি দিন।',
      },
      {
        title: 'Invitation to a project',
        body: 'You have been added to the project "{{project_name}}". Please read the rules and give your consent.',
      },
    ),
  },
  {
    key: 'project_consent_result',
    variables: ['volunteer_name', 'project_name', 'result'],
    channels: inApp(
      {
        title: 'প্রকল্পে সম্মতির ফল',
        body: '{{volunteer_name}} "{{project_name}}" প্রকল্পে {{result}}।',
      },
      {
        title: 'Project consent result',
        body: '{{volunteer_name}} has {{result}} the project "{{project_name}}".',
      },
    ),
  },
  {
    key: 'team_member_added',
    variables: ['lead_name', 'project_name'],
    channels: inApp(
      {
        title: 'টিমে যুক্ত হয়েছেন',
        body: '{{lead_name}} আপনাকে "{{project_name}}" প্রকল্পের টিমে যুক্ত করেছেন।',
      },
      {
        title: 'Added to a team',
        body: '{{lead_name}} has added you to the team for "{{project_name}}".',
      },
    ),
  },
  {
    key: 'deadline_extended',
    variables: ['project_name', 'new_date'],
    channels: inApp(
      {
        title: 'আবেদনের সময় বাড়ানো হয়েছে',
        body: '"{{project_name}}" প্রকল্পে আবেদনের শেষ তারিখ বাড়িয়ে {{new_date}} করা হয়েছে।',
      },
      {
        title: 'Application deadline extended',
        body: 'The application deadline of "{{project_name}}" is now {{new_date}}.',
      },
    ),
  },
  {
    key: 'project_closing',
    variables: ['project_name'],
    channels: inApp(
      {
        title: 'প্রকল্প সমাপ্তির পথে',
        body: '"{{project_name}}" প্রকল্পে নতুন আবেদন বন্ধ; চলমান কাজ শেষ করুন।',
      },
      {
        title: 'Project is closing',
        body: 'New applications for "{{project_name}}" have stopped; please finish the open work.',
      },
    ),
  },
  {
    key: 'project_closed',
    variables: ['project_name'],
    channels: inApp(
      {
        title: 'প্রকল্প বন্ধ হয়েছে',
        body: '"{{project_name}}" প্রকল্প বন্ধ হয়েছে। এখন শুধু ফলো-আপ যোগ করা যাবে।',
      },
      {
        title: 'Project closed',
        body: 'The project "{{project_name}}" is closed. Only follow-ups can be added now.',
      },
    ),
  },
  {
    key: 'project_reopened',
    variables: ['project_name', 'reason'],
    channels: inApp(
      {
        title: 'প্রকল্প আবার খোলা হয়েছে',
        body: '"{{project_name}}" প্রকল্প আবার খোলা হয়েছে। কারণ: {{reason}}',
      },
      {
        title: 'Project reopened',
        body: 'The project "{{project_name}}" has been reopened. Reason: {{reason}}',
      },
    ),
  },
  {
    key: 'project_grant_changed',
    variables: ['project_name', 'summary'],
    channels: inApp(
      {
        title: 'প্রকল্পে অনুমতি পরিবর্তন',
        body: '"{{project_name}}" প্রকল্পে আপনার অনুমতি পরিবর্তিত হয়েছে: {{summary}}',
      },
      {
        title: 'Project permission changed',
        body: 'Your permissions on "{{project_name}}" changed: {{summary}}',
      },
    ),
  },
];

/** Placeholders used in a text, e.g. "{{code}}" → "code". */
export function templateVariables(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1] as string);
}
