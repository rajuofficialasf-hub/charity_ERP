/**
 * Seed texts of the notification templates (NOTIFICATIONS.md §6): the Phase 1 events of §4.1 and
 * §4.2. Loaded into notification_templates by the base seed; officials edit them later through the
 * admin screens, each change a new version. Variables use {{name}}; numbers and dates are formatted
 * with English digits before rendering (UX-05). SMS texts carry no personal data except the
 * recipient's own code. An in-app text never names another person (only what happened, the project
 * and counts; docs/DECISION_LOG.md, the notifications decision of 2026-10-18): emails to officials
 * may. A variable may be bilingual data ({ bn, en }); it is shown in the reader's language. Later
 * phases add their keys here.
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
    // the set-password link of an official created by the admin (DECISION_LOG D-097)
    key: 'staff_invitation',
    variables: ['name', 'job_id', 'link', 'hours'],
    channels: {
      email: {
        bn: {
          subject: 'CSS ERP-এ আপনার অ্যাকাউন্ট',
          body: 'আসসালামু আলাইকুম {{name}},\n\nচ্যারিটি এন্ড সোশ্যাল সার্ভিস ডিপার্টমেন্টের ERP-তে আপনার জন্য একটি অ্যাকাউন্ট তৈরি করা হয়েছে। আপনার Job ID: {{job_id}}\n\nনিচের লিঙ্কে গিয়ে পাসওয়ার্ড দিন। লিঙ্কটি {{hours}} ঘণ্টা বৈধ এবং একবারই ব্যবহার করা যাবে:\n{{link}}\n\nএরপর Job ID ও পাসওয়ার্ড দিয়ে লগিন করবেন। আপনি এই অ্যাকাউন্টের কথা না জানলে ইমেইলটি উপেক্ষা করুন।',
        },
        en: {
          subject: 'Your CSS ERP account',
          body: 'Assalamu alaikum {{name}},\n\nAn account has been created for you in the ERP of the Charity & Social Service Department. Your job ID: {{job_id}}\n\nOpen the link below and choose a password. The link is valid for {{hours}} hours and works once:\n{{link}}\n\nThen log in with your job ID and password. If you do not know about this account, ignore this email.',
        },
      },
    },
  },
  {
    key: 'registration_pending',
    variables: ['region_name'],
    channels: inApp(
      {
        title: 'নতুন নিবন্ধন অপেক্ষমাণ',
        body: '{{region_name}} থেকে একটি নতুন নিবন্ধন এসেছে। যাচাই করে অনুমোদন দিন।',
      },
      {
        title: 'New registration waiting',
        body: 'A new registration from {{region_name}} is waiting. Please review and approve.',
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
          body: 'একজন কর্মী নিবন্ধন করেছেন। যাচাই করে অনুমোদন দিন।',
        },
        {
          title: 'Staff registration waiting',
          body: 'A staff member has registered. Please review and approve.',
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
    variables: ['field_name'],
    channels: inApp(
      {
        title: 'প্রোফাইল সম্পাদনার অনুরোধ',
        body: 'একজন স্বেচ্ছাসেবক "{{field_name}}" বদলানোর অনুরোধ করেছেন।',
      },
      {
        title: 'Profile edit request',
        body: 'A volunteer asked to change "{{field_name}}".',
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
    key: 'edit_request_closed',
    variables: ['field_name'],
    channels: inApp(
      {
        title: 'সম্পাদনার অনুরোধ বন্ধ',
        body: '"{{field_name}}" বদলানোর অনুরোধটি বন্ধ করা হয়েছে।',
      },
      { title: 'Edit request closed', body: 'Your request to change "{{field_name}}" was closed.' },
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
          body: 'আপনার একটি সেশনের টোকেন আবার ব্যবহারের চেষ্টা হয়েছে, তাই সেই ডিভাইসের সেশন বন্ধ করা হয়েছে। আবার লগইন করুন এবং পাসওয়ার্ড বদলান।',
        },
        {
          title: 'Security alert',
          body: 'A token of one of your sessions was used again, so the session on that device was ended. Log in again and change your password.',
        },
      ),
      email: {
        bn: {
          subject: 'নিরাপত্তা সতর্কতা: টোকেন পুনর্ব্যবহার',
          body: '{{user_name}}-এর একটি রিফ্রেশ টোকেন আবার ব্যবহারের চেষ্টা হয়েছে। সেই সেশন বন্ধ করা হয়েছে; অডিট লগ দেখুন।',
        },
        en: {
          subject: 'Security alert: token reuse',
          body: 'A refresh token of {{user_name}} was used again. That session was ended; please check the audit log.',
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
          body: '{{count}}টি কাজ আপনাকে হস্তান্তর করা হয়েছে।',
        },
        {
          title: 'Handed-over work',
          body: '{{count}} items have been handed over to you.',
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
    variables: ['count'],
    channels: inApp(
      {
        title: 'হস্তান্তর সম্পন্ন',
        body: 'একজন অফিসিয়ালের {{count}}টি কাজ হস্তান্তর হয়েছে এবং অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে।',
      },
      {
        title: 'Handover completed',
        body: '{{count}} items of an official were handed over and the account was deactivated.',
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
          body: 'মেইন অ্যাডমিনের দায়িত্ব অন্য একজনের কাছে গেছে।',
        },
        {
          title: 'Main Admin changed',
          body: 'The Main Admin role has moved to another person.',
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
    variables: ['project_name', 'result'],
    channels: inApp(
      {
        title: 'প্রকল্পে সম্মতির ফল',
        body: '"{{project_name}}" প্রকল্পে একজন স্বেচ্ছাসেবক {{result}}।',
      },
      {
        title: 'Project consent result',
        body: 'A volunteer has {{result}} the project "{{project_name}}".',
      },
    ),
  },
  {
    key: 'team_member_added',
    variables: ['project_name'],
    channels: inApp(
      {
        title: 'টিমে যুক্ত হয়েছেন',
        body: 'আপনাকে "{{project_name}}" প্রকল্পের একটি টিমে যুক্ত করা হয়েছে।',
      },
      {
        title: 'Added to a team',
        body: 'You have been added to a team for "{{project_name}}".',
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
    variables: ['project_name'],
    channels: inApp(
      {
        title: 'প্রকল্প আবার খোলা হয়েছে',
        body: '"{{project_name}}" প্রকল্প আবার খোলা হয়েছে। কারণ প্রকল্পের পাতায় দেখুন।',
      },
      {
        title: 'Project reopened',
        body: 'The project "{{project_name}}" has been reopened. See the project page for the reason.',
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
  // ---- 4.5 Operations alerts from launch ----
  {
    key: 'ops_alert',
    variables: ['count'],
    channels: inApp(
      {
        title: 'বার্তা পাঠানো যায়নি',
        body: '{{count}}টি ইমেইল বা SMS বারবার চেষ্টার পরও পাঠানো যায়নি। ডেলিভারির পাতায় কারণ দেখুন।',
      },
      {
        title: 'Messages could not be sent',
        body: '{{count}} emails or SMS could not be sent after repeated tries. See the deliveries page for the cause.',
      },
    ),
  },
  // ---- 4.3 Applications ----
  {
    key: 'application_submitted',
    variables: ['project_name'],
    channels: inApp(
      {
        title: 'নতুন আবেদন এসেছে',
        body: '"{{project_name}}" প্রকল্পে নতুন আবেদন এসেছে। রিভিউ করুন।',
      },
      {
        title: 'New application',
        body: 'A new application has arrived in the project "{{project_name}}". Please review it.',
      },
    ),
  },
  {
    key: 'application_reviewed',
    variables: ['project_name'],
    channels: {
      ...inApp(
        {
          title: 'অনুমোদনের অপেক্ষায় আবেদন',
          body: '"{{project_name}}" প্রকল্পে একটি আবেদন রিভিউ শেষে অনুমোদনের অপেক্ষায় আছে।',
        },
        {
          title: 'Application awaiting approval',
          body: 'An application in the project "{{project_name}}" has been reviewed and awaits approval.',
        },
      ),
      email: {
        bn: {
          subject: 'অনুমোদনের অপেক্ষায় আবেদন: {{project_name}}',
          body: '"{{project_name}}" প্রকল্পে একটি আবেদন রিভিউ শেষে অনুমোদনের অপেক্ষায় আছে। সিস্টেমে ঢুকে সিদ্ধান্ত দিন।',
        },
        en: {
          subject: 'Application awaiting approval: {{project_name}}',
          body: 'An application in the project "{{project_name}}" has been reviewed and awaits approval. Sign in to decide.',
        },
      },
    },
  },
  {
    key: 'application_approved',
    variables: ['project_name'],
    channels: inApp(
      {
        title: 'আবেদন অনুমোদিত',
        body: '"{{project_name}}" প্রকল্পে আপনার আবেদনটি অনুমোদিত হয়েছে।',
      },
      {
        title: 'Application approved',
        body: 'Your application in the project "{{project_name}}" has been approved.',
      },
    ),
  },
  {
    key: 'application_rejected',
    variables: ['project_name', 'message'],
    channels: inApp(
      {
        title: 'আবেদন গৃহীত হয়নি',
        body: '"{{project_name}}" প্রকল্পে আপনার আবেদনটি এবার গৃহীত হয়নি। {{message}}',
      },
      {
        title: 'Application not accepted',
        body: 'Your application in the project "{{project_name}}" was not accepted this time. {{message}}',
      },
    ),
  },
  {
    key: 'application_waitlisted',
    variables: ['project_name'],
    channels: inApp(
      {
        title: 'আবেদন অপেক্ষমাণ তালিকায়',
        body: '"{{project_name}}" প্রকল্পে আপনার আবেদনটি এখন অপেক্ষমাণ তালিকায় আছে। সুযোগ এলে অফিস অনুমোদন দেবে, তখন জানানো হবে।',
      },
      {
        title: 'Application on the waitlist',
        body: 'Your application in the project "{{project_name}}" is now on the waitlist. When a place opens, the office will approve it and you will be told.',
      },
    ),
  },
  {
    key: 'application_reopened',
    variables: ['project_name'],
    channels: inApp(
      {
        title: 'আবেদন আবার বিবেচনায়',
        body: '"{{project_name}}" প্রকল্পে আপনার আবেদনটি আবার বিবেচনা করা হচ্ছে।',
      },
      {
        title: 'Application reconsidered',
        body: 'Your application in the project "{{project_name}}" is being considered again.',
      },
    ),
  },
];

/** Variables that name a person; an in-app text never uses them (only emails to officials may). */
export const PERSON_VARIABLES: readonly string[] = [
  'name',
  'applicant_name',
  'volunteer_name',
  'user_name',
  'from_name',
  'previous_name',
  'new_name',
  'lead_name',
];

