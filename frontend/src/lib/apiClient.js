import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API });

export const api = {
  company: () => client.get("/company").then((r) => r.data),
  updateCompany: (payload) => client.put("/company", payload).then((r) => r.data),
  catalog: () => client.get("/catalog").then((r) => r.data),
  updateCatalog: (items) => client.put("/catalog", { items }).then((r) => r.data),
  resetCatalog: () => client.post("/catalog/reset").then((r) => r.data),
  stats: () => client.get("/dashboard/stats").then((r) => r.data),
  quotes: (statut) =>
    client.get("/quotes", { params: statut ? { statut } : {} }).then((r) => r.data),
  quote: (id) => client.get(`/quotes/${id}`).then((r) => r.data),
  createQuote: (payload) => client.post("/quotes", payload).then((r) => r.data),
  updateQuote: (id, payload) => client.put(`/quotes/${id}`, payload).then((r) => r.data),
  analyze: (description, answers) =>
    client.post("/analyze", { description, answers }).then((r) => r.data),
  dispatchAnswers: (questions, transcript) =>
    client.post("/dispatch-answers", { questions, transcript }).then((r) => r.data),
  editVoice: (lignes, transcript) =>
    client.post("/edit-voice", { lignes, transcript }).then((r) => r.data),
  parseClient: (transcript) =>
    client.post("/parse-client", { transcript }).then((r) => r.data),
  setStatus: (id, statut, extra = {}) =>
    client.post(`/quotes/${id}/status`, { statut, ...extra }).then((r) => r.data),
  relanceMessage: (id) => client.post(`/quotes/${id}/relance`).then((r) => r.data),
  markRelance: (id) => client.post(`/quotes/${id}/mark-relance`).then((r) => r.data),
  pdfUrl: (id) => `${API}/quotes/${id}/pdf`,
  emailPreview: (id) => client.get(`/quotes/${id}/email-preview`).then((r) => r.data),
  sendEmail: (id, payload) => client.post(`/quotes/${id}/send-email`, payload).then((r) => r.data),
  publicQuote: (token) => client.get(`/public/quotes/${token}`).then((r) => r.data),
  publicAccept: (token) => client.post(`/public/quotes/${token}/accept`).then((r) => r.data),
  publicRefuse: (token, comment) =>
    client.post(`/public/quotes/${token}/refuse`, { comment }).then((r) => r.data),
};

export default api;
