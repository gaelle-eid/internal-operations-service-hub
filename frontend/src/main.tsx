import { createRoot, type Root } from 'react-dom/client';
import { FormEvent, useEffect, useState } from 'react';
import { Bot, CheckCircle2, ChevronRight, CircleAlert, Inbox, Plus, Search, Send, ShieldCheck, Sparkles, X } from 'lucide-react';
import { User, UserManager, WebStorageStateStore } from 'oidc-client-ts';
import './styles.css';

type Status = 'SUBMITTED' | 'ASSIGNED' | 'IN_PROGRESS' | 'WAITING_ON_REQUESTER' | 'RESOLVED' | 'CLOSED';
type ServiceRequest = { id: string; title: string; description: string; category: string; priority: string; departmentId: string; status: Status; assignedTo: string | null; createdBy: string; createdAt: string };
type Comment = { id: string; requestId: string; authorId: string; body: string; createdAt: string };
type Notification = { id: string; userId: string; requestId: string; type: 'STATUS_CHANGE' | 'COMMENT' | 'REASSIGNMENT'; message: string; createdAt: string; readAt: string | null };
type StatusHistoryEntry = { id: string; requestId: string; fromStatus: Status | null; toStatus: Status; changedBy: string; changedAt: string };
type IntakeResponse = { outcome: 'READY' | 'NEEDS_CLARIFICATION' | 'INVALID_AI_OUTPUT' | 'PROVIDER_UNAVAILABLE'; candidate: { title: string; description: string; category: string; priority: string; departmentId: string } | null; clarification?: string };
type AgentResponse = { outcome: string; message?: string; tool?: string; result?: { id: string; title: string; status: Status; departmentId: string; assignedTo: string | null } };
type Actor = { id: string; role: 'employee' | 'staff' | 'manager' | 'admin'; departmentId?: string };

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const AUTH_MODE = import.meta.env.VITE_AUTH_MODE ?? 'oidc';
const MOCK_ACTOR: Actor = { id: 'employee-1', role: 'employee' };
const MOCK_ACTORS: Actor[] = [
  MOCK_ACTOR,
  { id: 'it-staff-1', role: 'staff', departmentId: 'IT' },
  { id: 'it-staff-2', role: 'staff', departmentId: 'IT' },
  { id: 'it-manager-1', role: 'manager', departmentId: 'IT' },
  { id: 'it-admin-1', role: 'admin', departmentId: 'IT' },
  { id: 'hr-staff-1', role: 'staff', departmentId: 'HR' },
  { id: 'hr-manager-1', role: 'manager', departmentId: 'HR' },
  { id: 'hr-admin-1', role: 'admin', departmentId: 'HR' },
  { id: 'finance-staff-1', role: 'staff', departmentId: 'Finance' },
  { id: 'finance-manager-1', role: 'manager', departmentId: 'Finance' },
  { id: 'finance-admin-1', role: 'admin', departmentId: 'Finance' },
];
const NEXT_STATUSES: Record<Status, Status[]> = {
  SUBMITTED: ['ASSIGNED'],
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['WAITING_ON_REQUESTER', 'RESOLVED'],
  WAITING_ON_REQUESTER: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['IN_PROGRESS', 'CLOSED'],
  CLOSED: [],
};
const STATUS_ORDER: Record<Status, number> = { SUBMITTED: 0, ASSIGNED: 1, IN_PROGRESS: 2, WAITING_ON_REQUESTER: 3, RESOLVED: 4, CLOSED: 5 };
const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
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
  const [queueSort, setQueueSort] = useState<'createdAt' | 'status' | 'priority'>('createdAt');
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [requestSearch, setRequestSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status | ''>('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
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
  const [actionPending, setActionPending] = useState(false);
  const [reassignTarget, setReassignTarget] = useState('');
  const [escalateTarget, setEscalateTarget] = useState('');
  const [form, setForm] = useState({ title: '', description: '', category: 'Hardware', priority: 'Medium', departmentId: 'IT' });

  const filteredRequests = requests.filter(item => {
    const normalizedSearch = requestSearch.trim().toLowerCase();
    const matchesSearch = !normalizedSearch || `${item.title} ${item.description} ${item.category}`.toLowerCase().includes(normalizedSearch);
    const date = new Date(item.createdAt);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    return matchesSearch
      && (!statusFilter || item.status === statusFilter)
      && (!departmentFilter || item.departmentId === departmentFilter)
      && (!dateFilter || localDate === dateFilter);
  });
  const hasRequestFilters = Boolean(requestSearch || statusFilter || departmentFilter || dateFilter);

  const loadNotifications = async () => { try { setNotifications(await api<Notification[]>('/requests/notifications')); } catch (err) { setNotifications([]); } };
  const loadComments = async (requestId: string) => { try { setComments(await api<Comment[]>(`/requests/${requestId}/comments`)); } catch (err) { setComments([]); } };
  const loadHistory = async (requestId: string) => { try { setHistory(await api<StatusHistoryEntry[]>(`/requests/${requestId}/history`)); } catch (err) { setHistory([]); } };
  const load = async () => {
    try {
      const items = await api<ServiceRequest[]>('/requests');
      const visibleItems = actor?.role === 'admin' ? items.filter(item => item.status !== 'CLOSED') : items;
      visibleItems.sort((left, right) => {
        if (queueSort === 'status') return STATUS_ORDER[left.status] - STATUS_ORDER[right.status] || right.createdAt.localeCompare(left.createdAt);
        if (queueSort === 'priority') return PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority] || right.createdAt.localeCompare(left.createdAt);
        return right.createdAt.localeCompare(left.createdAt);
      });
      setRequests(visibleItems);
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not connect to the service'); }
  };
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

  useEffect(() => { if (actor && !authLoading) void load(); }, [actor, authLoading, queueSort]);
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

  const switchMockActor = (actorId: string) => {
    const nextActor = MOCK_ACTORS.find(item => item.id === actorId);
    if (!nextActor) return;
    mockActor = nextActor;
    accessToken = undefined;
    setActor(nextActor);
    setSelected(null);
    setError('');
  };

  const transitionRequest = async (toStatus: Status) => {
    if (!actor || !selected) return;
    setActionPending(true);
    try {
      const updated = await api<ServiceRequest>(`/requests/${selected.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ toStatus, changedBy: actor.id }),
      });
      setSelected(updated);
      await Promise.all([load(), loadHistory(updated.id), loadNotifications()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update request status');
    } finally {
      setActionPending(false);
    }
  };

  const reassignRequest = async () => {
    if (!actor || actor.role !== 'admin' || !selected || !reassignTarget) return;
    setActionPending(true);
    try {
      const updated = await api<ServiceRequest>(`/requests/${selected.id}/reassign`, {
        method: 'PATCH',
        body: JSON.stringify({ assignedTo: reassignTarget }),
      });
      setSelected(updated);
      setReassignTarget('');
      await Promise.all([load(), loadNotifications()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reassign request');
    } finally {
      setActionPending(false);
    }
  };

  const escalateRequest = async () => {
    if (!actor || actor.role !== 'admin' || !selected || !escalateTarget) return;
    setActionPending(true);
    try {
      const updated = await api<ServiceRequest>(`/requests/${selected.id}/escalate`, {
        method: 'PATCH',
        body: JSON.stringify({ managerId: escalateTarget }),
      });
      setSelected(updated);
      setEscalateTarget('');
      await Promise.all([load(), loadNotifications()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not escalate request');
    } finally {
      setActionPending(false);
    }
  };

  const hasStaffControl = Boolean(actor && selected && (
    actor.role === 'admin'
    || actor.id === selected.assignedTo
    || (actor.role === 'staff' && selected.status === 'SUBMITTED' && selected.assignedTo === null)
  ));
  const canRequesterReopen = Boolean(actor && selected && selected.status === 'RESOLVED' && actor.id === selected.createdBy);
  const availableTransitions = selected && (hasStaffControl || canRequesterReopen)
    ? NEXT_STATUSES[selected.status]
      .filter(status => !(actor?.role === 'admin' && status === 'ASSIGNED'))
      .filter(status => hasStaffControl || status === 'IN_PROGRESS')
    : [];
  const assigneeOptions = selected && actor?.role === 'admin' && AUTH_MODE === 'mock'
    ? MOCK_ACTORS.filter(item => item.role === 'staff' && item.departmentId === selected.departmentId)
    : [];
  const managerOptions = selected && actor?.role === 'admin' && AUTH_MODE === 'mock'
    ? MOCK_ACTORS.filter(item => item.role === 'manager' && item.departmentId === selected.departmentId)
    : [];
  const canComment = Boolean(actor && selected && (
    actor.role === 'admin' || actor.id === selected.createdBy || actor.id === selected.assignedTo
  ));

  if (authLoading) return <div className="auth-state">Connecting to company login...</div>;
  if (authError || !actor) return <div className="auth-state"><ShieldCheck size={24} /><h1>{authError === 'You have signed out.' ? 'Signed out' : 'Sign-in unavailable'}</h1><p>{authError || 'No signed-in identity is available.'}</p>{authError === 'You have signed out.' && userManager && <button className="primary-button" type="button" onClick={() => void userManager.signinRedirect()}>Sign in</button>}</div>;

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark"><ShieldCheck size={18} /></span><span>service<br /><strong>hub</strong></span></div><div className="nav-label">Workspace</div><div className="nav-item active"><Inbox size={17} /> {actor.role === 'employee' ? 'My requests' : 'Department queue'} <span className="nav-count">{requests.length}</span></div><div className="sidebar-footer"><div className="avatar">{actor.id.slice(0, 2).toUpperCase()}</div><div><strong>{actor.id}</strong><small>{AUTH_MODE === 'mock' ? 'Mock demo identity' : actor.role}</small>{userManager && oidcUser && <button className="signout-button" type="button" onClick={signOut}>Sign out</button>}</div></div></aside>
    <main className="main-content"><header className="topbar"><div><p className="eyebrow">Internal operations</p><h1>{actor.role === 'employee' ? 'My requests' : `${actor.departmentId ?? 'Department'} queue`}</h1></div>{actor.role === 'employee' && <button className="primary-button" onClick={openForm}><Plus size={17} /> New request</button>}</header>
      {error && <div className="alert"><CircleAlert size={17} /> {error}</div>}
      <section className="intro"><div><span className="section-kicker">Your service desk</span><h2>Make work move.</h2><p>Submit an internal request and keep every handoff visible.</p></div><div className="intro-stat"><strong>{requests.length.toString().padStart(2, '0')}</strong><span>open requests</span></div></section>
      {AUTH_MODE === 'mock' && <section className="mock-controls"><label>Demo identity<select value={actor.id} onChange={event => switchMockActor(event.target.value)}>{MOCK_ACTORS.map(item => <option key={item.id} value={item.id}>{item.id} · {item.role}{item.departmentId ? ` · ${item.departmentId}` : ''}</option>)}</select></label></section>}
      <section className="notifications-strip"><div className="section-heading"><h3>Notifications</h3><span>{notifications.length} total</span></div><div className="notification-list">{notifications.length === 0 ? <p className="empty-notes">No notifications yet.</p> : notifications.slice(0, 5).map(item => <article className="notification-item" key={item.id}><strong>{item.type === 'STATUS_CHANGE' ? 'Status update' : item.type === 'COMMENT' ? 'New comment' : 'Request reassigned'}</strong><span>{item.message}</span><small>{requests.find(request => request.id === item.requestId)?.title ?? 'Request'} · {new Date(item.createdAt).toLocaleString()}</small></article>)}</div></section>
      <section className="content-grid">
        <div className="request-list">
          <div className="section-heading"><h3>{actor.role === 'employee' ? 'Recent activity' : `${actor.departmentId} requests`}</h3>{actor.role === 'admin' && <label className="sort-control">Sort<select value={queueSort} onChange={event => setQueueSort(event.target.value as typeof queueSort)}><option value="createdAt">Newest</option><option value="status">Status</option><option value="priority">Priority</option></select></label>}<span>{actor.role === 'employee' && hasRequestFilters ? `${filteredRequests.length} of ${requests.length}` : `${requests.length} total`}</span></div>
          {actor.role === 'employee' && <div className="request-filters">
            <label className="search-filter">Search requests<span className="search-input"><Search size={15} /><input type="search" value={requestSearch} onChange={event => setRequestSearch(event.target.value)} placeholder="Title, description, category" /></span></label>
            <label>Status<select value={statusFilter} onChange={event => setStatusFilter(event.target.value as Status | '')}><option value="">All statuses</option>{(['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_ON_REQUESTER', 'RESOLVED', 'CLOSED'] as Status[]).map(status => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}</select></label>
            <label>Department<select value={departmentFilter} onChange={event => setDepartmentFilter(event.target.value)}><option value="">All departments</option><option value="IT">IT</option><option value="HR">HR</option><option value="Finance">Finance</option></select></label>
            <label>Created date<input type="date" value={dateFilter} onChange={event => setDateFilter(event.target.value)} /></label>
            <button className="clear-filters" type="button" onClick={() => { setRequestSearch(''); setStatusFilter(''); setDepartmentFilter(''); setDateFilter(''); }} disabled={!hasRequestFilters}><X size={15} /> Clear</button>
          </div>}
          {requests.length === 0 ? <div className="empty"><Inbox size={28} /><strong>No requests yet</strong><p>Your next request will appear here.</p></div> : filteredRequests.length === 0 ? <div className="empty"><Search size={25} /><strong>No matching requests</strong><p>Try a different search or clear the filters.</p></div> : filteredRequests.map(item => <button className={`request-row ${selected?.id === item.id ? 'selected' : ''}`} key={item.id} onClick={() => setSelected(item)}><span className={`status-dot ${item.status.toLowerCase()}`} /><span className="request-copy"><strong>{item.title}</strong><small>{item.category} · {new Date(item.createdAt).toLocaleDateString()}</small></span><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status.replace('_', ' ')}</span><ChevronRight size={17} /></button>)}
        </div>
        <div className="detail-panel">{selected ? <><div className="detail-header"><div><span className={`status-pill ${selected.status.toLowerCase()}`}>{selected.status.replace('_', ' ')}</span><h3>{selected.title}</h3><p>{selected.description}</p></div></div><div className="meta-grid"><div><small>Department</small><strong>{selected.departmentId}</strong></div><div><small>Priority</small><strong>{selected.priority}</strong></div><div><small>Assigned to</small><strong>{selected.assignedTo ?? 'Awaiting owner'}</strong></div></div>{actor.role === 'admin' && <div className="workflow-controls"><span className="control-label">Reassign</span>{AUTH_MODE === 'mock' ? <><select aria-label="Reassign to staff" value={reassignTarget} onChange={event => setReassignTarget(event.target.value)}><option value="">Choose department staff</option>{assigneeOptions.map(option => <option key={option.id} value={option.id}>{option.id}</option>)}</select><button className="secondary-button" type="button" onClick={reassignRequest} disabled={actionPending || !reassignTarget}>Assign request</button></> : <p className="empty-notes">A trusted staff directory is required to choose a valid assignee.</p>}</div>}{actor.role === 'admin' && <div className="workflow-controls"><span className="control-label">Escalate</span>{AUTH_MODE === 'mock' ? <><select aria-label="Escalate to manager" value={escalateTarget} onChange={event => setEscalateTarget(event.target.value)}><option value="">Choose department manager</option>{managerOptions.map(option => <option key={option.id} value={option.id}>{option.id}</option>)}</select><button className="secondary-button" type="button" onClick={escalateRequest} disabled={actionPending || !escalateTarget}>Escalate to manager</button></> : <p className="empty-notes">A trusted manager directory is required to escalate a request.</p>}</div>}{availableTransitions.length > 0 && <div className="workflow-controls"><span className="control-label">Update status</span><div className="workflow-actions">{availableTransitions.map(status => <button className="secondary-button" type="button" key={status} onClick={() => transitionRequest(status)} disabled={actionPending}>{status === 'ASSIGNED' ? 'Claim request' : status === 'IN_PROGRESS' && selected.status === 'RESOLVED' ? 'Reopen request' : status === 'IN_PROGRESS' ? 'Start work' : status === 'WAITING_ON_REQUESTER' ? 'Ask requester' : status === 'RESOLVED' ? 'Resolve request' : 'Close request'}</button>)}</div></div>}<div className="timeline"><div className="timeline-title">Status history <span>{history.length} events</span></div>{history.length === 0 ? <p className="empty-notes">No status history available.</p> : history.map(entry => <div className="timeline-step done" key={entry.id}><CheckCircle2 size={17} /><span>{entry.toStatus.replace(/_/g, ' ')}<small>{entry.fromStatus ? `${entry.fromStatus.replace(/_/g, ' ')} → ${entry.toStatus.replace(/_/g, ' ')}` : 'Request submitted'} · {entry.changedBy} · {new Date(entry.changedAt).toLocaleString()}</small></span></div>)}</div><section className="comments-panel"><div className="timeline-title">Comments <span>{comments.length} total</span></div>{comments.length === 0 ? <p className="empty-notes">No comments yet.</p> : <div className="comment-list">{comments.map(comment => <article className="comment-item" key={comment.id}><strong>{comment.authorId}</strong><span>{comment.body}</span><small>{new Date(comment.createdAt).toLocaleString()}</small></article>)}</div>}{canComment && <div className="comment-box"><textarea value={commentText} onChange={event => setCommentText(event.target.value)} placeholder="Add a progress update or question..." /><button className="secondary-button" type="button" onClick={addComment} disabled={commenting || !commentText.trim()}>{commenting ? 'Sending...' : 'Send comment'}</button></div>}</section></> : <div className="detail-empty"><Send size={24} /><h3>Select a request</h3><p>Choose an item to inspect its status and history.</p></div>}</div></section><section className="assistant-panel global-assistant"><div className="assistant-heading"><div><span className="section-kicker">Requesty assistant</span><h3>Ask the service hub</h3><p>{selected ? `Selected request: ${selected.title}` : 'Ask about a request or describe what you need help with.'}</p></div><Bot size={20} /></div><textarea value={assistantQuestion} onChange={event => setAssistantQuestion(event.target.value)} placeholder="e.g. What is the status of this request?" /><button className="secondary-button" type="button" onClick={askAssistant} disabled={askingAssistant || !assistantQuestion.trim()}><Bot size={16} /> {askingAssistant ? 'Asking...' : 'Ask assistant'}</button>{assistantReply && <p className="assistant-reply">{assistantReply}</p>}</section>
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