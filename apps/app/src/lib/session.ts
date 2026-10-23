import { createContext, useContext } from 'react';
import type { MeOutputType } from 'zitejs/api';

export type Session = {
  token: string;
  me: MeOutputType;
  role: string;
  setRole: (r: string) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const SessionContext = createContext<Session | null>(null);

export function useSession() {
  const s = useContext(SessionContext);
  if (!s) throw new Error('SessionContext missing');
  return s;
}
