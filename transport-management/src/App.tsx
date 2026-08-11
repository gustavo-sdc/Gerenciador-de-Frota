import { AuthContextProvider, AuthContext } from './hooks/authContext'
import { Route, BrowserRouter, Routes } from 'react-router-dom'

import Register from './pages/Register/Register'
import Login from './pages/Login/Login'
import MainDashboard from './pages/Dashboard/dashboard'
import React from 'react'
import PrivateRoute from './hooks/privateRoute'
import Frota from './pages/Frota/Frota'
import Clientes from './pages/Clientes/Clientes'
import Rotas from './pages/Rotas/Rotas'
import Financeiro from './pages/Financeiro/Financeiro'
import Motoristas from './pages/Motoristas/Motoristas'
import GestaoFrota from './pages/Frota/GestaoFrota'
import Recovery from './pages/Recovery/Recovery.'

function App() {
  const authContextData = React.useContext(AuthContext);

  console.log(authContextData.isAuthenticated)


  return (
    <AuthContextProvider>
      <BrowserRouter>
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
          

          <Route path="/" element={<Login />} />
          <Route path="/register">
            <Route index element={<Register />} />
            <Route path=".../login" element={<Login />} />
          </Route>
          <Route path="/recovery/" element={<Recovery />} />

        </Routes>
      </BrowserRouter>
    </AuthContextProvider>
  )
}

export default App
 