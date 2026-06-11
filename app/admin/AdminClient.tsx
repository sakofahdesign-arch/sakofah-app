'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
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
type Settings = {
  office_lat: number; office_lng: number; radius_m: number;
  allowed_ssid: string; work_start: string; work_end: string;
  late_tolerance_min?: number; work_days?: string;
} | null;

const C = {
  purple: '#a89bf0',
  purpleDeep: '#7c5cff',
  peach: '#fcdfb1',
  peachDeep: '#f5a85c',
  lime: '#d6f26b',
  limeSoft: '#e8f5a8',
  dark: '#0e0e10',
  red: '#fcc6c6',
  redDeep: '#e24b4a',
  mint: '#c5f1de',
};

export default function AdminClient({
  adminName, monthStr, employees, checkins, pending, settings,
}: {
  adminName: string;
  monthStr: string;
  employees: Employee[];
  checkins: Checkin[];
  pending: Pending[];
  settings: Settings;
}) {
  const [pendingList, setPendingList] = useState(pending);
  const [isPending, startTransition] = useTransition();

  const workStartHr = parseInt(settings?.work_start?.slice(0, 2) ?? '8', 10);
  const workStartMin = parseInt(settings?.work_start?.slice(3, 5) ?? '20', 10);
  const tolerance = settings?.late_tolerance_min ?? 5;
  const cutoffMin = workStartHr * 60 + workStartMin + tolerance;

  const stats = useMemo(() => {
    const ins = checkins.filter((c) => c.type === 'in');
    const offsites = checkins.filter((c) => c.type.startsWith('offsite'));
    let lateCount = 0;
    ins.forEach((c) => {
      const d = new Date(c.ts);
      const mins = d.getHours() * 60 + d.getMinutes();
      if (mins > cutoffMin) lateCount++;
    });
    const onTime = ins.length - lateCount;
    const onTimeRate = ins.length === 0 ? 0 : Math.round((onTime / ins.length) * 100);
    const lateRate = ins.length === 0 ? 0 : Math.round((lateCount / ins.length) * 100);
    return {
      total: employees.length,
      checkinDays: ins.length,
      onTimeRate,
      lateRate,
      lateCount,
      offsites: offsites.length,
    };
  }, [checkins, employees, cutoffMin]);

  const dailyData = useMemo(() => {
    const [y, m] = monthStr.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const arr: { day: number; office: number; offsite: number; late: number }[] = [];
    for (let d = 1; d <= daysInMonth; d++) arr.push({ day: d, office: 0, offsite: 0, late: 0 });
    checkins.forEach((c) => {
      const dd = new Date(c.ts);
      const day = dd.getDate();
      if (c.type === 'in') {
        arr[day - 1].office++;
        const mins = dd.getHours() * 60 + dd.getMinutes();
        if (mins > cutoffMin) arr[day - 1].late++;
      }
      if (c.type === 'offsite_in') arr[day - 1].offsite++;
    });
    return arr;
  }, [checkins, monthStr, cutoffMin]);

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

  function exportExcel() {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary
    const summary: (string | number)[][] = [
      ['รายงานประจำเดือน', monthStr],
      ['ออกโดย', adminName],
      ['สร้างเมื่อ', new Date().toLocaleString('th-TH')],
      [],
      ['สรุปภาพรวม', ''],
      ['พนักงานทั้งหมด', stats.total],
      ['จำนวนวันที่มีคนเช็คอิน', stats.checkinDays],
      ['มาตรงเวลา (%)', stats.onTimeRate],
      ['มาสาย (%)', stats.lateRate],
      ['จำนวนคนมาสาย', stats.lateCount],
      ['ลานอกสถานที่ (ครั้ง)', stats.offsites],
      ['คำขออนุมัติคงค้าง', pendingList.length],
      [],
      ['เวลาทำการ', `${settings?.work_start} - ${settings?.work_end}`],
      ['Tolerance สาย (นาที)', tolerance],
      ['วันทำการ', settings?.work_days === 'MTWTF' ? 'จันทร์-ศุกร์' : 'ทุกวัน'],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summary);
    ws1['!cols'] = [{ wch: 28 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'สรุปภาพรวม');

    // Sheet 2: Daily
    const dailyRows: (string | number)[][] = [
      ['วันที่', 'เช็คอินในออฟฟิศ', 'มาสาย', 'นอกสถานที่', 'รวม'],
      ...dailyData.map((d) => [d.day, d.office, d.late, d.offsite, d.office + d.offsite]),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(dailyRows);
    ws2['!cols'] = [{ wch: 8 }, { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'รายวัน');

    // Sheet 3: Per-employee summary
    const empRows: (string | number)[][] = [
      ['รหัสพนักงาน', 'ชื่อ', 'ตำแหน่ง', 'วันเช็คอิน', 'สาย (ครั้ง)', 'นอกสถานที่', 'ตรงเวลา (%)'],
    ];
    employees.forEach((e) => {
      const empIns = checkins.filter((c) => c.emp_id === e.emp_id && c.type === 'in');
      const empLate = empIns.filter((c) => {
        const d = new Date(c.ts);
        return d.getHours() * 60 + d.getMinutes() > cutoffMin;
      }).length;
      const empOffsite = checkins.filter((c) => c.emp_id === e.emp_id && c.type.startsWith('offsite')).length;
      const onTimeP = empIns.length === 0 ? 0 : Math.round(((empIns.length - empLate) / empIns.length) * 100);
      empRows.push([e.emp_id, e.name, e.role, empIns.length, empLate, empOffsite, onTimeP]);
    });
    const ws3 = XLSX.utils.aoa_to_sheet(empRows);
    ws3['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'รายพนักงาน');

    // Sheet 4: Raw log
    const logRows = [
      ['วันที่-เวลา', 'รหัสพนักงาน', 'ประเภท', 'พิกัด', 'สถานที่', 'สถานะ'],
      ...checkins
        .sort((a, b) => a.ts.localeCompare(b.ts))
        .map((c) => [
          new Date(c.ts).toLocaleString('th-TH'),
          c.emp_id,
          c.type,
          c.lat && c.lng ? `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}` : '',
          c.location_note ?? '',
          c.status,
        ]),
    ];
    const ws4 = XLSX.utils.aoa_to_sheet(logRows);
    ws4['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 26 }, { wch: 30 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'ประวัติทั้งหมด');

    XLSX.writeFile(wb, `รายงาน_${monthStr}_${Date.now()}.xlsx`);
  }

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 22 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="t-l-3" style={{ fontSize: 12 }}>Sakofah Islamic · Admin · {adminName}</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>รายงานประจำเดือน {monthStr}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Link href="/checkin" style={{ background: '#fff', color: '#0e0e10', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '6px 12px', fontSize: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <i className="ti ti-home" style={{ fontSize: 13 }} aria-hidden></i>ไปหน้าเช็คอิน
          </Link>
          <input type="month" defaultValue={monthStr}
            onChange={(e) => { window.location.href = `/admin?month=${e.target.value}`; }}
            style={{ background: '#fff', borderRadius: 10, padding: '6px 12px', border: '0.5px solid rgba(0,0,0,0.1)', fontSize: 12 }} />
          <button onClick={exportExcel} style={{ background: C.dark, color: C.lime, border: 'none', borderRadius: 10, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-file-spreadsheet" style={{ fontSize: 14 }} aria-hidden></i>Export Excel
          </button>
        </div>
      </div>

      {/* KPI grid 5 ช่อง */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
        <KpiCard label="พนักงาน" value={stats.total} bg={C.purple} textCol="#26215c" />
        <KpiCard label="มาตรงเวลา" value={`${stats.onTimeRate}%`} bg={C.lime} textCol={C.dark} />
        <KpiCard label="มาสาย" value={`${stats.lateRate}%`} sub={`${stats.lateCount} ครั้ง`} bg={C.peach} textCol="#5c4520" />
        <KpiCard label="นอกสถานที่" value={stats.offsites} sub="ครั้ง" bg={C.mint} textCol="#04342c" />
        <KpiCard label="รออนุมัติ" value={pendingList.length} bg={C.dark} textCol={C.lime} dark />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 14 }}>
        {/* Chart card — dark */}
        <div style={{ background: C.dark, color: '#fff', borderRadius: 18, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>เช็คอินรายวัน · {stats.total} คน</div>
            <div style={{ display: 'flex', gap: 4 }}>
              <Chip color={C.lime} dark label="ในออฟฟิศ" />
              <Chip color={C.peachDeep} label="มาสาย" />
              <Chip color="#7c5cff" label="นอกสถานที่" />
            </div>
          </div>
          <div style={{ fontSize: 30, fontWeight: 600 }}>{stats.checkinDays}<span style={{ fontSize: 13, color: '#8e8e92', fontWeight: 400 }}> วันเช็คอิน</span></div>
          <svg viewBox="0 0 600 140" style={{ width: '100%', height: 160 }}>
            {dailyData.map((d, i) => {
              const x = 10 + i * (580 / dailyData.length);
              const w = (580 / dailyData.length) - 4;
              const onTimeH = ((d.office - d.late) / maxBar) * 100;
              const lateH = (d.late / maxBar) * 100;
              const offH = (d.offsite / maxBar) * 100;
              let y = 130;
              return (
                <g key={i}>
                  <rect x={x} y={y - onTimeH} width={w} height={onTimeH} fill={C.lime} rx={2} />
                  <rect x={x} y={y - onTimeH - lateH} width={w} height={lateH} fill={C.peachDeep} rx={2} />
                  <rect x={x} y={y - onTimeH - lateH - offH} width={w} height={offH} fill="#7c5cff" rx={2} />
                </g>
              );
            })}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8e8e92', marginTop: 4 }}>
            <span>1</span><span>10</span><span>20</span><span>{dailyData.length}</span>
          </div>
        </div>

        {/* Pending offsite — peach card */}
        <div style={{ background: C.peach, borderRadius: 18, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#412402' }}>รออนุมัติ Off-site</div>
            <span style={{ fontSize: 11, color: '#854f0b' }}>{pendingList.length} รายการ</span>
          </div>
          {pendingList.length === 0 ? (
            <div style={{ color: '#854f0b', fontSize: 12, padding: 20, textAlign: 'center' }}>ไม่มีคำขอรอ ✓</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
              {pendingList.map((p) => {
                const isOut = p.type === 'offsite_out';
                return (
                  <div key={p.id} style={{ background: '#fff', borderRadius: 12, padding: 10 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                      {p.photo_url ? (
                        <img src={p.photo_url} style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: 48, height: 48, borderRadius: 10, background: C.dark, color: C.lime, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>
                          {p.employees.name.slice(0, 2)}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                          {p.employees.name}
                          <span style={{ background: isOut ? '#ff7a3d' : '#7c5cff', color: '#fff', padding: '1px 6px', borderRadius: 999, fontSize: 9, fontWeight: 600 }}>
                            {isOut ? 'OUT' : 'IN'}
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: '#5c5c60', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.location_note} · {new Date(p.ts).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                      <button onClick={() => handleApprove(p.id)} disabled={isPending} style={{ background: C.lime, color: C.dark, border: 'none', borderRadius: 8, padding: '6px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>อนุมัติ</button>
                      <button onClick={() => handleReject(p.id)} disabled={isPending} style={{ background: '#fff', color: '#a32d2d', border: '0.5px solid rgba(163,45,45,0.3)', borderRadius: 8, padding: '6px', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>ปฏิเสธ</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Employee summary — purple card */}
      <div style={{ background: C.purple, borderRadius: 18, padding: 16, marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#26215c' }}>สรุปพนักงาน {employees.length} คน</div>
          <span style={{ fontSize: 11, color: '#3c3489' }}>เพิ่ม/แก้ไขใน Supabase Studio → Table Editor</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          {employees.map((e) => {
            const empIns = checkins.filter((c) => c.emp_id === e.emp_id && c.type === 'in');
            const empLate = empIns.filter((c) => {
              const d = new Date(c.ts);
              return d.getHours() * 60 + d.getMinutes() > cutoffMin;
            }).length;
            return (
              <div key={e.emp_id} style={{ background: '#fff', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: e.role === 'admin' ? C.dark : C.lime, color: e.role === 'admin' ? C.lime : C.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>
                  {e.name.slice(0, 2)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                  <div style={{ fontSize: 10, color: '#5c5c60' }}>
                    {e.emp_id} · {empIns.length} วัน
                    {empLate > 0 && <span style={{ color: '#ba7517' }}> · สาย {empLate}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function KpiCard({ label, value, sub, bg, textCol, dark = false }: { label: string; value: number | string; sub?: string; bg: string; textCol: string; dark?: boolean }) {
  return (
    <div style={{ background: bg, color: textCol, borderRadius: 14, padding: 12 }}>
      <div style={{ fontSize: 11, opacity: dark ? 1 : 0.7, color: dark ? '#c9c9cc' : 'inherit' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>
        {value}{sub && <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.7 }}> {sub}</span>}
      </div>
    </div>
  );
}

function Chip({ color, label, dark }: { color: string; label: string; dark?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: dark ? color : 'transparent', color: dark ? C.dark : '#fff', border: dark ? 'none' : '0.5px solid #2a2a2d', borderRadius: 999, padding: '3px 8px', fontSize: 10, fontWeight: 500 }}>
      <span style={{ display: 'inline-block', width: 6, height: 6, background: color, borderRadius: 999 }} />{label}
    </span>
  );
}
