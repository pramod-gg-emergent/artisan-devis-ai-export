import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import QuotesList from "@/pages/QuotesList";
import NewQuote from "@/pages/NewQuote";
import QuoteDetail from "@/pages/QuoteDetail";
import Settings from "@/pages/Settings";
import PublicQuote from "@/pages/PublicQuote";
import Assistant from "@/pages/Assistant";

function AppShell() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/devis" element={<QuotesList />} />
        <Route path="/nouveau" element={<NewQuote />} />
        <Route path="/devis/:id" element={<QuoteDetail />} />
        <Route path="/parametres" element={<Settings />} />
        <Route path="/assistant" element={<Assistant />} />
      </Routes>
    </Layout>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/devis-client/:token" element={<PublicQuote />} />
          <Route path="/*" element={<AppShell />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" richColors />
    </div>
  );
}

export default App;
