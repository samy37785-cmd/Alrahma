import { useContext } from 'react';
import { ABContext } from '../context/ABTestContext';

// Hook to read current experiment context from within a variant.
export function useABTest() {
  return useContext(ABContext);
}
