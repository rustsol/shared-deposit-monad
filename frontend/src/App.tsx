import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { WagmiProvider } from 'wagmi'
import { AuthProvider } from './app/AuthContext'
import Shell from './app/Shell'
import { TxProvider } from './app/TxContext'
import { wagmiConfig } from './lib/chain'
import AgreementDetail from './pages/AgreementDetail'
import Dashboard from './pages/Dashboard'
import DeveloperNetwork from './pages/DeveloperNetwork'
import DraftDetail from './pages/DraftDetail'
import InvitationReview from './pages/InvitationReview'
import Landing from './pages/Landing'
import Login from './pages/Login'
import NewAgreement from './pages/NewAgreement'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

function NotFound() {
  return (
    <main className="page">
      <h1>Page not found</h1>
    </main>
  )
}

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TxProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<Shell />}>
                  <Route path="/" element={<Landing />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/agreements/new" element={<NewAgreement />} />
                  <Route path="/drafts/:draftId" element={<DraftDetail />} />
                  <Route path="/invitations/:token" element={<InvitationReview />} />
                  <Route
                    path="/agreements/:chainId/:contractAddress/:agreementId"
                    element={<AgreementDetail />}
                  />
                  <Route path="/developer/network" element={<DeveloperNetwork />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </TxProvider>
        </AuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
