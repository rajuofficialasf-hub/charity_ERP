import { conditionSchema, type Condition, exprSchema, type Expr } from '@css/shared';
import type {
  FormTemplate,
  FormTemplateSection,
  LibraryField,
  LibraryOption as Option,
  LibrarySection,
} from '@css/shared/forms';
import { json, type SeedContext, seedId } from '../../context';

/**
 * The field and section library (docs/MASTER_SPEC.md, the form section library) and the two
 * application forms in use today (blueprint
 * appendix খ.১ and খ.২) as form templates: data only; the shapes come from `@css/shared/forms`,
 * which also builds a project's form from them (T2.3). Standard fields map to beneficiary columns
 * (standard_column); the rest are project answers. Removed by decision: spot code and community
 * number (docs/DECISION_LOG.md, the decision that no spot or community code exists). Fields the
 * system fills itself (volunteer name, application number, approval
 * date, implementing officer) are not form fields. Option lists the blueprint does not spell out
 * are left for each project (options: []).
 *
 * form_library_fields.default_settings shape (library only): { options?, options_from_reference_list?,
 * allows_other_text?, validation?, calculation?, repeat_fields? }.
 */
const YES_NO: Option[] = [
  { code: 'yes', label_bn: 'হ্যাঁ', label_en: 'Yes' },
  { code: 'no', label_bn: 'না', label_en: 'No' },
];
const opts = (...o: [string, string, string][]): Option[] =>
  o.map(([code, label_bn, label_en]) => ({ code, label_bn, label_en }));
const yesNo = (key: string, bn: string, en: string, standard?: string): LibraryField => ({
  key,
  type: 'radio',
  bn,
  en,
  ...(standard ? { standard } : {}),
  settings: { options: YES_NO },
});
const money = (key: string, bn: string, en: string, standard?: string): LibraryField => ({
  key,
  type: 'money',
  bn,
  en,
  ...(standard ? { standard } : {}),
});
const calc = (
  key: string,
  bn: string,
  en: string,
  expr: Expr,
  standard?: string,
): LibraryField => ({
  key,
  type: 'calculation',
  bn,
  en,
  ...(standard ? { standard } : {}),
  settings: { calculation: { expr: exprSchema.parse(expr) } },
});
const f = (field: string): Expr => ({ field });
const add = (...args: Expr[]): Expr => ({ op: 'add', args });

