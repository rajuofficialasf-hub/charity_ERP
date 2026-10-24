import type { ReactNode } from 'react';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canBuildForms } from '../roles';

/** A page only the form builders open; anyone else is told so, as on the other admin pages. */
export function BuildersOnly({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  return me && canBuildForms(me) ? children : <ForbiddenContent />;
}
