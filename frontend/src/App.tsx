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
import Settings from './pages/Settings'
import { EmptyState, PageHeader } from './components/ui'
import { Link } from 'react-router-dom'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

function NotFound() {
  return (
    <main className="page narrow">
      <PageHeader title="Page not found" />
      <EmptyState
        title="There's nothing at this address"
        action={
          <Link className="button-secondary" to="/dashboard">
            Go to your dashboard
          </Link>
        }
      >
        Check the link, or head back to your dashboard.
      </EmptyState>
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
                  <Route path="/settings" element={<Settings />} />
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