export const LIBRARY_FIELDS: LibraryField[] = [
  // identity (খ.৩)
  {
    key: 'nid_or_birth_reg',
    type: 'short_text',
    bn: 'জাতীয় পরিচয়পত্র বা জন্ম নিবন্ধন নম্বর',
    en: 'NID or birth registration number',
    standard: 'nid_or_birth_reg',
    settings: { validation: { pattern: 'nid' } },
  },
  {
    key: 'mobile',
    type: 'phone',
    bn: 'মোবাইল নম্বর',
    en: 'Mobile number',
    standard: 'mobile',
    settings: { validation: { pattern: 'mobile' } },
  },
  {
    key: 'name',
    type: 'short_text',
    bn: 'উপকারভোগীর নাম',
    en: "Beneficiary's name",
    standard: 'name',
  },
  {
    key: 'father_or_husband_name',
    type: 'short_text',
    bn: 'পিতা/স্বামীর নাম',
    en: "Father's or husband's name",
    standard: 'father_or_husband_name',
  },
  {
    key: 'mother_name',
    type: 'short_text',
    bn: 'মাতার নাম',
    en: "Mother's name",
    standard: 'mother_name',
  },
  {
    key: 'gender',
    type: 'single_select',
    bn: 'লিঙ্গ',
    en: 'Gender',
    standard: 'gender_code',
    settings: { options_from_reference_list: 'gender' },
  },
  { key: 'dob', type: 'date', bn: 'জন্ম তারিখ', en: 'Date of birth', standard: 'dob' },
  {
    key: 'age',
    type: 'number',
    bn: 'বয়স',
    en: 'Age',
    standard: 'age_years',
    settings: { validation: { min: 0, max: 120 } },
  },
  {
    key: 'marital_status',
    type: 'single_select',
    bn: 'বৈবাহিক অবস্থা',
    en: 'Marital status',
    standard: 'marital_status_code',
    settings: { options_from_reference_list: 'marital_status' },
  },
  {
    key: 'education',
    type: 'single_select',
    bn: 'শিক্ষার স্তর',
    en: 'Education level',
    standard: 'education_code',
    settings: { options_from_reference_list: 'education_level' },
  },
  {
    key: 'beneficiary_class',
    type: 'single_select',
    bn: 'উপকারভোগীর শ্রেণি',
    en: 'Beneficiary type',
    standard: 'class_code',
    settings: { options_from_reference_list: 'beneficiary_class_default', allows_other_text: true },
  },
  {
    key: 'occupation',
    type: 'single_select',
    bn: 'পেশা',
    en: 'Occupation',
    standard: 'occupation_code',
    settings: {
      options: [
        ...opts(['business', 'ব্যবসা', 'Business'], ['day_labourer', 'দিনমজুর', 'Day labourer']),
        { code: 'other', label_bn: 'অন্যান্য', label_en: 'Other', allows_other_text: true },
      ],
    },
  },
  {
    key: 'photo',
    type: 'photo',
    bn: 'উপকারভোগীর ছবি',
    en: "Beneficiary's photo",
    standard: 'photo_file_id',
  },
  // address
  {
    key: 'address',
    type: 'bd_address',
    bn: 'বিভাগ, জেলা, উপজেলা, ইউনিয়ন',
    en: 'Division, district, upazila, union',
    standard: 'division_id,district_id,upazila_id,union_id',
  },
  {
    key: 'village',
    type: 'short_text',
    bn: 'গ্রাম (বাংলায় লিখুন)',
    en: 'Village (in Bangla)',
    standard: 'village',
    settings: { validation: { pattern: 'bangla_text' } },
  },
  {
    key: 'post_office',
    type: 'short_text',
    bn: 'পোস্ট অফিসের নাম',
    en: 'Post office',
    standard: 'post_office',
  },
  {
    key: 'post_code',
    type: 'short_text',
    bn: 'পোস্ট কোড',
    en: 'Post code',
    standard: 'post_code',
    settings: { validation: { pattern: 'post_code' } },
  },
  {
    key: 'landmark',
    type: 'short_text',
    bn: 'বাড়ির নাম/নম্বর/ল্যান্ডমার্ক (যদি থাকে)',
    en: 'House name, number or landmark (if any)',
    standard: 'landmark',
  },
  {
    key: 'gps',
    type: 'gps',
    bn: 'উপকারভোগীর অবস্থান',
    en: "Beneficiary's location",
    standard: 'latitude,longitude,gps_accuracy_m',
  },
  // family and income
  {
    key: 'members_14_plus',
    type: 'number',
    bn: 'পরিবারের 14 বছর বা তার বেশি বয়সী সদস্য সংখ্যা (নিজেসহ)',
    en: 'Household members aged 14 or more (including self)',
    standard: 'members_14_plus',
    settings: { validation: { min: 0 } },
  },
  {
    key: 'children_under_14',
    type: 'number',
    bn: 'পরিবারের 14 বছরের কম বয়সী শিশু কতজন',
    en: 'Children under 14 in the household',
    standard: 'children_under_14',
    settings: { validation: { min: 0 } },
  },
  calc(
    'total_members',
    'পরিবারের মোট সদস্য সংখ্যা',
    'Total household members',
    add(f('members_14_plus'), f('children_under_14')),
    'total_members',
  ),
  money(
    'daily_income',
    'পরিবারের মোট দৈনিক আয় (টাকায়)',
    'Household daily income (Taka)',
    'daily_income',
  ),
  money('monthly_income', 'উপকারভোগীর মাসিক আয়', "Beneficiary's monthly income", 'monthly_income'),
  money('monthly_expense', 'পরিবারের মাসিক ব্যয়', 'Household monthly expense', 'monthly_expense'),
  yesNo(
    'has_multiple_earners',
    'পরিবারে একাধিক আয়কারী আছেন?',
    'More than one earner in the household?',
  ),
  {
    key: 'earners',
    type: 'repeat_group',
    bn: 'আয়কারী',
    en: 'Earners',
    standard: 'beneficiary_family_members',
    settings: {
      repeat_fields: [
        {
          key: 'earner_name',
          type: 'short_text',
          label_bn: 'আয়কারীর নাম',
          label_en: "Earner's name",
          standard: 'name',
          required: true,
        },
        {
          key: 'earner_relationship',
          type: 'single_select',
          label_bn: 'সম্পর্ক',
          label_en: 'Relationship',
          standard: 'relationship_code',
          options_from_reference_list: 'relationship',
        },
        {
          key: 'earner_occupation',
          type: 'short_text',
          label_bn: 'পেশা',
          label_en: 'Occupation',
          standard: 'occupation_code',
        },
        {
          key: 'earner_monthly_income',
          type: 'money',
          label_bn: 'মাসিক আয়',
          label_en: 'Monthly income',
          standard: 'monthly_income',
        },
      ],
    },
  },
  {
    key: 'family_members',
    type: 'repeat_group',
    bn: 'পরিবারের সদস্যরা',
    en: 'Family members',
    standard: 'beneficiary_family_members',
    settings: {
      // the members are the household, not its earners; the earners group above marks those
      repeat: { earner: false },
      repeat_fields: [
        {
          key: 'member_name',
          type: 'short_text',
          label_bn: 'নাম',
          label_en: 'Name',
          standard: 'name',
          required: true,
        },
        {
          key: 'member_age',
          type: 'number',
          label_bn: 'বয়স',
          label_en: 'Age',
          standard: 'age_years',
        },
        {
          key: 'member_relationship',
          type: 'single_select',
          label_bn: 'সম্পর্ক',
          label_en: 'Relationship',
          standard: 'relationship_code',
          options_from_reference_list: 'relationship',
        },
        {
          key: 'member_occupation',
          type: 'short_text',
          label_bn: 'পেশা',
          label_en: 'Occupation',
          standard: 'occupation_code',
        },
        {
          key: 'member_monthly_income',
          type: 'money',
          label_bn: 'মাসিক আয়',
          label_en: 'Monthly income',
          standard: 'monthly_income',
        },
      ],
    },
  },
  calc(
    'household_income_total',
    'পরিবারের মোট আয়',
    'Total household income',
    add(f('monthly_income'), { sum_repeat: { group: 'earners', field: 'earner_monthly_income' } }),
  ),
  // livelihood
  {
    key: 'business_kind_current',
    type: 'short_text',
    bn: 'আপনি কিসের ব্যবসা করেন?',
    en: 'What business do you run?',
  },
  {
    key: 'day_labour_work',
    type: 'short_text',
    bn: 'দিনমজুরি হিসাবে কোন কাজটি বেশি করেন?',
    en: 'Which day-labour work do you do most?',
  },
  // project questions (self-reliance)
  yesNo(
    'prior_business',
    'ইতিপূর্বে কোনো ব্যবসার সাথে যুক্ত ছিলেন?',
    'Have you run a business before?',
  ),
  {
    key: 'prior_business_type',
    type: 'single_select',
    bn: 'কী ধরনের ব্যবসা?',
    en: 'What kind of business?',
    settings: { options: [], allows_other_text: true },
  },
  {
    key: 'business_experience_years',
    type: 'number',
    bn: 'ব্যবসার অভিজ্ঞতা কত বছরের?',
    en: 'Years of business experience',
    settings: { validation: { min: 0 } },
  },
  {
    key: 'self_reliance_path',
    type: 'radio',
    bn: 'কিভাবে স্বাবলম্বী হতে চান?',
    en: 'How do you want to become self-reliant?',
    settings: {
      options: [
        ...opts(['business', 'ব্যবসা', 'Business'], ['livestock', 'লালনপালন', 'Rearing livestock']),
        { code: 'other', label_bn: 'অন্যান্য', label_en: 'Other', allows_other_text: true },
      ],
    },
  },
  {
    key: 'desired_business',
    type: 'single_select',
    bn: 'কী ধরণের ব্যবসা করতে চান?',
    en: 'What business do you want to start?',
    settings: { options: [] },
  },
  money('capital_needed', 'ব্যবসা করতে কত টাকার প্রয়োজন?', 'Money needed for the business'),
  {
    key: 'livestock_wanted',
    type: 'single_select',
    bn: 'কী লালনপালন করতে চান?',
    en: 'What do you want to rear?',
    settings: { options: [] },
  },
  money('capital_available', 'আপনার কাছে কত টাকা পুঁজি আছে?', 'Capital you already have'),
  // financial status
  {
    key: 'house_type',
    type: 'single_select',
    bn: 'বাড়ির ধরণ',
    en: 'House type',
    settings: { options: [] },
  },
  {
    key: 'homestead_ownership',
    type: 'single_select',
    bn: 'বসতবাড়ির মালিকানার ধরন',
    en: 'Homestead ownership',
    settings: { options: [] },
  },
  {
    key: 'homestead_land_decimal',
    type: 'decimal',
    bn: 'বসতবাড়ির জমি (শতাংশ)',
    en: 'Homestead land (decimal)',
  },
  {
    key: 'farm_land_decimal',
    type: 'decimal',
    bn: 'মোট কৃষি জমি (শতাংশ)',
    en: 'Total farm land (decimal)',
  },
  {
    key: 'leased_mortgaged_land_decimal',
    type: 'decimal',
    bn: 'বর্গা/লিজ/বন্ধকী জমি (শতাংশ)',
    en: 'Sharecropped, leased or mortgaged land (decimal)',
  },
  money('mortgage_amount', 'কত টাকার বিপরীতে বন্ধক', 'Amount the land is mortgaged for'),
  money('lease_amount', 'কত টাকায় লিজ', 'Lease amount'),
  {
    key: 'crops_sold',
    type: 'multi_select',
    bn: 'কী ফসল বিক্রি করেন?',
    en: 'Which crops do you sell?',
    settings: { options: [] },
  },
  yesNo('has_livestock', 'গবাদি পশু আছে?', 'Do you have livestock?'),
  {
    key: 'cattle_count',
    type: 'number',
    bn: 'গরু/মহিষের সংখ্যা',
    en: 'Number of cattle or buffaloes',
    settings: { validation: { min: 0 } },
  },
  {
    key: 'goat_sheep_count',
    type: 'number',
    bn: 'ছাগল/ভেড়ার সংখ্যা',
    en: 'Number of goats or sheep',
    settings: { validation: { min: 0 } },
  },
  yesNo('family_abroad', 'পরিবারের কেউ প্রবাসে আছে?', 'Is a family member abroad?'),
  yesNo('receives_remittance', 'প্রবাস থেকে অর্থ পান?', 'Do you receive money from abroad?'),
  {
    key: 'allowances',
    type: 'multi_select',
    bn: 'প্রতিবন্ধী/বয়স্ক/বিধবা ভাতা পান?',
    en: 'Disability, old-age or widow allowance received',
    settings: {
      options: opts(
        ['disability', 'প্রতিবন্ধী ভাতা', 'Disability allowance'],
        ['old_age', 'বয়স্ক ভাতা', 'Old-age allowance'],
        ['widow', 'বিধবা ভাতা', 'Widow allowance'],
      ),
    },
  },
  // loans
  yesNo('has_loan', 'ঋণ/কিস্তি আছে?', 'Do you have a loan or instalments?'),
  {
    key: 'loan_type',
    type: 'single_select',
    bn: 'কী ধরনের ঋণ?',
    en: 'Type of loan',
    settings: { options: [] },
  },
  { key: 'loan_purpose', type: 'short_text', bn: 'ঋণের উদ্দেশ্য', en: 'Purpose of the loan' },
  yesNo('loan_purpose_met', 'উদ্দেশ্য পূরণ হয়েছে কি?', 'Was the purpose met?'),
  money('loan_total', 'মোট ঋণের পরিমাণ', 'Total loan amount'),
  {
    key: 'interest_loan_comment',
    type: 'long_text',
    bn: 'সুদে ঋণ নেওয়ার বিষয়ে মন্তব্য',
    en: 'Comment on interest-bearing loans',
  },
  // zakat assessment (BD-28)
  money('zakat_cash', 'নগদ অর্থ', 'Cash in hand'),
  money(
    'zakat_bank_deposit',
    'ব্যাংক/আর্থিক প্রতিষ্ঠানে জমা',
    'Bank or financial institution deposits',
  ),
  { key: 'gold_amount', type: 'decimal', bn: 'স্বর্ণের পরিমাণ (আনা)', en: 'Gold (ana)' },
  { key: 'gold_carat', type: 'number', bn: 'স্বর্ণের ক্যারেট', en: 'Gold carat' },
  money('gold_price_per_ana', 'স্বর্ণের প্রতি আনার বাজারমূল্য', 'Gold market price per ana'),
  calc('gold_value', 'স্বর্ণের মোট মূল্য', 'Total value of gold', {
    op: 'mul',
    args: [f('gold_amount'), f('gold_price_per_ana')],
  }),
  { key: 'silver_amount', type: 'decimal', bn: 'রৌপ্যের পরিমাণ (আনা)', en: 'Silver (ana)' },
  { key: 'silver_carat', type: 'number', bn: 'রৌপ্যের ক্যারেট', en: 'Silver carat' },
  money('silver_price_per_ana', 'রৌপ্যের প্রতি আনার বাজারমূল্য', 'Silver market price per ana'),
  calc('silver_value', 'রুপার মোট মূল্য', 'Total value of silver', {
    op: 'mul',
    args: [f('silver_amount'), f('silver_price_per_ana')],
  }),
  money(
    'zakat_savings_certificates',
    'সঞ্চয়পত্র/বন্ড/ডিবেঞ্চার/ট্রেজারি বিলের ক্রয়মূল্য',
    'Savings certificates, bonds, debentures and treasury bills (purchase value)',
  ),
  money(
    'zakat_stock_goods',
    'বিক্রয়ের জন্য স্টকে রাখা পণ্য ও কাঁচামালের বিক্রয়মূল্য',
    'Goods and raw material held for sale (sale value)',
  ),
  money('zakat_receivables', 'অন্যের কাছে পাওনা টাকা', 'Money owed to you'),
  money(
    'zakat_rent_crop_income',
    'ভাড়া বা অতিরিক্ত ফসল থেকে বার্ষিক আয়',
    'Yearly income from rent or surplus crops',
  ),
  money(
    'zakat_land_for_sale',
    'বিক্রির উদ্দেশ্যে কেনা জমির বর্তমান মূল্য',
    'Current value of land bought for resale',
  ),
  money(
    'zakat_security_deposit',
    'জামানত/সিকিউরিটি মানি হিসেবে দেওয়া ফেরতযোগ্য অর্থ',
    'Refundable security deposits',
  ),
  money(
    'zakat_debts',
    'চিকিৎসা/সাংসারিক/একান্ত প্রয়োজনে নেওয়া ঋণ, অনাদায়ী দেনমোহর, বকেয়া বিল ও খরচ',
    'Debts for treatment or household needs, unpaid dower, outstanding bills',
  ),
  calc(
    'zakat_total_assets',
    'মোট সম্পদ',
    'Total assets',
    add(
      f('zakat_cash'),
      f('zakat_bank_deposit'),
      f('gold_value'),
      f('silver_value'),
      f('zakat_savings_certificates'),
      f('zakat_stock_goods'),
      f('zakat_receivables'),
      f('zakat_rent_crop_income'),
      f('zakat_land_for_sale'),
      f('zakat_security_deposit'),
    ),
  ),
  calc('zakat_total_debts', 'মোট দেনা', 'Total debts', add(f('zakat_debts'), f('loan_total'))),
  calc('zakat_net_assets', 'নিট সম্পদ', 'Net assets', {
    op: 'sub',
    args: [f('zakat_total_assets'), f('zakat_total_debts')],
  }),
  calc(
    'zakat_status_suggestion',
    'জাকাতের অবস্থা (সিস্টেমের প্রস্তাব)',
    'Zakat status (system suggestion)',
    { op: 'compare_gte', args: [f('zakat_net_assets'), { setting: 'nisab_value' }] },
  ),
  // official section
  {
    key: 'local_imam_name',
    type: 'short_text',
    bn: 'স্থানীয় ইমামের নাম',
    en: "Local imam's name",
  },
  {
    key: 'local_imam_phone',
    type: 'phone',
    bn: 'স্থানীয় ইমামের ফোন নম্বর',
    en: "Local imam's phone number",
  },
  {
    key: 'zakat_eligibility',
    type: 'single_select',
    bn: 'যাকাত সহায়তার জন্য উপকারভোগীর যোগ্যতা',
    en: 'Eligibility for zakat support',
    settings: {
      options: opts(
        ['eligible', 'যোগ্য', 'Eligible'],
        ['not_eligible', 'যোগ্য নন', 'Not eligible'],
      ),
    },
  },
  {
    key: 'official_comment',
    type: 'long_text',
    bn: 'অফিসিয়াল কর্মীর মন্তব্য',
    en: "Official's comment",
  },
  // attachments
  {
    key: 'photo_with_house',
    type: 'photo',
    bn: 'ঘরসহ উপকারভোগীর ছবি',
    en: 'Photo of the beneficiary with the house',
  },
];

