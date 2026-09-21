import { useEffect, useState } from 'react';
import { getGateState, subscribeGate, type GateState } from './confirmGate';

/** React view of the confirmation gate. */
export function useGate(): GateState {
  const [state, setState] = useState<GateState>(() => getGateState());
  useEffect(() => subscribeGate(setState), []);
  return state;
}
