import { useAuth } from '../src/lib/auth';

/** Shows once the session is restored, so a check that a button is absent never runs early. */
export function SignedIn() {
  const { me } = useAuth();
  return me ? <p>signed-in</p> : null;
}