/** The ten sections of BD-12. */
export const SECTIONS: LibrarySection[] = [
  {
    key: 'basic_info',
    bn: 'মৌলিক তথ্য',
    en: 'Basic information',
    visibility: 'volunteer',
    fields: [
      'nid_or_birth_reg',
      'mobile',
      'name',
      'father_or_husband_name',
      'mother_name',
      'gender',
      'dob',
      'age',
      'marital_status',
      'education',
      'beneficiary_class',
      'occupation',
    ],
  },
  {
    key: 'address',
    bn: 'ঠিকানা',
    en: 'Address',
    visibility: 'volunteer',
    fields: ['address', 'village', 'post_office', 'post_code', 'landmark', 'gps'],
  },
  {
    key: 'family_income',
    bn: 'পরিবার ও আয়',
    en: 'Family and income',
    visibility: 'volunteer',
    fields: [
      'members_14_plus',
      'children_under_14',
      'total_members',
      'family_members',
      'daily_income',
      'monthly_income',
      'monthly_expense',
      'has_multiple_earners',
      'earners',
      'household_income_total',
    ],
  },
  {
    key: 'livelihood',
    bn: 'জীবিকা ও আয়ের স্থিতিশীলতা',
    en: 'Livelihood and income stability',
    visibility: 'volunteer',
    fields: ['business_kind_current', 'day_labour_work'],
  },
  {
    key: 'project_questions',
    bn: 'প্রকল্প সম্পর্কিত প্রশ্ন',
    en: 'Project questions',
    visibility: 'volunteer',
    fields: [
      'prior_business',
      'prior_business_type',
      'business_experience_years',
      'self_reliance_path',
      'desired_business',
      'capital_needed',
      'livestock_wanted',
      'capital_available',
    ],
  },
  {
    key: 'financial_status',
    bn: 'আর্থিক অবস্থা',
    en: 'Financial status',
    visibility: 'volunteer',
    fields: [
      'house_type',
      'homestead_ownership',
      'homestead_land_decimal',
      'farm_land_decimal',
      'leased_mortgaged_land_decimal',
      'mortgage_amount',
      'lease_amount',
      'crops_sold',
      'has_livestock',
      'cattle_count',
      'goat_sheep_count',
      'family_abroad',
      'receives_remittance',
      'allowances',
    ],
  },
  {
    key: 'loans',
    bn: 'ঋণ সম্পর্কিত তথ্য',
    en: 'Loans',
    visibility: 'volunteer',
    fields: [
      'has_loan',
      'loan_type',
      'loan_purpose',
      'loan_purpose_met',
      'loan_total',
      'interest_loan_comment',
    ],
  },
  {
    key: 'zakat_assessment',
    bn: 'যাকাত মূল্যায়ন',
    en: 'Zakat assessment',
    visibility: 'volunteer',
    fields: [
      'zakat_cash',
      'zakat_bank_deposit',
      'gold_amount',
      'gold_carat',
      'gold_price_per_ana',
      'gold_value',
      'silver_amount',
      'silver_carat',
      'silver_price_per_ana',
      'silver_value',
      'zakat_savings_certificates',
      'zakat_stock_goods',
      'zakat_receivables',
      'zakat_rent_crop_income',
      'zakat_land_for_sale',
      'zakat_security_deposit',
      'zakat_debts',
      'zakat_total_assets',
      'zakat_total_debts',
      'zakat_net_assets',
      'zakat_status_suggestion',
    ],
  },
  {
    key: 'official',
    bn: 'অফিসিয়াল অংশ',
    en: 'Official section',
    visibility: 'official_only',
    fields: ['local_imam_name', 'local_imam_phone', 'zakat_eligibility', 'official_comment'],
  },
  {
    key: 'attachments',
    bn: 'সংযুক্তি',
    en: 'Attachments',
    visibility: 'volunteer',
    fields: ['photo', 'photo_with_house'],
  },
];

