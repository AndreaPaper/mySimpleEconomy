import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { CaseStyleProvider } from './context/CaseStyleContext'
import { PaletteProvider } from './context/PaletteContext'
import { OfflineSyncProvider } from './context/OfflineSyncContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import TransactionsPage from './pages/TransactionsPage'
import CategoriesPage from './pages/CategoriesPage'
import RecurringPage from './pages/RecurringPage'
import DebtsPage from './pages/DebtsPage'
import RemindersPage from './pages/RemindersPage'
import SavingsPage from './pages/SavingsPage'
import ImportPage from './pages/ImportPage'
import SettingsPage from './pages/SettingsPage'
import ProfilePage from './pages/ProfilePage'
import SectionsPage from './pages/SectionsPage'

// La tabella delle rotte, separata da App perché i test la montino dentro un
// MemoryRouter invece del BrowserRouter, che scriverebbe nella cronologia
// condivisa del documento e si porterebbe dietro lo stato da un test all'altro.
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/transazioni" element={<TransactionsPage />} />
          <Route path="/categorie" element={<CategoriesPage />} />
          <Route path="/ricorrenti" element={<RecurringPage />} />
          <Route path="/debiti" element={<DebtsPage />} />
          <Route path="/promemoria" element={<RemindersPage />} />
          <Route path="/risparmio" element={<SavingsPage />} />
          <Route path="/importa" element={<ImportPage />} />
          <Route path="/impostazioni" element={<SettingsPage />} />
          <Route path="/sezioni" element={<SectionsPage />} />
          <Route path="/profilo" element={<ProfilePage />} />
        </Route>
      </Route>
      {/* Una rotta sconosciuta riporta alla Dashboard invece di lasciare una
          pagina bianca: succede con un vecchio segnalibro o un link rotto. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <ThemeProvider>
      <CaseStyleProvider>
        <PaletteProvider>
          <OfflineSyncProvider>
            <AuthProvider>
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
            </AuthProvider>
          </OfflineSyncProvider>
        </PaletteProvider>
      </CaseStyleProvider>
    </ThemeProvider>
  )
}

export default App
