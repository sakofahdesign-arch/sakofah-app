'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { approveOffsite, rejectOffsite } from './actions';

type Employee = { emp_id: string; name: string; role: string; active: boolean };
type Checkin = {
  id: string;
  emp_id: string;
  type: string;
  ts: string;
  lat: number | null;
  lng: number | null;
  photo_url: string | null;
  location_note: string | null;
  status: string;
};
type Pending = Checkin & { employees: { name: string } };

export default function AdminClient({
  adminName, monthStr, employees, checkins, pending,
}: {
  adminName: string;
  monthStr: string;
  employees: Employee[];
  checkins: Checkin[];
  pending: Pending[];
}) {
  const [pendingList, setPendingList] = useState(pending);
  const [isPending, startTransition] = useTransition();

  const stats = useMemo(() => {
    const ins = checkins.filter((c) => c.type === 'in');
    const offsites = checkins.filter((c) => c.type.startsWith('offsite'));
    const lateOrAbsent = employees.length * 22 - ins.length; // rough estimate
    const onTimeRate = ins.length === 0 ? 0 : Math.round((ins.filter((c) => new Date(c.ts).getHours() < 8).length / ins.length) * 100);
    return {
      total: employees.length,
      onTimeRate,
      offsites: offsites.length,
      missing: Math.max(0, lateOrAbsent),
    };
  }, [checkins, employees]);

  const dailyData = useMemo(() => {
    const [y, m] = monthStr.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const arr: { day: number; office: number; offsite: number }[] = [];
    for (let d = 1; d <= daysInMonth; d++) arr.push({ day: d, office: 0, offsite: 0 });
    checkins.forEach((c) => {
      const day = new Date(c.ts).getDate();
      if (c.type === 'in') arr[day - 1].office++;
      if (c.type === 'offsite_in') arr[day - 1].offsite++;
    });
    return arr;
  }, [checkins, monthStr]);

  const maxBar = Math.max(1, ...dailyData.map((d) => d.office + d.offsite));

  function handleApprove(id: string) {
    startTransition(async () => {
      const res = await approveOffsite(id);
      if (!res.error) setPendingList((list) => list.filter((p) => p.id !== id));
    });
  }
  function handleReject(id: string) {
    startTransition(async () => {
      const res = await rejectOffsite(id);
      if (!res.error) setPendingList((list) => list.filter((p) => p.id !== id));
    });
  }

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 22 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 16 }}>
        <div>
          <div className="t-l-3" style={{ fontSize: 12 }}>Sakofah Islamic · Admin · {adminName}</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>รายงานประจำเดือน {monthStr}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Link href="/checkin" style={{ background: '#fff', color: '#0e0e10', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '6px 12px', fontSize: 12, textDecoration: 'none' }}>
            <i className="ti ti-home" style={{ fontSize: 13 }} aria-hidden></i> ไปหน้าเช็คอิน
          </Link>
          <input
            type="month"
            defaultValue={monthStr}
            onChange={(e) => { window.location.href = `/admin?month=${e.target.value}`; }}
            style={{ background: '#fff', borderRadius: 10, padding: '6px 12px', border: '0.5px solid rgba(0,0,0,0.1)', fontSize: 12 }}
          />
        </div>
      </div>

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
        <KpiCard label="พนักงาน" value={stats.total} />
        <KpiCard label="มาตรงเวลา (%)" value={stats.onTimeRate} bg="#d6f26b" />
        <KpiCard label="ลานอกสถานที่" value={stats.offsites} sub="ครั้ง" />
        <KpiCard label="รออนุมัติ" value={pendingList.length} dark />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
        {/* Chart */}
        <div className="card-dark" style={{ borderRadius: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>เช็คอินรายวัน · {stats.total} คน</div>
            <div style={{ display: 'flex', gap: 4 }}>
              <span className="chip-dark" style={{ background: '#d6f26b', color: '#0e0e10' }}>ในออฟฟิศ</span>
              <span className="chip-dark"><span style={{ display: 'inline-block', width: 6, height: 6, background: '#5c5c60', borderRadius: 999, marginRight: 4 }} />นอกสถานที่</span>
            </div>
          </div>
          <svg viewBox="0 0 600 140" style={{ width: '100%', height: 160 }}>
            {dailyData.map((d, i) => {
              const x = 10 + i * (580 / dailyData.length);
              const w = (580 / dailyData.length) - 4;
              const officeH = (d.office / maxBar) * 100;
              const offsiteH = (d.offsite / maxBar) * 100;
              return (
                <g key={i}>
                  <rect x={x} y={130 - officeH} width={w} height={officeH} fill="#d6f26b" rx={2} />
                  <rect x={x} y={130 - officeH - offsiteH} width={w} height={offsiteH} fill="#5c5c60" rx={2} />
                </g>
              );
            })}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8e8e92', marginTop: 4 }}>
            <span>1</span><span>10</span><span>20</span><span>{dailyData.length}</span>
          </div>
        </div>

        {/* Pending */}
        <div style={{ background: '#f4f2ec', borderRadius: 18, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>รออนุมัติ Off-site</div>
            <span style={{ fontSize: 11, color: '#5c5c60' }}>{pendingList.length} รายการ</span>
          </div>
          {pendingList.length === 0 ? (
            <div style={{ color: '#5c5c60', fontSize: 12, padding: 20, textAlign: 'center' }}>
              ไม่มีคำขอรอ ✓
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
              {pendingList.map((p) => (
                <div key={p.id} style={{ background: '#fff', borderRadius: 12, padding: 10, border: '0.5px solid rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                    {p.photo_url ? (
                      <img src={p.photo_url} style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 44, height: 44, borderRadius: 10, background: '#0e0e10', color: '#d6f26b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>
                        {p.employees.name.slice(0, 2)}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{p.employees.name}</div>
                      <div style={{ fontSize: 10, color: '#5c5c60', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.location_note} · {new Date(p.ts).toLocaleDateString('th-TH')}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    <button onClick={() => handleApprove(p.id)} disabled={isPending} style={{ background: '#d6f26b', color: '#0e0e10', border: 'none', borderRadius: 8, padding: '6px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      อนุมัติ
                    </button>
                    <button onClick={() => handleReject(p.id)} disabled={isPending} style={{ background: '#fff', color: '#a32d2d', border: '0.5px solid rgba(163,45,45,0.3)', borderRadius: 8, padding: '6px', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>
                      ปฏิเสธ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Employee summary */}
      <div className="card-light" style={{ borderRadius: 18, marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>สรุปพนักงาน {employees.length} คน</div>
          <span style={{ fontSize: 11, color: '#5c5c60' }}>เพิ่ม/แก้ไขใน Supabase Studio → Table Editor</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {employees.map((e) => {
            const empCheckins = checkins.filter((c) => c.emp_id === e.emp_id && c.type === 'in').length;
            return (
              <div key={e.emp_id} style={{ background: '#f4f2ec', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: e.role === 'admin' ? '#0e0e10' : '#d6f26b', color: e.role === 'admin' ? '#d6f26b' : '#0e0e10', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>
                  {e.name.slice(0, 2)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                  <div style={{ fontSize: 10, color: '#5c5c60' }}>{e.emp_id} · {empCheckins} วัน</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function KpiCard({ label, value, sub, bg = '#f4f2ec', dark = false }: { label: string; value: number | string; sub?: string; bg?: string; dark?: boolean }) {
  return (
    <div style={{ background: dark ? '#0e0e10' : bg, color: dark ? '#fff' : '#0e0e10', borderRadius: 14, padding: 12 }}>
      <div style={{ fontSize: 11, color: dark ? '#c9c9cc' : '#5c5c60' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color: dark ? '#d6f26b' : 'inherit' }}>
        {value}{sub && <span style={{ fontSize: 11, fontWeight: 400, color: dark ? '#c9c9cc' : '#5c5c60' }}> {sub}</span>}
      </div>
    </div>
  );
}