const eq = (field: string, value: string): Condition =>
  conditionSchema.parse({ field, op: 'eq', value });

/** Display conditions given by appendix খ.২ ("হ্যাঁ হলে দেখাবে", "পেশা = ব্যবসা হলে দেখাবে"). */
const CONDITIONS: Record<string, Condition> = {
  business_kind_current: eq('occupation', 'business'),
  day_labour_work: eq('occupation', 'day_labourer'),
  earners: eq('has_multiple_earners', 'yes'),
  prior_business_type: eq('prior_business', 'yes'),
  business_experience_years: eq('prior_business', 'yes'),
  desired_business: eq('self_reliance_path', 'business'),
  capital_needed: eq('self_reliance_path', 'business'),
  livestock_wanted: eq('self_reliance_path', 'livestock'),
  cattle_count: eq('has_livestock', 'yes'),
  goat_sheep_count: eq('has_livestock', 'yes'),
  receives_remittance: eq('family_abroad', 'yes'),
  loan_type: eq('has_loan', 'yes'),
  loan_purpose: eq('has_loan', 'yes'),
  loan_purpose_met: eq('has_loan', 'yes'),
  loan_total: eq('has_loan', 'yes'),
  interest_loan_comment: eq('has_loan', 'yes'),
};

/** BD-13: mandatory in every project. */
const MANDATORY = new Set([
  'nid_or_birth_reg',
  'name',
  'father_or_husband_name',
  'mobile',
  'gender',
  'address',
  'village',
]);

