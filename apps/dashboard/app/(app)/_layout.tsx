/**
 * Layout for every screen inside the application chrome.
 *
 * `(app)` is an Expo Router *group*: the parentheses keep it out of the URL, so the Home
 * screen lives at `/` rather than `/app`. Every route in this directory renders inside
 * `AppShell`, which is what guarantees the sidebar, the mobile bottom bar and the content
 * gutters are identical on all five pages without any of them re-implementing chrome.
 */
import { Slot } from 'expo-router'

import { AppShell } from '../../src/components/AppShell'

export default function AppGroupLayout() {
  return (
    <AppShell>
      <Slot />
    </AppShell>
  )
}
