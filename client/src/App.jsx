import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { Nav } from './components/Nav.jsx';
import { Login } from './pages/Login.jsx';
import { NewRegistration } from './pages/registrar/NewRegistration.jsx';
import { MyRegistrations } from './pages/registrar/MyRegistrations.jsx';
import { Scanner } from './pages/gate/Scanner.jsx';
import { DistrictScanner } from './pages/district/DistrictScanner.jsx';
import { Dashboard } from './pages/admin/Dashboard.jsx';
import { Registrations } from './pages/admin/Registrations.jsx';
import { Users } from './pages/admin/Users.jsx';
import { MasterData } from './pages/admin/MasterData.jsx';

const HOME_BY_ROLE = { admin: '/admin', registrar: '/registrar', gate_scanner: '/gate', district_scanner: '/district-checkpoint' };

function Home() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={HOME_BY_ROLE[user.role] || '/login'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Nav />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Home />} />

          <Route path="/registrar" element={<ProtectedRoute roles={['registrar']}><MyRegistrations /></ProtectedRoute>} />
          <Route path="/registrar/new" element={<ProtectedRoute roles={['registrar']}><NewRegistration /></ProtectedRoute>} />

          <Route path="/gate" element={<ProtectedRoute roles={['gate_scanner']}><Scanner /></ProtectedRoute>} />
          <Route path="/district-checkpoint" element={<ProtectedRoute roles={['district_scanner']}><DistrictScanner /></ProtectedRoute>} />

          <Route path="/admin" element={<ProtectedRoute roles={['admin']}><Dashboard /></ProtectedRoute>} />
          <Route path="/admin/registrations" element={<ProtectedRoute roles={['admin']}><Registrations /></ProtectedRoute>} />
          <Route path="/admin/registrations/new" element={<ProtectedRoute roles={['admin']}><NewRegistration /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute roles={['admin']}><Users /></ProtectedRoute>} />
          <Route path="/admin/master-data" element={<ProtectedRoute roles={['admin']}><MasterData /></ProtectedRoute>} />

          <Route path="*" element={<Home />} />
        </Routes>
        <footer className="app-footer">Powered by <strong>Innovaisz Solutions</strong></footer>
      </AuthProvider>
    </BrowserRouter>
  );
}