function templateSection(key: string, fields: string[]): FormTemplateSection {
  const section = SECTIONS.find((s) => s.key === key)!;
  return {
    key,
    visibility: section.visibility,
    fields: fields.map((field) => ({
      key: field,
      required: MANDATORY.has(field),
      ...(CONDITIONS[field] ? { show_if: CONDITIONS[field] } : {}),
    })),
  };
}

export const FORM_TEMPLATES: FormTemplate[] = [
  {
    key: 'form_distribution',
    name_bn: 'বিতরণভিত্তিক আবেদন ফর্ম (কুরবানী, ইফতার, শীতবস্ত্র)',
    name_en: 'Distribution application form (Qurbani, iftar, winter clothing)',
    project_type: 'distribution',
    definition: {
      kind: 'form_template',
      source: 'ERP_BLUEPRINT_BN appendix খ, part 1',
      also_for: ['qurbani'],
      form: {
        title_bn: 'উপকারভোগীর আবেদন',
        title_en: 'Beneficiary application',
        sections: [
          templateSection('basic_info', [
            'nid_or_birth_reg',
            'mobile',
            'name',
            'gender',
            'father_or_husband_name',
            'beneficiary_class',
            'age',
            'occupation',
          ]),
          templateSection('family_income', [
            'members_14_plus',
            'children_under_14',
            'total_members',
            'daily_income',
          ]),
          templateSection('address', ['address', 'village']),
        ],
      },
    },
  },
  {
    key: 'form_self_reliance_construction',
    name_bn: 'স্বাবলম্বী ও ঘর নির্মাণ আবেদন ফর্ম',
    name_en: 'Self-reliance and house construction application form',
    project_type: 'implementation_evidence',
    definition: {
      kind: 'form_template',
      source: 'ERP_BLUEPRINT_BN appendix খ, part 2',
      also_for: ['construction'],
      form: {
        title_bn: 'উপকারভোগীর আবেদন',
        title_en: 'Beneficiary application',
        sections: [
          templateSection('official', [
            'local_imam_name',
            'local_imam_phone',
            'zakat_eligibility',
            'official_comment',
          ]),
          templateSection('basic_info', [
            'nid_or_birth_reg',
            'mobile',
            'name',
            'father_or_husband_name',
            'mother_name',
            'gender',
            'marital_status',
            'education',
            'dob',
            'occupation',
          ]),
          templateSection('address', [
            'address',
            'village',
            'post_office',
            'post_code',
            'landmark',
            'gps',
          ]),
          templateSection('family_income', [
            'members_14_plus',
            'children_under_14',
            'total_members',
            'monthly_income',
            'monthly_expense',
            'has_multiple_earners',
            'earners',
            'household_income_total',
          ]),
          templateSection('livelihood', ['business_kind_current', 'day_labour_work']),
          templateSection('project_questions', [
            'prior_business',
            'prior_business_type',
            'business_experience_years',
            'self_reliance_path',
            'desired_business',
            'capital_needed',
            'livestock_wanted',
            'capital_available',
          ]),
          templateSection(
            'financial_status',
            SECTIONS.find((s) => s.key === 'financial_status')!.fields,
          ),
          templateSection('loans', SECTIONS.find((s) => s.key === 'loans')!.fields),
          templateSection(
            'zakat_assessment',
            SECTIONS.find((s) => s.key === 'zakat_assessment')!.fields,
          ),
          templateSection('attachments', ['photo_with_house']),
        ],
      },
    },
  },
];

