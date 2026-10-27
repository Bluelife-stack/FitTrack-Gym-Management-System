import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Id = number | string;
type Tab = 'Dashboard' | 'Members' | 'Plans' | 'Memberships' | 'Attendance' | 'Payments';
type Member = {
  id: Id;
  full_name: string;
  phone: string;
  email: string | null;
  status: 'active' | 'inactive';
  current_plan: string;
};
type Plan = { id: Id; name: string; price: string; duration_days: number; description: string | null };
type Membership = {
  id: Id;
  member_id: Id;
  plan_id: Id;
  full_name: string;
  plan_name: string;
  start_date: string;
  end_date: string;
};
type AttendanceRecord = { id: Id; full_name: string; check_in_date: string; check_in_at: string };
type Payment = {
  id: Id;
  full_name: string;
  plan_name: string;
  amount: string;
  payment_date: string;
  method: string;
};
type DashboardData = {
  members: string;
  active_members: string;
  today_checkins: string;
  revenue: string;
  expiring: string;
  expired: string;
};
type Notice = { tone: 'success' | 'error'; text: string };
type Option = [string, string];

const tabs: Tab[] = ['Dashboard', 'Members', 'Plans', 'Memberships', 'Attendance', 'Payments'];

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateLabel(value: string) {
  return value.slice(0, 10);
}

function dateAfter(start: string, days: number) {
  const date = new Date(`${start}T00:00:00`);
  date.setDate(date.getDate() + days - 1);
  return localDate(date);
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api/${path}`, { ...options, headers });
  if (response.status === 204) return null as T;

  const contentType = response.headers.get('content-type') ?? '';
  const payload: unknown = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload &&
      typeof payload.error === 'string'
      ? payload.error
      : 'Request failed. Please try again.';
    throw new Error(message);
  }
  return payload as T;
}

function App() {
  const [tab, setTab] = useState<Tab>('Dashboard');
  const [members, setMembers] = useState<Member[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [dashboardData, memberData, planData, membershipData, attendanceData, paymentData] =
        await Promise.all([
          api<DashboardData>('dashboard'),
          api<Member[]>('members'),
          api<Plan[]>('plans'),
          api<Membership[]>('memberships'),
          api<AttendanceRecord[]>('attendance'),
          api<Payment[]>('payments')
        ]);
      setDashboard(dashboardData);
      setMembers(memberData);
      setPlans(planData);
      setMemberships(membershipData);
      setAttendance(attendanceData);
      setPayments(paymentData);
      return null;
    } catch (error) {
      return errorText(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load().then((error) => {
      if (error) setNotice({ tone: 'error', text: error });
    });
  }, []);

  const submit = async (
    path: string,
    data: unknown,
    method = 'POST',
    successText = 'Saved successfully.'
  ) => {
    setBusy(true);
    try {
      await api(path, { method, body: JSON.stringify(data) });
      const refreshError = await load();
      setNotice({
        tone: refreshError ? 'error' : 'success',
        text: refreshError ? `Saved successfully, but the latest data could not be loaded: ${refreshError}` : successText
      });
      return true;
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    const error = await load();
    setNotice(error ? { tone: 'error', text: error } : { tone: 'success', text: 'Data refreshed.' });
  };

  const remove = async (id: Id) => {
    if (!window.confirm('Delete this member? This is blocked if the member has attendance, memberships, or payments.')) return;
    setBusy(true);
    try {
      await api(`members/${id}`, { method: 'DELETE' });
      const refreshError = await load();
      setNotice({
        tone: refreshError ? 'error' : 'success',
        text: refreshError ? `Member deleted, but the latest data could not be loaded: ${refreshError}` : 'Member deleted.'
      });
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const content: Record<Tab, ReactNode> = {
    Dashboard: <Dashboard dashboard={dashboard} memberships={memberships} />,
    Members: <Members members={members} submit={submit} remove={remove} busy={busy} />,
    Plans: <Plans plans={plans} submit={submit} busy={busy} />,
    Memberships: <Memberships members={members} plans={plans} memberships={memberships} submit={submit} busy={busy} />,
    Attendance: <Attendance members={members} rows={attendance} submit={submit} busy={busy} />,
    Payments: <Payments members={members} memberships={memberships} rows={payments} submit={submit} busy={busy} />
  };

  return (
    <main>
      <aside>
        <div className="brand">FIT<span>TRACK</span><small>GYM MANAGEMENT</small></div>
        <nav aria-label="Main navigation">
          {tabs.map((item) => (
            <button
              aria-current={tab === item ? 'page' : undefined}
              className={tab === item ? 'nav active' : 'nav'}
              key={item}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="side-note">PostgreSQL-backed<br />DBMS project</div>
      </aside>
      <section className="page">
        <header>
          <div><p className="eyebrow">FITTRACK ADMIN</p><h1>{tab}</h1></div>
          <button className="refresh" disabled={loading} onClick={() => void refresh()}>
            {loading ? 'Refreshing…' : '↻ Refresh data'}
          </button>
        </header>
        {notice && (
          <div className={`toast ${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
            <span>{notice.text}</span>
            <button aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button>
          </div>
        )}
        {content[tab]}
      </section>
    </main>
  );
}

