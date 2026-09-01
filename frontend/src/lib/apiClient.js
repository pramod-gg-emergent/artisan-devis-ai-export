import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API });

export const api = {
  company: () => client.get("/company").then((r) => r.data),
  stats: () => client.get("/dashboard/stats").then((r) => r.data),
  quotes: (statut) =>
    client.get("/quotes", { params: statut ? { statut } : {} }).then((r) => r.data),
  quote: (id) => client.get(`/quotes/${id}`).then((r) => r.data),
  createQuote: (payload) => client.post("/quotes", payload).then((r) => r.data),
  updateQuote: (id, payload) => client.put(`/quotes/${id}`, payload).then((r) => r.data),
  analyze: (description) => client.post("/analyze", { description }).then((r) => r.data),
  setStatus: (id, statut) =>
    client.post(`/quotes/${id}/status`, { statut }).then((r) => r.data),
  relanceMessage: (id) => client.post(`/quotes/${id}/relance`).then((r) => r.data),
  markRelance: (id) => client.post(`/quotes/${id}/mark-relance`).then((r) => r.data),
};

export default api;
