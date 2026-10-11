import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { HomeView } from './HomeView';

// Placeholder home: signed-in users see their name and account links (T1.7); the role-based home
// "My Work" replaces it in T1.15. Without the css_csrf cookie the device has no session, so the
// server sends the visitor to /login at once; with it the client restores the session.
export default async function HomePage() {
  if (!(await cookies()).has('css_csrf')) redirect('/login');
  return <HomeView />;
}
