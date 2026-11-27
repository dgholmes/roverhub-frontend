import { useOperatorId } from '@/lib/realtime/operator'
import { useRemembered } from '@/lib/viewMemory'
import { useMemo } from 'react'
import { DEFAULT_GREETINGS, isSavedGreetings, savedGreetingsKey, withRenamedGreetings, type SavedGreeting } from '@/liveops/greeter'

/** This viewer's saved greetings, kept in the browser per operator (a
 * convenience: blocked storage only means the defaults each time). Shared by
 * the Greet tab and Greeter mode's settings. */
export function useSavedGreetings(): [SavedGreeting[], (list: SavedGreeting[]) => void] {
  const operatorId = useOperatorId()
  const [list, setList] = useRemembered<SavedGreeting[]>(savedGreetingsKey(operatorId), DEFAULT_GREETINGS as SavedGreeting[], isSavedGreetings)
  const shown = useMemo(() => withRenamedGreetings(list), [list])
  return [shown, setList]
}
