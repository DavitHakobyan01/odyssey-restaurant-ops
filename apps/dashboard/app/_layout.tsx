/**
 * Root layout — the provider stack for the whole dashboard.
 *
 * Order matters and is deliberate:
 *
 *   ThemeProvider      outermost, because Toast renders themed UI
 *   QueryClientProvider owns all server state
 *   ToastProvider      renders an overlay above every screen
 *   Slot               the routed screen
 *
 * The QueryClient is created inside a `useState` initialiser rather than at module scope.
 * A module-level client would be shared across every render of every test and, during
 * server rendering of the web build, across requests — leaking one user's cached data
 * into another's page.
 */
import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { Slot } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { createQueryClient } from '@odyssey/api-client'
import { ThemeProvider, ToastProvider } from '@odyssey/ui'

export default function RootLayout() {
  const [queryClient] = useState(() => createQueryClient())

  return (
    <SafeAreaProvider>
      <ThemeProvider initialPreference="system">
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <StatusBar style="auto" />
            <Slot />
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
