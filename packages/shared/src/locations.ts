import type { Bilingual } from './i18n/index.js';

/** One row of the locations master as the API answers it and the phone keeps it. */
export interface LocationView {
  id: string;
  parentId: string | null;
  level: string;
  code: string;
  name: Bilingual;
  /** The four-digit post code of an upazila, a thana or a union-level place; null above them. */
  postCode: string | null;
  active: boolean;
}