function Dashboard({ dashboard, memberships }: { dashboard: DashboardData | null; memberships: Membership[] }) {
  const cards: [string, string | undefined][] = [
    ['Registered members', dashboard?.members],
    ['Active members', dashboard?.active_members],
    ["Today's check-ins", dashboard?.today_checkins],
    ['Recorded payments', dashboard ? `₹${Number(dashboard.revenue).toLocaleString('en-IN')}` : undefined],
    ['Expiring in 7 days', dashboard?.expiring],
    ['Expired memberships', dashboard?.expired]
  ];
  return (
    <>
      <div className="cards">
        {cards.map(([label, value]) => (
          <article className="card" key={label}><p>{label}</p><strong>{value ?? '—'}</strong></article>
        ))}
      </div>
      <section className="panel">
        <h2>Membership history</h2>
        <Table cols={['Member', 'Plan', 'Start', 'End']} rows={memberships.slice(0, 8).map((item) => [
          item.full_name, item.plan_name, dateLabel(item.start_date), dateLabel(item.end_date)
        ])} />
      </section>
    </>
  );
}

function Members({
  members, submit, remove, busy
}: {
  members: Member[];
  submit: Submit;
  remove: (id: Id) => Promise<void>;
  busy: boolean;
}) {
  const blank = (): { full_name: string; phone: string; email: string; status: Member['status'] } =>
    ({ full_name: '', phone: '', email: '', status: 'active' });
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<Id | null>(null);
  const save = async () => {
    const saved = await submit(`members${editing === null ? '' : `/${editing}`}`, form, editing === null ? 'POST' : 'PUT');
    if (saved) {
      setForm(blank());
      setEditing(null);
    }
  };
  return (
    <>
      <Form title={editing === null ? 'Add member' : 'Edit member'} onSubmit={save} busy={busy}>
        <Input label="Full name" value={form.full_name} onChange={(full_name) => setForm({ ...form, full_name })} />
        <Input label="Phone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
        <Input label="Email (optional)" type="email" required={false} value={form.email} onChange={(email) => setForm({ ...form, email })} />
        <Select label="Status" value={form.status} options={['active', 'inactive'].map((value) => [value, value])} onChange={(status) => setForm({ ...form, status: status as Member['status'] })} />
      </Form>
      {editing !== null && (
        <button className="cancel" onClick={() => { setEditing(null); setForm(blank()); }}>Cancel editing</button>
      )}
      <section className="panel">
        <h2>All members</h2>
        <Table cols={['Name', 'Phone', 'Email', 'Status', 'Current plan', '']} rows={members.map((member) => [
          member.full_name,
          member.phone,
          member.email || '—',
          <Badge text={member.status} />,
          member.current_plan,
          <span className="actions">
            <button className="edit" disabled={busy} onClick={() => {
              setEditing(member.id);
              setForm({
                full_name: member.full_name,
                phone: member.phone,
                email: member.email || '',
                status: member.status
              });
            }}>Edit</button>
            <button className="danger" disabled={busy} onClick={() => void remove(member.id)}>Delete</button>
          </span>
        ])} />
      </section>
    </>
  );
}

