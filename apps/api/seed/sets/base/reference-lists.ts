import { type SeedContext, seedId } from '../../context';

/**
 * System-wide reference lists (DATABASE_SCHEMA section 5.2) and the per-project list defaults
 * (section 5.3), with the labels decided in O-17, O-22, O-38, BD-14, O-14 and O-53.
 */
type Entry = [code: string, bn: string, en: string];

export const REFERENCE_LISTS: Record<string, Entry[]> = {
  payment_method: [
    ['bkash', 'বিকাশ', 'bKash'],
    ['nagad', 'নগদ', 'Nagad'],
    ['rocket', 'রকেট', 'Rocket'],
    ['bank_transfer', 'ব্যাংক ট্রান্সফার', 'Bank transfer'],
  ],
  consent_channel: [
    ['website', 'ওয়েবসাইট', 'Website'],
    ['facebook', 'ফেসবুক', 'Facebook'],
    ['print', 'প্রিন্ট', 'Print'],
    ['video', 'ভিডিও', 'Video'],
    ['donor_report', 'ডোনার রিপোর্ট', 'Donor report'],
  ],
  gender: [
    ['male', 'পুরুষ', 'Male'],
    ['female', 'মহিলা', 'Female'],
  ],
  marital_status: [
    ['never_married', 'অবিবাহিত', 'Never married'],
    ['married', 'বিবাহিত', 'Married'],
    ['widowed', 'বিধবা/বিপত্নীক', 'Widowed'],
    ['divorced', 'তালাকপ্রাপ্ত', 'Divorced'],
    ['separated', 'পৃথক বসবাসকারী', 'Separated'],
    ['other', 'অন্যান্য', 'Other'],
  ],
  education_level: [
    ['illiterate', 'নিরক্ষর', 'Illiterate'],
    ['primary', 'প্রাথমিক বা সমমান', 'Primary or equivalent'],
    ['secondary', 'মাধ্যমিক বা সমমান', 'Secondary or equivalent'],
    ['higher_secondary', 'উচ্চ মাধ্যমিক বা সমমান', 'Higher secondary or equivalent'],
    ['graduate', 'স্নাতক বা সমমান', 'Graduate or equivalent'],
    ['postgraduate', 'স্নাতকোত্তর বা সমমান', 'Postgraduate or equivalent'],
  ],
  relationship: [
    ['self', 'নিজে/পরিবারের প্রধান', 'Self / head of household'],
    ['spouse', 'স্বামী/স্ত্রী', 'Spouse'],
    ['son', 'ছেলে', 'Son'],
    ['daughter', 'মেয়ে', 'Daughter'],
    ['father', 'পিতা', 'Father'],
    ['mother', 'মাতা', 'Mother'],
    ['brother', 'ভাই', 'Brother'],
    ['sister', 'বোন', 'Sister'],
    ['grandfather', 'দাদা/নানা', 'Grandfather'],
    ['grandmother', 'দাদি/নানি', 'Grandmother'],
    ['grandson', 'নাতি', 'Grandson'],
    ['granddaughter', 'নাতনি', 'Granddaughter'],
    ['son_in_law', 'জামাতা', 'Son-in-law'],
    ['daughter_in_law', 'পুত্রবধূ', 'Daughter-in-law'],
    ['other_relative', 'অন্যান্য আত্মীয়', 'Other relative'],
    ['guardian', 'অভিভাবক', 'Guardian'],
    ['non_relative', 'অনাত্মীয়', 'Not a relative'],
  ],
  beneficiary_class_default: [
    ['elderly', 'বৃদ্ধ', 'Elderly'],
    ['widow', 'বিধবা', 'Widow'],
    ['orphan', 'এতিম', 'Orphan'],
    ['disabled', 'প্রতিবন্ধী', 'Person with disability'],
    ['ill', 'অসুস্থ', 'Ill'],
    ['labourer', 'শ্রমজীবী', 'Labourer'],
    ['extreme_poor', 'অতিদরিদ্র', 'Extremely poor'],
    ['other', 'অন্যান্য', 'Other'],
  ],
  application_kind_default: [
    ['educational_institution', 'শিক্ষাপ্রতিষ্ঠান', 'Educational institution'],
    ['personal_garden', 'ব্যক্তিগত বাগান', 'Personal garden'],
  ],
  expense_category_default: [
    ['decoration', 'সাজসজ্জা', 'Decoration'],
    ['vehicle_hire', 'গাড়ি ভাড়া', 'Vehicle hire'],
    ['food', 'খাবার', 'Food'],
    ['photocopy', 'ফটোকপি', 'Photocopy'],
    ['banner', 'ব্যানার', 'Banner'],
  ],
  issue_type_default: [
    ['material_shortage', 'মালামালের ঘাটতি', 'Material shortage'],
    ['poor_workmanship', 'কাজের মান খারাপ', 'Poor workmanship'],
    ['mason_absent', 'মিস্ত্রী অনুপস্থিত', 'Mason absent'],
    ['land_problem', 'জমির সমস্যা', 'Land problem'],
    ['weather', 'আবহাওয়া', 'Weather'],
    ['material_theft', 'মালামাল চুরি', 'Material theft'],
  ],
};

export async function seedReferenceLists(ctx: SeedContext): Promise<void> {
  for (const [listKey, entries] of Object.entries(REFERENCE_LISTS)) {
    for (const [index, [code, bn, en]] of entries.entries()) {
      await ctx.upsert('reference_lists', {
        id: seedId(`reference:${listKey}:${code}`),
        list_key: listKey,
        code,
        label_bn: bn,
        label_en: en,
        active: true,
        sort_order: index + 1,
        ...ctx.audit(),
      });
    }
  }
}