export async function seedFormTemplates(ctx: SeedContext): Promise<void> {
  const known = new Set(LIBRARY_FIELDS.map((x) => x.key));
  // the builder lists sections and fields in this file's order
  for (const [i, field] of LIBRARY_FIELDS.entries()) {
    await ctx.upsert('form_library_fields', {
      id: seedId(`form-library-field:${field.key}`),
      key: field.key,
      sort_order: i,
      type: field.type,
      label_bn: field.bn,
      label_en: field.en,
      standard_column: field.standard ?? null,
      default_settings: json(field.settings ?? {}),
      ...ctx.audit(),
    });
  }
  for (const [i, section] of SECTIONS.entries()) {
    for (const k of section.fields)
      if (!known.has(k)) throw new Error(`section ${section.key} names unknown field ${k}`);
    await ctx.upsert('form_library_sections', {
      id: seedId(`form-library-section:${section.key}`),
      key: section.key,
      sort_order: i,
      title_bn: section.bn,
      title_en: section.en,
      default_visibility: section.visibility,
      field_keys: section.fields,
      ...ctx.audit(),
    });
  }
  for (const t of FORM_TEMPLATES) {
    await ctx.upsert('project_templates', {
      id: seedId(`project-template:${t.key}:1`),
      key: t.key,
      version: 1,
      name_bn: t.name_bn,
      name_en: t.name_en,
      project_type: t.project_type,
      definition: json(t.definition),
      active: true,
      ...ctx.audit(),
    });
  }
}
