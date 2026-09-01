import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import QuotesList from "@/pages/QuotesList";
import NewQuote from "@/pages/NewQuote";
import QuoteDetail from "@/pages/QuoteDetail";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/devis" element={<QuotesList />} />
            <Route path="/nouveau" element={<NewQuote />} />
            <Route path="/devis/:id" element={<QuoteDetail />} />
          </Routes>
        </Layout>
      </BrowserRouter>
      <Toaster position="top-center" richColors />
    </div>
  );
}

export default App;