/**
 * Sample values of every declared variable, for the template preview in both languages; numbers
 * are numbers and bilingual data is { bn, en } as at a real event.
 */
export const TEMPLATE_SAMPLES: Record<string, string | number | { bn: string; en: string }> = {
  code: '123456',
  minutes: 5,
  hours: 72,
  name: 'নমুনা নাম',
  job_id: 'CSS-123',
  link: 'https://erp.example.org/invite#token',
  region_name: { bn: 'ঢাকা বিভাগ', en: 'Dhaka division' },
  applicant_name: 'নমুনা আবেদনকারী',
  field_name: { bn: 'মোবাইল নম্বর', en: 'Mobile number' },
  note: 'সঠিক নম্বর দিন',
  reason: 'নমুনা কারণ',
  summary: { bn: 'অনুমোদনের অনুমতি যোগ হয়েছে', en: 'the approval permission was added' },
  device_name: 'Pixel 7',
  count: 3,
  date: '17-10-2026',
  user_name: 'নমুনা ব্যবহারকারী',
  from_name: 'নমুনা অফিসিয়াল',
  previous_name: 'নমুনা আগের জন',
  new_name: 'নমুনা নতুন জন',
  project_name: { bn: 'শীতবস্ত্র 2026', en: 'Winter Clothing 2026' },
  message: 'এবার সম্ভব হলো না',
  result: { bn: 'সম্মতি দিয়েছেন', en: 'accepted' },
  new_date: '31-12-2026',
};

/** A {{name}} placeholder; the renderer and the editor's check read the same pattern. */
export const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

/** Placeholders used in a text, e.g. "{{code}}" → "code". */
export function templateVariables(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1] as string);
}

/**
 * The values an in-app row may keep: what happened, the place, the project, counts, the reader's
 * own text and the record ids of the link. Anything else, a person's name above all, is left out.
 */
export const IN_APP_PARAMS: readonly string[] = [
  'count',
  'minutes',
  'date',
  'new_date',
  'region_name',
  'field_name',
  'project_name',
  'result',
  'reason',
  'note',
  'summary',
  'device_name',
  'message',
  'userId',
  'projectId',
  'applicationId',
];

export function inAppParams<T>(params: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(params).filter(([name]) => IN_APP_PARAMS.includes(name)),
  );
}
