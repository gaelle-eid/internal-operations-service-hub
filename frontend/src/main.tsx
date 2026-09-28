import { createRoot, type Root } from 'react-dom/client';
import { FormEvent, useEffect, useState } from 'react';
import { Bot, CheckCircle2, ChevronRight, CircleAlert, Inbox, Plus, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { User, UserManager, WebStorageStateStore } from 'oidc-client-ts';
import './styles.css';

type Status = 'SUBMITTED' | 'ASSIGNED' | 'IN_PROGRESS' | 'WAITING_ON_REQUESTER' | 'RESOLVED' | 'CLOSED';
type ServiceRequest = { id: string; title: string; description: string; category: string; priority: string; departmentId: string; status: Status; assignedTo: string | null; createdAt: string };
type Comment = { id: string; requestId: string; authorId: string; body: string; createdAt: string };
type Notification = { id: string; userId: string; requestId: string; type: 'STATUS_CHANGE' | 'COMMENT' | 'REASSIGNMENT'; message: string; createdAt: string; readAt: string | null };
type StatusHistoryEntry = { id: string; requestId: string; fromStatus: Status | null; toStatus: Status; changedBy: string; changedAt: string };
type IntakeResponse = { outcome: 'READY' | 'NEEDS_CLARIFICATION' | 'INVALID_AI_OUTPUT' | 'PROVIDER_UNAVAILABLE'; candidate: { title: string; description: string; category: string; priority: string; departmentId: string } | null; clarification?: string };
type AgentResponse = { outcome: string; message?: string; tool?: string; result?: { id: string; title: string; status: Status; departmentId: string; assignedTo: string | null } };
type Actor = { id: string; role: 'employee' | 'staff' | 'admin'; departmentId?: string };

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const AUTH_MODE = import.meta.env.VITE_AUTH_MODE ?? 'oidc';
const MOCK_ACTOR: Actor = { id: 'employee-1', role: 'employee' };
let accessToken: string | undefined;
let mockActor: Actor | undefined;

const oidcSettings = {
  authority: import.meta.env.VITE_OIDC_AUTHORITY,
  client_id: import.meta.env.VITE_OIDC_CLIENT_ID,
  redirect_uri: `${window.location.origin}/auth/callback`,
  post_logout_redirect_uri: `${window.location.origin}/auth/signed-out`,
  response_type: 'code',
  scope: `openid profile email ${import.meta.env.VITE_OIDC_API_SCOPE ?? ''}`.trim(),
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  automaticSilentRenew: false,
  monitorSession: false,
};

const userManager = oidcSettings.authority && oidcSettings.client_id
  ? new UserManager(oidcSettings)
  : undefined;

function actorFromUser(user: User): Actor | undefined {
  const profile = user.profile as Record<string, unknown>;
  const subject = profile[import.meta.env.VITE_OIDC_SUBJECT_CLAIM || 'sub'];
  const rawRole = profile[import.meta.env.VITE_OIDC_ROLE_CLAIM || 'role'];
  const roleValues = Array.isArray(rawRole) ? rawRole : [rawRole];
  let roleMapping: Record<string, string> = {};
  try { roleMapping = JSON.parse(import.meta.env.VITE_OIDC_ROLE_MAP || '{}'); } catch { return undefined; }
  const mappedRole = roleValues
    .filter((value): value is string => typeof value === 'string')
    .map(value => roleMapping[value] ?? value)
    .find(value => ['employee', 'staff', 'admin'].includes(value));
  if (typeof subject !== 'string' || !['employee', 'staff', 'admin'].includes(mappedRole ?? '')) return undefined;
  const departmentClaim = profile[import.meta.env.VITE_OIDC_DEPARTMENT_CLAIM || 'departmentId'];
  return { id: subject, role: mappedRole as Actor['role'], departmentId: typeof departmentClaim === 'string' ? departmentClaim : undefined };
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> ?? {}) };
  if (accessToken) requestHeaders.Authorization = `Bearer ${accessToken}`;
  else if (mockActor) {
    requestHeaders['x-user-id'] = mockActor.id;
    requestHeaders['x-user-role'] = mockActor.role;
    if (mockActor.departmentId) requestHeaders['x-department-id'] = mockActor.departmentId;
  }
  const response = await fetch(`${API}${path}`, { ...options, headers: requestHeaders });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message ?? `Request failed (${response.status})`); }
  return response.json();
}

