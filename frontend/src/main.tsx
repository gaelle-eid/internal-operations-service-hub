import { createRoot, type Root } from 'react-dom/client';
import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight, CircleAlert, Inbox, Plus, Send, ShieldCheck } from 'lucide-react';
import './styles.css';

type Status = 'SUBMITTED' | 'ASSIGNED' | 'IN_PROGRESS';
type ServiceRequest = { id: string; title: string; description: string; category: string; priority: string; departmentId: string; status: Status; assignedTo: string | null; createdAt: string };
type Actor = { id: string; role: 'employee' | 'staff'; departmentId?: string };

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const actor: Actor = { id: 'employee-1', role: 'employee' };
const headers = () => ({ 'Content-Type': 'application/json', 'x-user-id': actor.id, 'x-user-role': actor.role, ...(actor.departmentId ? { 'x-department-id': actor.departmentId } : {}) });

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...options, headers: { ...headers(), ...(options.headers ?? {}) } });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message ?? `Request failed (${response.status})`); }
  return response.json();
}

function App() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [selected, setSelected] = useState<ServiceRequest | null>(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category: 'Hardware', priority: 'Medium', departmentId: 'IT' });

  const load = async () => { try { setRequests(await api<ServiceRequest[]>('/requests')); setError(''); } catch (err) { setError(err instanceof Error ? err.message : 'Could not connect to the service'); } };
  useEffect(() => { load(); }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try { await api('/requests', { method: 'POST', body: JSON.stringify({ ...form, createdBy: actor.id }) }); setForm({ title: '', description: '', category: 'Hardware', priority: 'Medium', departmentId: 'IT' }); setShowForm(false); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not submit request'); }
  };

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark"><ShieldCheck size={18} /></span><span>service<br /><strong>hub</strong></span></div><div className="nav-label">Workspace</div><div className="nav-item active"><Inbox size={17} /> My requests <span className="nav-count">{requests.length}</span></div><div className="sidebar-footer"><div className="avatar">GM</div><div><strong>Gaelle Martin</strong><small>Employee · Internal</small></div></div></aside>
    <main className="main-content"><header className="topbar"><div><p className="eyebrow">Internal operations</p><h1>My requests</h1></div><button className="primary-button" onClick={() => setShowForm(true)}><Plus size={17} /> New request</button></header>
      {error && <div className="alert"><CircleAlert size={17} /> {error}</div>}
      <section className="intro"><div><span className="section-kicker">Your service desk</span><h2>Make work move.</h2><p>Submit an internal request and keep every handoff visible.</p></div><div className="intro-stat"><strong>{requests.length.toString().padStart(2, '0')}</strong><span>open requests</span></div></section>
      <section className="content-grid"><div className="request-list"><div className="section-heading"><h3>Recent activity</h3><span>{requests.length} total</span></div>{requests.length === 0 ? <div className="empty"><Inbox size={28} /><strong>No requests yet</strong><p>Your next request will appear here.</p></div> : requests.map(item => <button className={`request-row ${selected?.id === item.id ? 'selected' : ''}`} key={item.id} onClick={() => setSelected(item)}><span className={`status-dot ${item.status.toLowerCase()}`} /><span className="request-copy"><strong>{item.title}</strong><small>{item.category} · {new Date(item.createdAt).toLocaleDateString()}</small></span><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status.replace('_', ' ')}</span><ChevronRight size={17} /></button>)}</div>
        <div className="detail-panel">{selected ? <><div className="detail-header"><div><span className={`status-pill ${selected.status.toLowerCase()}`}>{selected.status.replace('_', ' ')}</span><h3>{selected.title}</h3><p>{selected.description}</p></div></div><div className="meta-grid"><div><small>Department</small><strong>{selected.departmentId}</strong></div><div><small>Priority</small><strong>{selected.priority}</strong></div><div><small>Assigned to</small><strong>{selected.assignedTo ?? 'Awaiting owner'}</strong></div></div><div className="timeline"><div className="timeline-title">Lifecycle <span>Audit trail is append-only</span></div><div className="timeline-step done"><CheckCircle2 size={17} /><span>Submitted<small>Request received</small></span></div><div className={`timeline-step ${selected.status !== 'SUBMITTED' ? 'done' : ''}`}><CheckCircle2 size={17} /><span>Assigned<small>{selected.status === 'SUBMITTED' ? 'Waiting for department' : 'Owner claimed request'}</small></span></div><div className={`timeline-step ${selected.status === 'IN_PROGRESS' ? 'done' : ''}`}><CheckCircle2 size={17} /><span>In progress<small>{selected.status === 'IN_PROGRESS' ? 'Work has started' : 'Next lifecycle step'}</small></span></div></div></> : <div className="detail-empty"><Send size={24} /><h3>Select a request</h3><p>Choose an item to inspect its status and history.</p></div>}</div></section>
    </main>
    {showForm && <div className="modal-backdrop" onClick={() => setShowForm(false)}><form className="modal" onSubmit={submit} onClick={event => event.stopPropagation()}><div className="modal-heading"><div><span className="section-kicker">New intake</span><h2>What do you need?</h2></div><button type="button" className="icon-button" onClick={() => setShowForm(false)}>×</button></div><label>Title<input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="e.g. Laptop will not boot" /></label><label>Description<textarea required value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Add the useful context..." /></label><div className="form-row"><label>Department<select value={form.departmentId} onChange={event => setForm({ ...form, departmentId: event.target.value })}><option>IT</option><option>HR</option><option>Finance</option></select></label><label>Priority<select value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })}><option>Low</option><option>Medium</option><option>High</option></select></label></div><button className="primary-button submit-button" type="submit"><Send size={16} /> Submit request</button></form></div>}
  </div>;
}

export default App;

const container = document.getElementById('root')!;
const hotState = globalThis as typeof globalThis & { serviceHubRoot?: Root };
const root = hotState.serviceHubRoot ?? createRoot(container);
hotState.serviceHubRoot = root;
root.render(<App />);
