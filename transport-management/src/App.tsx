import { lazy, Suspense } from 'react'
import { AuthContextProvider } from './hooks/authContext'
import { Route, BrowserRouter, Routes } from 'react-router-dom'

import PrivateRoute from './hooks/privateRoute'
import ResourceManager from './components/ResourceManager'
import AuthDeepLinkHandler from './components/AuthDeepLinkHandler'
import { AppErrorBoundary, AppErrorReporter } from './components/AppErrorReporter'

const Register = lazy(() => import('./pages/Register/Register'))
const Login = lazy(() => import('./pages/Login/Login'))
const MainDashboard = lazy(() => import('./pages/Dashboard/dashboard'))
const Frota = lazy(() => import('./pages/Frota/Frota'))
const Clientes = lazy(() => import('./pages/Clientes/Clientes'))
const Rotas = lazy(() => import('./pages/Rotas/Rotas'))
const Financeiro = lazy(() => import('./pages/Financeiro/Financeiro'))
const Motoristas = lazy(() => import('./pages/Motoristas/Motoristas'))
const GestaoFrota = lazy(() => import('./pages/Frota/GestaoFrota'))
const Recovery = lazy(() => import('./pages/Recovery/Recovery.'))
const PrevisoesManutencao = lazy(() => import('./pages/Manutencoes/PrevisoesManutencao'))
const RegrasManutencao = lazy(() => import('./pages/Manutencoes/RegrasManutencao'))
const AccountDeletion = lazy(() => import('./pages/AccountDeletion/AccountDeletion'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy/PrivacyPolicy'))
const Profile = lazy(() => import('./pages/Profile/Profile'))
const AdminPanel = import.meta.env.MODE === 'android' ? null : lazy(() => import('./pages/Admin/AdminPanel'))
const SupportPage = lazy(() => import('./pages/Support/SupportPage'))

function App() {
  return (
    <AuthContextProvider>
      <BrowserRouter>
        <AuthDeepLinkHandler />
        <AppErrorReporter />
        <AppErrorBoundary>
        <Suspense fallback={<main role="status" className="grid min-h-[60vh] place-items-center px-5 text-base font-semibold text-slate-700">Carregando tela…</main>}>
        <Routes>
          <Route path="/dashboard" element={
            <PrivateRoute>
              <MainDashboard />
            </PrivateRoute>
          } />
          <Route path="/frota" element={
            <PrivateRoute>
              <Frota />
            </PrivateRoute>
          } />
          <Route path="/frota/novo/:id?" element={
            <PrivateRoute>
              <GestaoFrota />
            </PrivateRoute>
          } />
          <Route path="/motoristas" element={
            <PrivateRoute>
              <Motoristas />
            </PrivateRoute>
          } />
          <Route path="/rotas" element={
            <PrivateRoute>
              <Rotas />
            </PrivateRoute>
          } />
          <Route path="/clientes" element={
            <PrivateRoute>
              <Clientes />
            </PrivateRoute>
          } />
          <Route path="/financeiro" element={
            <PrivateRoute>
              <Financeiro />
            </PrivateRoute>
          } />
          <Route path="/manutencoes" element={<PrivateRoute><ResourceManager resource="maintenances" /></PrivateRoute>} />
          <Route path="/manutencoes/previsoes" element={<PrivateRoute><PrevisoesManutencao /></PrivateRoute>} />
          <Route path="/manutencoes/regras" element={<PrivateRoute><RegrasManutencao /></PrivateRoute>} />
          

          <Route path="/" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/recovery" element={<Recovery />} />
          <Route path="/excluir-conta" element={<AccountDeletion />} />
          <Route path="/privacidade" element={<PrivacyPolicy />} />
          <Route path="/perfil" element={<Profile />} />
          <Route path="/suporte" element={<SupportPage />} />
          {AdminPanel && <Route path="/admin" element={<AdminPanel />} />}

        </Routes>
        </Suspense>
        </AppErrorBoundary>
      </BrowserRouter>
    </AuthContextProvider>
  )
}

export default App
