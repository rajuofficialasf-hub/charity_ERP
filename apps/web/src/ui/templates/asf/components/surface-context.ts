import { useContext, createContext } from 'react';

// ----------------------------------------------------------------------

/**
 * Where a piece is shown. Admin screens use a dark primary button; public pages use the brand
 * colour. PublicShell sets "public"; everything else is "admin".
 */
export const SurfaceContext = createContext<'admin' | 'public'>('admin');

export const useSurface = () => useContext(SurfaceContext);