function App() {
  const [authLoading, setAuthLoading] = useState(AUTH_MODE !== 'mock');
  const [authError, setAuthError] = useState('');
  const [oidcUser, setOidcUser] = useState<User | null>(null);
  const [actor, setActor] = useState<Actor | null>(AUTH_MODE === 'mock' ? MOCK_ACTOR : null);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [selected, setSelected] = useState<ServiceRequest | null>(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [intakeText, setIntakeText] = useState('');
  const [intakeMessage, setIntakeMessage] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState('');
  const [assistantReply, setAssistantReply] = useState('');
  const [askingAssistant, setAskingAssistant] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commenting, setCommenting] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category: 'Hardware', priority: 'Medium', departmentId: 'IT' });

  const loadNotifications = async () => { try { setNotifications(await api<Notification[]>('/requests/notifications')); } catch (err) { setNotifications([]); } };
  const loadComments = async (requestId: string) => { try { setComments(await api<Comment[]>(`/requests/${requestId}/comments`)); } catch (err) { setComments([]); } };
  const loadHistory = async (requestId: string) => { try { setHistory(await api<StatusHistoryEntry[]>(`/requests/${requestId}/history`)); } catch (err) { setHistory([]); } };
  const load = async () => { try { setRequests(await api<ServiceRequest[]>('/requests')); setError(''); } catch (err) { setError(err instanceof Error ? err.message : 'Could not connect to the service'); } };
  useEffect(() => {
    if (AUTH_MODE === 'mock') {
      if (import.meta.env.PROD) {
        setAuthError('Mock authentication is disabled in production builds.');
        setAuthLoading(false);
        return;
      }
      mockActor = MOCK_ACTOR;
      accessToken = undefined;
      setAuthLoading(false);
      return;
    }
    if (AUTH_MODE !== 'oidc' || !userManager || !import.meta.env.VITE_OIDC_API_SCOPE) {
      setAuthError('Configure OIDC authority, client ID, and API scope, or explicitly enable mock mode for local development.');
      setAuthLoading(false);
      return;
    }
    const authenticate = async () => {
      try {
        if (window.location.pathname === '/auth/signed-out') {
          await userManager.removeUser();
          window.history.replaceState({}, document.title, '/');
          setAuthError('You have signed out.');
          setAuthLoading(false);
          return;
        }
        if (window.location.pathname === '/auth/callback') {
          await userManager.signinRedirectCallback();
          window.history.replaceState({}, document.title, '/');
        }
        let user = await userManager.getUser();
        if (!user || user.expired) {
          if (user) await userManager.removeUser();
          await userManager.signinRedirect();
          return;
        }
        const verifiedActor = actorFromUser(user);
        if (!verifiedActor) throw new Error('The ID token is missing configured subject or role claims.');
        accessToken = user.access_token;
        mockActor = undefined;
        setOidcUser(user);
        setActor(verifiedActor);
        setAuthLoading(false);
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Could not complete company login.');
        setAuthLoading(false);
      }
    };
    void authenticate();
  }, []);

  useEffect(() => { if (actor && !authLoading) void load(); }, [actor, authLoading]);
  useEffect(() => {
    if (!actor || authLoading) return;
    void loadNotifications();
    const refresh = window.setInterval(() => void loadNotifications(), 10000);
    return () => window.clearInterval(refresh);
  }, [actor, authLoading]);
  useEffect(() => {
    if (actor && selected) {
      void loadComments(selected.id);
      void loadHistory(selected.id);
    } else {
      setComments([]);
      setHistory([]);
    }
  }, [selected, actor]);

  const signOut = async () => {
    if (userManager && oidcUser) await userManager.signoutRedirect();
    else { accessToken = undefined; mockActor = undefined; setActor(null); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!actor) return;
    try { const created = await api<ServiceRequest>('/requests', { method: 'POST', body: JSON.stringify({ ...form, createdBy: actor.id }) }); setForm({ title: '', description: '', category: 'Hardware', priority: 'Medium', departmentId: 'IT' }); setShowForm(false); setSelected(created); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not submit request'); }
  };

  const analyze = async () => {
    if (!intakeText.trim()) return;
    setAnalyzing(true);
    setIntakeMessage('');
    try {
      const result = await api<IntakeResponse>('/requests/intake', { method: 'POST', body: JSON.stringify({ text: intakeText }) });
      if (result.candidate) {
        setForm({ title: result.candidate.title, description: result.candidate.description, category: result.candidate.category, priority: result.candidate.priority, departmentId: result.candidate.departmentId });
      }
      setIntakeMessage(result.outcome === 'READY' ? 'Candidate ready for your review.' : result.clarification ?? 'Please complete the request manually.');
    } catch (err) {
      setIntakeMessage(err instanceof Error ? err.message : 'The advisory intake is unavailable.');
    } finally {
      setAnalyzing(false);
    }
  };

  const openForm = () => {
    setIntakeText('');
    setIntakeMessage('');
    setForm({ title: '', description: '', category: 'Hardware', priority: 'Medium', departmentId: 'IT' });
    setShowForm(true);
  };

  const askAssistant = async () => {
    if (!assistantQuestion.trim()) return;
    setAskingAssistant(true);
    setAssistantReply('');
    try {
      const response = await api<AgentResponse>('/requests/agent', { method: 'POST', body: JSON.stringify({ message: assistantQuestion, ...(selected ? { requestId: selected.id } : {}) }) });
      setAssistantReply(response.message ?? (response.result ? `${response.result.title} is ${response.result.status.replace('_', ' ').toLowerCase()}.` : 'The assistant completed the request.'));
    } catch (err) {
      setAssistantReply(err instanceof Error ? err.message : 'The Requesty assistant is unavailable.');
    } finally {
      setAskingAssistant(false);
    }
  };

  const addComment = async () => {
    if (!actor || !selected || !commentText.trim()) return;
    setCommenting(true);
    try {
      await api(`/requests/${selected.id}/comments`, { method: 'POST', body: JSON.stringify({ body: commentText }) });
      setCommentText('');
      await loadComments(selected.id);
      await loadNotifications();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add comment');
    } finally {
      setCommenting(false);
    }
  };

  if (authLoading) return <div className="auth-state">Connecting to company login...</div>;
  if (authError || !actor) return <div className="auth-state"><ShieldCheck size={24} /><h1>{authError === 'You have signed out.' ? 'Signed out' : 'Sign-in unavailable'}</h1><p>{authError || 'No signed-in identity is available.'}</p>{authError === 'You have signed out.' && userManager && <button className="primary-button" type="button" onClick={() => void userManager.signinRedirect()}>Sign in</button>}</div>;

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark"><ShieldCheck size={18} /></span><span>service<br /><strong>hub</strong></span></div><div className="nav-label">Workspace</div><div className="nav-item active"><Inbox size={17} /> My requests <span className="nav-count">{requests.length}</span></div><div className="sidebar-footer"><div className="avatar">{actor.id.slice(0, 2).toUpperCase()}</div><div><strong>{actor.id}</strong><small>{AUTH_MODE === 'mock' ? 'Mock demo identity' : actor.role}</small>{userManager && oidcUser && <button className="signout-button" type="button" onClick={signOut}>Sign out</button>}</div></div></aside>
    <main className="main-content"><header className="topbar"><div><p className="eyebrow">Internal operations</p><h1>My requests</h1></div><button className="primary-button" onClick={openForm}><Plus size={17} /> New request</button></header>
      {error && <div className="alert"><CircleAlert size={17} /> {error}</div>}
      <section className="intro"><div><span className="section-kicker">Your service desk</span><h2>Make work move.</h2><p>Submit an internal request and keep every handoff visible.</p></div><div className="intro-stat"><strong>{requests.length.toString().padStart(2, '0')}</strong><span>open requests</span></div></section>
      <section className="notifications-strip"><div className="section-heading"><h3>Notifications</h3><span>{notifications.length} total</span></div><div className="notification-list">{notifications.length === 0 ? <p className="empty-notes">No notifications yet.</p> : notifications.slice(0, 5).map(item => <article className="notification-item" key={item.id}><strong>{item.type === 'STATUS_CHANGE' ? 'Status update' : item.type === 'COMMENT' ? 'New comment' : 'Request reassigned'}</strong><span>{item.message}</span><small>{requests.find(request => request.id === item.requestId)?.title ?? 'Request'} · {new Date(item.createdAt).toLocaleString()}</small></article>)}</div></section>
      <section className="content-grid"><div className="request-list"><div className="section-heading"><h3>Recent activity</h3><span>{requests.length} total</span></div>{requests.length === 0 ? <div className="empty"><Inbox size={28} /><strong>No requests yet</strong><p>Your next request will appear here.</p></div> : requests.map(item => <button className={`request-row ${selected?.id === item.id ? 'selected' : ''}`} key={item.id} onClick={() => setSelected(item)}><span className={`status-dot ${item.status.toLowerCase()}`} /><span className="request-copy"><strong>{item.title}</strong><small>{item.category} · {new Date(item.createdAt).toLocaleDateString()}</small></span><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status.replace('_', ' ')}</span><ChevronRight size={17} /></button>)}</div>
        <div className="detail-panel">{selected ? <><div className="detail-header"><div><span className={`status-pill ${selected.status.toLowerCase()}`}>{selected.status.replace('_', ' ')}</span><h3>{selected.title}</h3><p>{selected.description}</p></div></div><div className="meta-grid"><div><small>Department</small><strong>{selected.departmentId}</strong></div><div><small>Priority</small><strong>{selected.priority}</strong></div><div><small>Assigned to</small><strong>{selected.assignedTo ?? 'Awaiting owner'}</strong></div></div><div className="timeline"><div className="timeline-title">Status history <span>{history.length} events</span></div>{history.length === 0 ? <p className="empty-notes">No status history available.</p> : history.map(entry => <div className="timeline-step done" key={entry.id}><CheckCircle2 size={17} /><span>{entry.toStatus.replace(/_/g, ' ')}<small>{entry.fromStatus ? `${entry.fromStatus.replace(/_/g, ' ')} → ${entry.toStatus.replace(/_/g, ' ')}` : 'Request submitted'} · {entry.changedBy} · {new Date(entry.changedAt).toLocaleString()}</small></span></div>)}</div><section className="comments-panel"><div className="timeline-title">Comments <span>{comments.length} total</span></div>{comments.length === 0 ? <p className="empty-notes">No comments yet.</p> : <div className="comment-list">{comments.map(comment => <article className="comment-item" key={comment.id}><strong>{comment.authorId}</strong><span>{comment.body}</span><small>{new Date(comment.createdAt).toLocaleString()}</small></article>)}</div>}<div className="comment-box"><textarea value={commentText} onChange={event => setCommentText(event.target.value)} placeholder="Add a progress update or question..." /><button className="secondary-button" type="button" onClick={addComment} disabled={commenting || !commentText.trim()}>{commenting ? 'Sending...' : 'Send comment'}</button></div></section></> : <div className="detail-empty"><Send size={24} /><h3>Select a request</h3><p>Choose an item to inspect its status and history.</p></div>}</div></section><section className="assistant-panel global-assistant"><div className="assistant-heading"><div><span className="section-kicker">Requesty assistant</span><h3>Ask the service hub</h3><p>{selected ? `Selected request: ${selected.title}` : 'Ask about a request or describe what you need help with.'}</p></div><Bot size={20} /></div><textarea value={assistantQuestion} onChange={event => setAssistantQuestion(event.target.value)} placeholder="e.g. What is the status of this request?" /><button className="secondary-button" type="button" onClick={askAssistant} disabled={askingAssistant || !assistantQuestion.trim()}><Bot size={16} /> {askingAssistant ? 'Asking...' : 'Ask assistant'}</button>{assistantReply && <p className="assistant-reply">{assistantReply}</p>}</section>
    </main>
    {showForm && <div className="modal-backdrop" onClick={() => setShowForm(false)}><form className="modal" onSubmit={submit} onClick={event => event.stopPropagation()}><div className="modal-heading"><div><span className="section-kicker">New intake</span><h2>What do you need?</h2></div><button type="button" className="icon-button" onClick={() => setShowForm(false)}>×</button></div><label>Describe the request<textarea value={intakeText} onChange={event => setIntakeText(event.target.value)} placeholder="e.g. My laptop will not boot and I cannot work" /></label><button className="secondary-button" type="button" onClick={analyze} disabled={analyzing || !intakeText.trim()}><Sparkles size={16} /> {analyzing ? 'Analyzing...' : 'Suggest fields'}</button>{intakeMessage && <p className="intake-message">{intakeMessage}</p>}<label>Title<input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="e.g. Laptop will not boot" /></label><label>Description<textarea required value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Add the useful context..." /></label><div className="form-row"><label>Department<select value={form.departmentId} onChange={event => setForm({ ...form, departmentId: event.target.value })}><option>IT</option><option>HR</option><option>Finance</option></select></label><label>Priority<select value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })}><option>Low</option><option>Medium</option><option>High</option></select></label></div><button className="primary-button submit-button" type="submit"><Send size={16} /> Submit request</button></form></div>}
  </div>;
}

export default App;

const container = document.getElementById('root')!;
const hotState = globalThis as typeof globalThis & { serviceHubRoot?: Root };
const root = hotState.serviceHubRoot ?? createRoot(container);
hotState.serviceHubRoot = root;
root.render(<App />);
