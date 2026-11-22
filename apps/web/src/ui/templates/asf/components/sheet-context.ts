import { useContext, createContext } from 'react';

// ----------------------------------------------------------------------

/**
 * Whether a piece sits inside a bottom sheet: the Drawer on a phone sets it, so a list that would
 * float above the page opens inside the sheet instead and scrolls with it.
 */
export const SheetContext = createContext(false);

export const useInSheet = () => useContext(SheetContext);