function Plans({ plans, submit, busy }: { plans: Plan[]; submit: Submit; busy: boolean }) {
  const blank = () => ({ name: '', price: '', duration_days: '30', description: '' });
  const [form, setForm] = useState(blank);
  const save = async () => {
    if (await submit('plans', form)) setForm(blank());
  };
  return (
    <>
      <Form title="Create membership plan" onSubmit={save} busy={busy}>
        <Input label="Plan name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <Input label="Price (₹)" type="number" min="0.01" step="0.01" value={form.price} onChange={(price) => setForm({ ...form, price })} />
        <Input label="Duration (days)" type="number" min="1" max="3650" value={form.duration_days} onChange={(duration_days) => setForm({ ...form, duration_days })} />
        <Input label="Description" required={false} value={form.description} onChange={(description) => setForm({ ...form, description })} />
      </Form>
      <section className="panel">
        <h2>Available plans</h2>
        <Table cols={['Plan', 'Price', 'Duration', 'Description']} rows={plans.map((plan) => [
          plan.name, `₹${Number(plan.price).toLocaleString('en-IN')}`, `${plan.duration_days} days`, plan.description || '—'
        ])} />
      </section>
    </>
  );
}

function Memberships({
  members, plans, memberships, submit, busy
}: {
  members: Member[];
  plans: Plan[];
  memberships: Membership[];
  submit: Submit;
  busy: boolean;
}) {
  const [form, setForm] = useState(() => ({ member_id: '', plan_id: '', start_date: localDate(), end_date: localDate() }));
  const save = async () => {
    if (await submit('memberships', form)) {
      setForm({ member_id: '', plan_id: '', start_date: localDate(), end_date: localDate() });
    }
  };
  const changePlan = (planId: string) => {
    const plan = plans.find((item) => String(item.id) === planId);
    setForm({
      ...form,
      plan_id: planId,
      end_date: plan ? dateAfter(form.start_date, plan.duration_days) : form.start_date
    });
  };
  return (
    <>
      <Form title="Assign a membership" onSubmit={save} busy={busy}>
        <Select label="Member" value={form.member_id} options={members.map((member) => [String(member.id), member.full_name])} onChange={(member_id) => setForm({ ...form, member_id })} />
        <Select label="Plan" value={form.plan_id} options={plans.map((plan) => [String(plan.id), `${plan.name} — ₹${Number(plan.price).toLocaleString('en-IN')}`])} onChange={changePlan} />
        <Input label="Start date" type="date" value={form.start_date} onChange={(start_date) => {
          const plan = plans.find((item) => String(item.id) === form.plan_id);
          setForm({ ...form, start_date, end_date: plan ? dateAfter(start_date, plan.duration_days) : start_date });
        }} />
        <Input label="End date" type="date" value={form.end_date} onChange={(end_date) => setForm({ ...form, end_date })} />
      </Form>
      <section className="panel">
        <h2>Membership records</h2>
        <Table cols={['Member', 'Plan', 'Start', 'End']} rows={memberships.map((item) => [
          item.full_name, item.plan_name, dateLabel(item.start_date), dateLabel(item.end_date)
        ])} />
      </section>
    </>
  );
}

