import { useOutletContext } from 'react-router';
import type { Project } from '../projects-api';

/** What the frame of a session hands the pages of its tabs: the session and its version. */
export interface FramedSession {
  project: Project;
  etag: string;
}

/** The session of the frame around the page, or nothing outside a frame. */
export const useFramedSession = () => useOutletContext<FramedSession | undefined>();
