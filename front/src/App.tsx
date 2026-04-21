import type { ReactElement } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RankingPage from "./pages/RankingPage";
import FavoritesPage from "./pages/FavoritesPage";
import MapApp from "./pages/MapApp";
import PlaceReportPage from "./pages/PlaceReportPage";
import SearchPage from "./pages/SearchPage";

function RequireAuth({ children }: { children: ReactElement }) {
  const token = sessionStorage.getItem("accessToken");
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAuth><MapApp /></RequireAuth>} />
        <Route path="/ranking" element={<RequireAuth><RankingPage /></RequireAuth>} />
        <Route path="/report/:placeName" element={<RequireAuth><PlaceReportPage /></RequireAuth>} />
        <Route path="/favorites" element={<RequireAuth><FavoritesPage /></RequireAuth>} />
        <Route path="/search" element={<RequireAuth><SearchPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;