function Attendance({
  members, rows, submit, busy
}: {
  members: Member[];
  rows: AttendanceRecord[];
  submit: Submit;
  busy: boolean;
}) {
  const blank = () => ({ member_id: '', check_in_date: localDate() });
  const [form, setForm] = useState(blank);
  const save = async () => {
    if (await submit('attendance', form)) setForm(blank());
  };
  return (
    <>
      <Form title="Member check-in" onSubmit={save} busy={busy}>
        <Select label="Member" value={form.member_id} options={members.map((member) => [String(member.id), member.full_name])} onChange={(member_id) => setForm({ ...form, member_id })} />
        <Input label="Check-in date" type="date" value={form.check_in_date} onChange={(check_in_date) => setForm({ ...form, check_in_date })} />
      </Form>
      <section className="panel">
        <h2>Attendance history</h2>
        <Table cols={['Member', 'Date', 'Time']} rows={rows.map((item) => [
          item.full_name,
          dateLabel(item.check_in_date),
          new Date(item.check_in_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        ])} />
      </section>
    </>
  );
}

function Payments({
  members, memberships, rows, submit, busy
}: {
  members: Member[];
  memberships: Membership[];
  rows: Payment[];
  submit: Submit;
  busy: boolean;
}) {
  const blank = () => ({ member_id: '', membership_id: '', amount: '', payment_date: localDate(), method: 'cash' });
  const [form, setForm] = useState(blank);
  const available = useMemo(
    () => memberships.filter((item) => !form.member_id || String(item.member_id) === form.member_id),
    [memberships, form.member_id]
  );
  const save = async () => {
    if (await submit('payments', form)) setForm(blank());
  };
  return (
    <>
      <Form title="Record payment" onSubmit={save} busy={busy}>
        <Select label="Member" value={form.member_id} options={members.map((member) => [String(member.id), member.full_name])} onChange={(member_id) => setForm({ ...form, member_id, membership_id: '' })} />
        <Select label="Membership" value={form.membership_id} options={available.map((item) => [
          String(item.id), `${item.plan_name} (${dateLabel(item.start_date)})`
        ])} onChange={(membership_id) => setForm({ ...form, membership_id })} />
        <Input label="Amount (₹)" type="number" min="0.01" step="0.01" value={form.amount} onChange={(amount) => setForm({ ...form, amount })} />
        <Input label="Payment date" type="date" value={form.payment_date} onChange={(payment_date) => setForm({ ...form, payment_date })} />
        <Select label="Method" value={form.method} options={['cash', 'upi', 'card', 'bank'].map((method) => [method, method.toUpperCase()])} onChange={(method) => setForm({ ...form, method })} />
      </Form>
      <section className="panel">
        <h2>Payment history</h2>
        <Table cols={['Member', 'Plan', 'Amount', 'Date', 'Method']} rows={rows.map((item) => [
          item.full_name,
          item.plan_name,
          `₹${Number(item.amount).toLocaleString('en-IN')}`,
          dateLabel(item.payment_date),
          item.method.toUpperCase()
        ])} />
      </section>
    </>
  );
}

type Submit = (path: string, data: unknown, method?: string, successText?: string) => Promise<boolean>;
type InputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  min?: string;
  max?: string;
  step?: string;
};

function Form({
  title, onSubmit, children, busy
}: {
  title: string;
  onSubmit: () => void | Promise<void>;
  children: ReactNode;
  busy: boolean;
}) {
  return (
    <form className="panel form" onSubmit={(event) => { event.preventDefault(); void onSubmit(); }}>
      <h2>{title}</h2>
      <div className="fields">{children}</div>
      <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save record'}</button>
    </form>
  );
}

function Input({ label, onChange, required = true, ...props }: InputProps) {
  return (
    <label>
      {label}
      <input {...props} required={required} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Select({
  label, value, options, onChange
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <select required value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select {label.toLowerCase()}</option>
        {options.map(([optionValue, text]) => <option value={optionValue} key={optionValue}>{text}</option>)}
      </select>
    </label>
  );
}

function Badge({ text }: { text: string }) {
  return <span className={`badge ${text}`}>{text}</span>;
}

function Table({ cols, rows }: { cols: string[]; rows: ReactNode[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{cols.map((column, index) => <th key={`${column}-${index}`}>{column}</th>)}</tr></thead>
        <tbody>
          {rows.length
            ? rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)
            : <tr><td colSpan={cols.length} className="empty">No records yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
