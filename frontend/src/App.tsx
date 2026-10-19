import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout, GuestOnly, RequireAuth } from './components/Layout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import MyRequests from './pages/MyRequests';
import Drafts from './pages/Drafts';
import RequestForm from './pages/RequestForm';
import NewRequest from './pages/NewRequest';
import GroupDetail from './pages/GroupDetail';
import RequestDetail from './pages/RequestDetail';
import Account from './pages/Account';
import AdminRequests from './pages/admin/AdminRequests';
import AdminUsers from './pages/admin/AdminUsers';
import AdminUserDetail from './pages/admin/AdminUserDetail';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
      </Route>
      <Route path="/reset-password/:token" element={<ResetPassword />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/requests/:id" element={<RequestDetail />} />
          <Route path="/groups/:groupNo" element={<GroupDetail />} />
          <Route path="/account" element={<Account />} />
          {/* Access Admins only view requests, so they get no request-creation pages. */}
          <Route element={<RequireAuth roles={['user', 'access_controller']} />}>
            <Route path="/requests" element={<MyRequests />} />
            <Route path="/requests/new" element={<NewRequest />} />
            <Route path="/requests/:id/edit" element={<RequestForm />} />
            <Route path="/drafts" element={<Drafts />} />
          </Route>
          <Route element={<RequireAuth roles={['access_controller', 'access_admin']} />}>
            <Route path="/admin" element={<Navigate to="/admin/requests" replace />} />
            <Route path="/admin/requests" element={<AdminRequests />} />
          </Route>
          <Route element={<RequireAuth roles={['access_controller']} />}>
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/users/:id" element={<AdminUserDetail />} />
          </Route>
        </Route>
      </Route>

      {/* Old URLs from the server-rendered app */}
      <Route path="/admin/login" element={<Navigate to="/login" replace />} />
      <Route path="/admin/dashboard" element={<Navigate to="/dashboard" replace />} />
      <Route path="/user/dashboad" element={<Navigate to="/dashboard" replace />} />
      <Route path="/user/request" element={<Navigate to="/requests" replace />} />
      <Route path="/user/new_request" element={<Navigate to="/requests/new" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
