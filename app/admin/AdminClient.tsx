'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { approveDeviceRequest, rejectDeviceRequest } from './actions';

type Employee = { emp_id: string; name: string; role: string; active: boolean; branch: string | null; device_id: string | null };
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
  employees: { name: string; branch: string | null };
};
type DeviceRequest = {
  id: string;
  emp_id: string;
  old_device: string | null;
  new_device: string;
  reason: string | null;
  status: string;
  created_at: string;
  employees: { name: string; branch: string | null };
};
type Settings = {
  office_lat: number; office_lng: number; radius_m: number;
  allowed_ssid: string; work_start: string; work_end: string;
  late_tolerance_min?: number; work_days?: string;
} | null;

const C = {
  dark: '#0e0e10',
  lime: '#d6f26b',
  purple: '#a89bf0',
  peach: '#fcdfb1',
  peachDeep: '#f5a85c',
  redSoft: '#ff9d9d',
  redDeep: '#e24b4a',
  mintDeep: '#5dcaa5',
  mint: '#c5f1de',
};

type View = 'daily' | 'weekly' | 'monthly';
type TypeFilter = 'all' | 'in' | 'out' | 'offsite';

export default function AdminClient({
  adminName, monthStr, employees, checkins, settings, deviceRequests,
}: {
  adminName: string;
  monthStr: string;
  employees: Employee[];
  checkins: Checkin[];
  settings: Settings;
  deviceRequests: DeviceRequest[];
}) {
  const [view, setView] = useState<View>('daily');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [search, setSearch] = useState('');
  const [devReqs, setDevReqs] = useState(deviceRequests);
  const [isPending, startTransition] = useTransition();

  function handleApproveDevice(id: string) {
    startTransition(async () => {
      const res = await approveDeviceRequest(id);
      if (!res.error) setDevReqs((list) => list.filter((r) => r.id !== id));
    });
  }
  function handleRejectDevice(id: string) {
    startTransition(async () => {
      const res = await rejectDeviceRequest(id);
      if (!res.error) setDevReqs((list) => list.filter((r) => r.id !== id));
    });
  }

  const workStartHr = parseInt(settings?.work_start?.slice(0, 2) ?? '8', 10);
  const workStartMin = parseInt(settings?.work_start?.slice(3, 5) ?? '20', 10);
  const workEndHr = parseInt(settings?.work_end?.slice(0, 2) ?? '16', 10);
  const workEndMin = parseInt(settings?.work_end?.slice(3, 5) ?? '30', 10);
  const tolerance = settings?.late_tolerance_min ?? 5;
  const cutoffMin = workStartHr * 60 + workStartMin + tolerance;
  const workStartTotalMin = workStartHr * 60 + workStartMin;
  const workEndTotalMin = workEndHr * 60 + workEndMin;

  const branches = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => e.branch && set.add(e.branch));
    return Array.from(set);
  }, [employees]);

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
    return { total: employees.length, checkinDays: ins.length, onTimeRate, lateRate, lateCount, offsites: offsites.length };
  }, [checkins, employees, cutoffMin]);

  // Daily/weekly/monthly aggregation
  const chartData = useMemo(() => {
    const [y, m] = monthStr.split('-').map(Number);
    if (view === 'monthly') {
      const ins = checkins.filter((c) => c.type === 'in').length;
      const outs = checkins.filter((c) => c.type === 'out').length;
      const offs = checkins.filter((c) => c.type.startsWith('offsite')).length;
      return [{ label: `${y}-${String(m).padStart(2, '0')}`, ins, outs, offs }];
    }
    if (view === 'weekly') {
      const weeks = [1, 8, 15, 22, 29];
      return weeks.map((startDay, i) => {
        const endDay = weeks[i + 1] ? weeks[i + 1] - 1 : 31;
        const ins = checkins.filter((c) => { const d = new Date(c.ts).getDate(); return c.type === 'in' && d >= startDay && d <= endDay; }).length;
        const outs = checkins.filter((c) => { const d = new Date(c.ts).getDate(); return c.type === 'out' && d >= startDay && d <= endDay; }).length;
        const offs = checkins.filter((c) => { const d = new Date(c.ts).getDate(); return c.type.startsWith('offsite') && d >= startDay && d <= endDay; }).length;
        return { label: `สัปดาห์ ${i + 1}`, ins, outs, offs };
      });
    }
    // daily
    const daysInMonth = new Date(y, m, 0).getDate();
    const arr: { label: string; ins: number; outs: number; offs: number }[] = [];
    for (let d = 1; d <= daysInMonth; d++) arr.push({ label: String(d), ins: 0, outs: 0, offs: 0 });
    checkins.forEach((c) => {
      const day = new Date(c.ts).getDate();
      if (c.type === 'in') arr[day - 1].ins++;
      if (c.type === 'out') arr[day - 1].outs++;
      if (c.type.startsWith('offsite')) arr[day - 1].offs++;
    });
    return arr;
  }, [checkins, monthStr, view]);

  const maxBar = Math.max(1, ...chartData.map((d) => d.ins + d.outs + d.offs));

  // Filtered history rows
  const historyRows = useMemo(() => {
    return checkins
      .filter((c) => {
        if (typeFilter === 'in' && c.type !== 'in' && c.type !== 'offsite_in') return false;
        if (typeFilter === 'out' && c.type !== 'out' && c.type !== 'offsite_out') return false;
        if (typeFilter === 'offsite' && !c.type.startsWith('offsite')) return false;
        if (branchFilter !== 'all' && c.employees.branch !== branchFilter) return false;
        if (dateFrom && c.ts < `${dateFrom}T00:00:00`) return false;
        if (dateTo && c.ts > `${dateTo}T23:59:59`) return false;
        if (search) {
          const q = search.toLowerCase();
          if (!c.employees.name.toLowerCase().includes(q) && !c.emp_id.toLowerCase().includes(q)) return false;
        }
        return true;
      });
  }, [checkins, typeFilter, branchFilter, dateFrom, dateTo, search]);

  function exportExcel() {
    const wb = XLSX.utils.book_new();

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
      ['ลงเวลานอกสถานที่ (ครั้ง)', stats.offsites],
      [],
      ['เวลาทำการ', `${settings?.work_start} - ${settings?.work_end}`],
      ['Tolerance สาย (นาที)', tolerance],
      ['วันทำการ', settings?.work_days === 'MTWTF' ? 'จันทร์-ศุกร์' : 'ทุกวัน'],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summary);
    ws1['!cols'] = [{ wch: 28 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'สรุปภาพรวม');

    const empRows: (string | number)[][] = [['รหัสพนักงาน', 'ชื่อ', 'สาขา', 'ตำแหน่ง', 'วันเช็คอิน', 'สาย (ครั้ง)', 'นอกสถานที่', 'ตรงเวลา (%)']];
    employees.forEach((e) => {
      const empIns = checkins.filter((c) => c.emp_id === e.emp_id && c.type === 'in');
      const empLate = empIns.filter((c) => { const d = new Date(c.ts); return d.getHours() * 60 + d.getMinutes() > cutoffMin; }).length;
      const empOffsite = checkins.filter((c) => c.emp_id === e.emp_id && c.type.startsWith('offsite')).length;
      const onTimeP = empIns.length === 0 ? 0 : Math.round(((empIns.length - empLate) / empIns.length) * 100);
      empRows.push([e.emp_id, e.name, e.branch ?? '', e.role, empIns.length, empLate, empOffsite, onTimeP]);
    });
    const ws3 = XLSX.utils.aoa_to_sheet(empRows);
    ws3['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'รายพนักงาน');

    const logRows: (string | number)[][] = [['วันที่-เวลา', 'รหัสพนักงาน', 'ชื่อ', 'สาขา', 'ประเภท', 'สาย (นาที)', 'เลิกก่อน (นาที)', 'พิกัด', 'สถานที่ Off-site']];
    checkins.slice().sort((a, b) => a.ts.localeCompare(b.ts)).forEach((c) => {
      const isIn = c.type === 'in' || c.type === 'offsite_in';
      const isOut = c.type === 'out' || c.type === 'offsite_out';
      const d = new Date(c.ts);
      const mins = d.getHours() * 60 + d.getMinutes();
      const late = isIn ? Math.max(0, mins - workStartTotalMin) : 0;
      const early = isOut ? Math.max(0, workEndTotalMin - mins) : 0;
      logRows.push([
        d.toLocaleString('th-TH'),
        c.emp_id, c.employees.name, c.employees.branch ?? '',
        typeLabel(c.type),
        late, early,
        c.lat && c.lng ? `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}` : '',
        c.location_note ?? '',
      ]);
    });
    const ws4 = XLSX.utils.aoa_to_sheet(logRows);
    ws4['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 26 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'ประวัติทั้งหมด');

    XLSX.writeFile(wb, `รายงาน_${monthStr}_${Date.now()}.xlsx`);
  }

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 18 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: '#5c5c60' }}>Sakofah Islamic · Admin · {adminName}</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>รายงานประจำเดือน {monthStr}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Link href="/checkin" style={{ background: '#fff', color: C.dark, border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '7px 12px', fontSize: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <i className="ti ti-home" style={{ fontSize: 13 }} aria-hidden></i>ไปหน้าเช็คอิน
          </Link>
          <input type="month" defaultValue={monthStr} onChange={(e) => { window.location.href = `/admin?month=${e.target.value}`; }}
            style={{ background: '#fff', borderRadius: 10, padding: '6px 12px', border: '0.5px solid rgba(0,0,0,0.1)', fontSize: 12 }} />
          <button onClick={exportExcel} style={{ background: C.dark, color: C.lime, border: 'none', borderRadius: 10, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-file-spreadsheet" style={{ fontSize: 14 }} aria-hidden></i>Export Excel
          </button>
        </div>
      </div>

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
        <KpiCard label="พนักงาน" value={stats.total} bg={C.purple} textCol="#26215c" />
        <KpiCard label="มาตรงเวลา" value={`${stats.onTimeRate}%`} bg={C.lime} textCol={C.dark} />
        <KpiCard label="มาสาย" value={`${stats.lateRate}%`} sub={`${stats.lateCount} ครั้ง`} bg={C.redDeep} textCol="#fff" />
        <KpiCard label="นอกสถานที่" value={stats.offsites} sub="ครั้ง" bg={C.mintDeep} textCol="#04342c" />
      </div>

      {/* Check-in/out table — full width */}
      <div style={{ background: C.dark, color: '#fff', borderRadius: 18, padding: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>ตารางเช็คอิน/เอาท์ · {stats.total} คน</div>
            <div style={{ fontSize: 11, color: '#8e8e92', marginTop: 2 }}>{stats.checkinDays} วันเช็คอิน</div>
          </div>
          <SegmentedControl value={view} onChange={setView} options={[
            { value: 'daily', label: 'รายวัน' },
            { value: 'weekly', label: 'รายสัปดาห์' },
            { value: 'monthly', label: 'รายเดือน' },
          ]} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <Legend color={C.lime} label="เช็คอิน" />
          <Legend color={C.redSoft} label="เช็คเอาท์" />
          <Legend color="#a89bf0" label="นอกสถานที่" />
        </div>

        <svg viewBox="0 0 600 140" style={{ width: '100%', height: 160 }}>
          {chartData.map((d, i) => {
            const x = 10 + i * (580 / chartData.length);
            const w = (580 / chartData.length) - 4;
            const insH = (d.ins / maxBar) * 100;
            const outsH = (d.outs / maxBar) * 100;
            const offsH = (d.offs / maxBar) * 100;
            return (
              <g key={i}>
                <rect x={x} y={130 - insH} width={w} height={insH} fill={C.lime} rx={2} />
                <rect x={x} y={130 - insH - outsH} width={w} height={outsH} fill={C.redSoft} rx={2} />
                <rect x={x} y={130 - insH - outsH - offsH} width={w} height={offsH} fill="#a89bf0" rx={2} />
              </g>
            );
          })}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8e8e92', marginTop: 4 }}>
          {view === 'daily' && <><span>1</span><span>10</span><span>20</span><span>{chartData.length}</span></>}
          {view === 'weekly' && chartData.map((d, i) => <span key={i}>{d.label}</span>)}
          {view === 'monthly' && <span>{chartData[0].label}</span>}
        </div>
      </div>

      {/* History table with filters */}
      <div style={{ background: '#fff', borderRadius: 18, padding: 16, marginBottom: 14, border: '0.5px solid rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>ประวัติทั้งหมด · {historyRows.length} รายการ</div>
          <SegmentedControl value={typeFilter} onChange={setTypeFilter} options={[
            { value: 'all', label: 'ทั้งหมด' },
            { value: 'in', label: 'เข้า' },
            { value: 'out', label: 'ออก' },
            { value: 'offsite', label: 'นอกสถานที่' },
          ]} light />
        </div>

        {/* Filter row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อ/รหัส..." style={inputStyle} />
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} style={inputStyle}>
            <option value="all">ทุกสาขา</option>
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
        </div>

        {/* Rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 500, overflowY: 'auto' }}>
          {historyRows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#5c5c60', fontSize: 12 }}>ไม่พบรายการตามที่กรอง</div>
          ) : (
            historyRows.map((c) => {
              const tInfo = typeInfo(c.type);
              const isIn = c.type === 'in' || c.type === 'offsite_in';
              const isOut = c.type === 'out' || c.type === 'offsite_out';
              const d = new Date(c.ts);
              const mins = d.getHours() * 60 + d.getMinutes();
              const late = isIn ? Math.max(0, mins - workStartTotalMin) : 0;
              const early = isOut ? Math.max(0, workEndTotalMin - mins) : 0;
              return (
                <div key={c.id} style={{ background: '#f4f2ec', borderRadius: 12, padding: 10, display: 'grid', gridTemplateColumns: '46px 1fr auto', gap: 10, alignItems: 'center' }}>
                  {c.photo_url ? (
                    <img src={c.photo_url} style={{ width: 46, height: 46, borderRadius: 10, objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 46, height: 46, borderRadius: 10, background: tInfo.bg, color: tInfo.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className={`ti ti-${tInfo.icon}`} style={{ fontSize: 22 }} aria-hidden></i>
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {c.employees.name}
                      <span style={{ background: tInfo.bg, color: tInfo.color, padding: '1px 7px', borderRadius: 999, fontSize: 10, fontWeight: 600 }}>{tInfo.label}</span>
                      {late > 0 && <span style={{ background: '#fcc6c6', color: '#a32d2d', padding: '1px 7px', borderRadius: 999, fontSize: 10, fontWeight: 600 }}>สาย {late} นาที</span>}
                      {early > 0 && <span style={{ background: '#fcdfb1', color: '#854f0b', padding: '1px 7px', borderRadius: 999, fontSize: 10, fontWeight: 600 }}>เลิกก่อน {early} นาที</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#5c5c60', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.emp_id} · {c.employees.branch ?? '-'}{c.location_note ? ` · ${c.location_note}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 11, color: '#5c5c60' }}>
                    <div>{new Date(c.ts).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}</div>
                    <div style={{ fontWeight: 600, color: '#0e0e10' }}>{new Date(c.ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Device change requests */}
      {devReqs.length > 0 && (
        <div style={{ background: '#fcdfb1', borderRadius: 18, padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#412402' }}>
                <i className="ti ti-device-mobile-cog" style={{ fontSize: 16, marginRight: 6, verticalAlign: -3 }} aria-hidden></i>
                คำขอเปลี่ยนเครื่อง
              </div>
              <div style={{ fontSize: 11, color: '#854f0b' }}>อนุมัติเพื่อผูกเครื่องใหม่กับพนักงาน</div>
            </div>
            <span style={{ background: '#0e0e10', color: '#d6f26b', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 600 }}>{devReqs.length} รายการ</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {devReqs.map((r) => (
              <div key={r.id} style={{ background: '#fff', borderRadius: 14, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: C.lime, color: C.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                    {r.employees.name.slice(0, 2)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.employees.name}</div>
                    <div style={{ fontSize: 11, color: '#5c5c60' }}>{r.emp_id} · {r.employees.branch ?? '-'}</div>
                  </div>
                  <span style={{ fontSize: 10, color: '#5c5c60' }}>{new Date(r.created_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}</span>
                </div>

                <div style={{ background: '#f4f2ec', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11 }}>
                    <div>
                      <div style={{ color: '#5c5c60', fontSize: 10 }}>เครื่องเดิม</div>
                      <div style={{ color: '#0e0e10', wordBreak: 'break-all' }}>{r.old_device ?? '— ไม่มีข้อมูล —'}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11 }}>
                    <div style={{ color: '#0f6e56', fontSize: 10 }}>เครื่องใหม่</div>
                    <div style={{ color: '#04342c', fontWeight: 500, wordBreak: 'break-all' }}>{r.new_device}</div>
                  </div>
                </div>

                {r.reason && (
                  <div style={{ background: '#f4f2ec', borderRadius: 10, padding: 10, marginBottom: 10, fontSize: 11 }}>
                    <div style={{ color: '#5c5c60', fontSize: 10, marginBottom: 2 }}>เหตุผล</div>
                    <div style={{ color: '#0e0e10' }}>{r.reason}</div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <button onClick={() => handleApproveDevice(r.id)} disabled={isPending}
                    style={{ background: C.lime, color: C.dark, border: 'none', borderRadius: 10, padding: '8px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    <i className="ti ti-check" style={{ fontSize: 13, marginRight: 4 }} aria-hidden></i>อนุมัติ
                  </button>
                  <button onClick={() => handleRejectDevice(r.id)} disabled={isPending}
                    style={{ background: '#fff', color: '#a32d2d', border: '0.5px solid rgba(163,45,45,0.3)', borderRadius: 10, padding: '8px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                    <i className="ti ti-x" style={{ fontSize: 13, marginRight: 4 }} aria-hidden></i>ปฏิเสธ
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Employee summary — white */}
      <div style={{ background: '#fff', borderRadius: 18, padding: 16, border: '0.5px solid rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>สรุปพนักงาน {employees.length} คน</div>
          <span style={{ fontSize: 11, color: '#5c5c60' }}>เพิ่ม/แก้ไขใน Supabase Studio → Table Editor</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          {employees.map((e) => {
            const empIns = checkins.filter((c) => c.emp_id === e.emp_id && c.type === 'in');
            const empLate = empIns.filter((c) => { const d = new Date(c.ts); return d.getHours() * 60 + d.getMinutes() > cutoffMin; }).length;
            return (
              <div key={e.emp_id} style={{ background: '#f4f2ec', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: e.role === 'admin' ? C.dark : C.lime, color: e.role === 'admin' ? C.lime : C.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>
                  {e.name.slice(0, 2)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                  <div style={{ fontSize: 10, color: '#5c5c60' }}>
                    {e.emp_id} · {e.branch ?? '-'} · {empIns.length} วัน
                    {empLate > 0 && <span style={{ color: '#a32d2d' }}> · สาย {empLate}</span>}
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

const inputStyle: React.CSSProperties = {
  background: '#f4f2ec', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '8px 10px', fontSize: 12, color: '#0e0e10', outline: 'none', minWidth: 0,
};

function KpiCard({ label, value, sub, bg, textCol }: { label: string; value: number | string; sub?: string; bg: string; textCol: string }) {
  return (
    <div style={{ background: bg, color: textCol, borderRadius: 14, padding: 12 }}>
      <div style={{ fontSize: 11, opacity: 0.75 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>
        {value}{sub && <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.7 }}> {sub}</span>}
      </div>
    </div>
  );
}

function SegmentedControl<T extends string>({ value, onChange, options, light }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; light?: boolean }) {
  return (
    <div style={{ display: 'inline-flex', background: light ? '#f4f2ec' : '#1a1a1c', borderRadius: 999, padding: 3, gap: 2 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)} style={{
            background: active ? (light ? '#0e0e10' : '#d6f26b') : 'transparent',
            color: active ? (light ? '#d6f26b' : '#0e0e10') : (light ? '#5c5c60' : '#c9c9cc'),
            border: 'none', borderRadius: 999, padding: '5px 11px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#c9c9cc' }}>
      <span style={{ width: 8, height: 8, background: color, borderRadius: 2 }} />{label}
    </span>
  );
}

function typeLabel(t: string) {
  return t === 'in' ? 'เช็คอิน' : t === 'out' ? 'เช็คเอาท์' : t === 'offsite_in' ? 'นอกสถานที่ (เข้า)' : 'นอกสถานที่ (ออก)';
}

function typeInfo(t: string) {
  if (t === 'in') return { label: 'เข้า', icon: 'login-2', bg: '#d6f26b', color: '#0e0e10' };
  if (t === 'out') return { label: 'ออก', icon: 'logout-2', bg: '#ff9d9d', color: '#501313' };
  if (t === 'offsite_in') return { label: 'นอก·เข้า', icon: 'map-pin-up', bg: '#a89bf0', color: '#26215c' };
  return { label: 'นอก·ออก', icon: 'map-pin-down', bg: '#f5a85c', color: '#5c4520' };
}
