import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Login from './page/Login'
import Layout from './components/Layout'
import QuanLyNguoiDung from './page/Admin/QuanLyNguoiDung'
import QuanLyGiaoDich from './page/Admin/QuanLyGiaoDich'
import DanhSachBaoCao from './page/Admin/DanhSachBaoCao'
import { authAPI } from './service/api'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = () => {
      try {
        const user = authAPI.getCurrentUser()
        if (user) {
          setIsAuthenticated(true)
          setIsAdmin(user.la_admin || false)
        } else {
          setIsAuthenticated(false)
          setIsAdmin(false)
        }
      } catch (error) {
        console.error('Auth check error:', error)
        setIsAuthenticated(false)
        setIsAdmin(false)
      } finally {
        setLoading(false)
      }
    }
    
    checkAuth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogin = (userData) => {
    setIsAuthenticated(true)
    setIsAdmin(userData?.la_admin || false)
  }

  const handleLogout = () => {
    authAPI.logout()
    setIsAuthenticated(false)
    setIsAdmin(false)
  }

  // Show loading while checking auth
  if (loading) {
  return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600 font-sans-medium">Đang tải...</p>
      </div>
      </div>
    )
  }

  return (
    <BrowserRouter basename="/quanlydiem">
      <Routes>
        {/* Public Route - Login */}
        <Route 
          path="/login" 
          element={
            isAuthenticated ? (
              <Navigate to="/quan-ly-giao-dich" replace />
            ) : (
              <Login onLogin={handleLogin} />
            )
          } 
        />

        {/* Public Route - Quản lý người dùng (có thể xem khi chưa đăng nhập) */}
        <Route
          path="/quan-ly-nguoi-dung"
          element={
            <Layout isAdmin={isAuthenticated && isAdmin} showSidebar={isAuthenticated && isAdmin} onLogout={handleLogout}>
              <QuanLyNguoiDung isAuthenticated={isAuthenticated} isAdmin={isAdmin} onLogout={handleLogout} />
            </Layout>
          }
        />
        
        {/* Protected Routes - Admin */}
        <Route
          path="/quan-ly-giao-dich"
          element={
            isAuthenticated && isAdmin ? (
              <Layout isAdmin={isAdmin}>
                <QuanLyGiaoDich />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/danh-sach-bao-cao"
          element={
            isAuthenticated && isAdmin ? (
              <Layout isAdmin={isAdmin}>
                <DanhSachBaoCao />
              </Layout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* Default redirect */}
        <Route 
          path="/" 
          element={
            loading ? (
              <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-4 text-gray-600 font-sans-medium">Đang tải...</p>
                </div>
              </div>
            ) : (
              <Navigate to="/quan-ly-nguoi-dung" replace />
            )
          } 
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
