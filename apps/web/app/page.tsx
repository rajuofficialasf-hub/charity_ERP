import { VisuallyHidden } from '@css/ui';

// Placeholder home of the scaffold (T1.1). The role-based home "My Work" replaces it in T1.15;
// the texts move to i18n keys in T1.5.
export default function HomePage() {
  return (
    <main>
      <h1>চ্যারিটি ও সোশ্যাল সার্ভিস</h1>
      <p lang="en">
        Charity &amp; Social Service
        <VisuallyHidden> (As-Sunnah Foundation)</VisuallyHidden>
      </p>
    </main>
  );
}
