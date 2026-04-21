import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RankingPage from "./pages/RankingPage";
import FavoritesPage from "./pages/FavoritesPage";
import MapApp from "./pages/MapApp";
import PlaceReportPage from "./pages/PlaceReportPage";
import SearchPage from "./pages/SearchPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<MapApp />} />
        <Route path="/ranking" element={<RankingPage />} />
        <Route path="/report/:placeName" element={<PlaceReportPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;