# Monthly Excel Archive and Fast Check-in Design

## Goals

1. Keep monthly Excel reports available after check-in data and photos are cleaned up.
2. Let admins keep using the existing Export Excel button.
3. Prevent accidental cleanup of the wrong month by requiring an explicit date range.
4. Make check-in, check-out, and offsite submit feel faster while preserving required GPS and device checks.
5. Measure button timings during verification instead of relying on perception.

## Non-Goals

- Do not rebuild historical reports from deleted check-in rows.
- Do not allow cleanup before the report archive is safely created.
- Do not skip server-side validation for device, employee status, duplicate check-ins, or GPS rules.
- Do not add a separate archive-heavy screen unless the existing admin page becomes too crowded.

## Monthly Archive Behavior

The existing Export Excel button stays as the main report action.

When the selected month still has live check-in data, Export Excel generates the workbook from current data as it does today. This includes the current month even when only part of the month has elapsed.

When the selected month has no live check-in data, Export Excel checks for an archived workbook for that month. If one exists, it downloads the archived file. If neither live data nor an archived file exists, the UI shows a clear message: no report data or archived file was found for that month.

Archived files are stored server-side in Supabase Storage, not in the browser. Metadata is stored in a database table so the admin page can find the latest archive for a month or range.

## Cleanup Behavior

The cleanup action changes from "clean current month" to a date-range modal:

- Start date
- End date
- Confirm text or confirmation step

The selected cleanup range must stay inside one calendar month. If the admin needs to clean across months, they run cleanup once per month. This keeps archive lookup compatible with the month-based Export Excel button.

Before deleting anything, the server creates or replaces the archive workbook for the selected range. If archive creation, upload, or metadata insert fails, cleanup stops and no check-in data or photos are deleted.

After archive succeeds, cleanup deletes only check-ins and photos inside the selected date range. Employee profiles, device bindings, PIN state, branches, settings, and archived Excel files remain.

## Archive Data Model

Add a table such as `attendance_report_archives`:

- `id uuid primary key`
- `month text not null`
- `date_from date not null`
- `date_to date not null`
- `storage_path text not null`
- `file_name text not null`
- `created_by uuid`
- `created_at timestamptz not null default now()`
- `checkin_count int not null default 0`
- `photo_count int not null default 0`

Use a private Supabase Storage bucket such as `attendance-report-archives`. Admin server actions use the service role key to upload and create signed download URLs.

## Workbook Generation

Move the workbook-building logic out of `AdminClient` into a shared server/client-safe report builder module. The client Export button and server archive action should call the same builder so archived files match normal exports.

Inputs include:

- employees
- checkins with employee names and branches
- settings
- branch order
- HR approved leave requests
- report month
- generated-by name

The builder returns an XLSX buffer or workbook object. Client export writes the file. Server archive uploads the buffer to Supabase Storage.

## Fast Check-in Behavior

The button remains disabled until the client-side readiness checks pass:

- GPS coordinates exist
- GPS is within the configured radius already available on the page
- device id exists locally
- for offsite, photo and location are present

Server actions still verify employee auth, active status, device binding, duplicate day rules, and GPS/range rules before inserting.

After the user presses a valid button, the UI shows a success dialog quickly once the server accepts the record. The dialog text:

- check icon
- `Check-in` or `Check-out`
- `เรียบร้อย`
- OK/close action

The UI should avoid doing expensive refresh work before showing the dialog. Any route refresh or status reload happens after the dialog is visible, or after the user closes it.

## Offsite Photo Handling

Offsite should reduce upload friction by making image processing predictable:

- Resize client-side to a fixed maximum dimension.
- Compress to a target quality and reasonable file size.
- Keep the existing watermark.
- Validate that a Blob exists before enabling submit.

The system should still attempt to upload the photo before inserting an offsite check-in, because the report expects photo evidence. If upload fails, the user sees a focused error and can retry without retaking the photo.

## Timing Verification

Measure these times during implementation:

- Normal check-in: button release to success dialog visible.
- Normal check-out: button release to success dialog visible.
- Offsite submit: submit click to success dialog or navigation.
- Server action duration where practical.
- Export archive download path: click to file download starts.
- Cleanup path: confirm to archive created, then cleanup complete.

Target experience:

- Check-in/out success dialog should appear in about 1-2 seconds on a normal connection.
- Offsite may take longer due to photo upload, but should avoid unnecessary image size and refresh delays.
- Cleanup can take longer, but must report archive and delete progress clearly.

## Error Handling

Export:

- Live data exists: generate from live data.
- No live data, archive exists: download archive.
- No live data, no archive: show no-file message.
- Archive download URL fails: show retryable error.

Cleanup:

- Invalid range: do not continue.
- Cross-month range: ask admin to split by month.
- Archive creation/upload fails: do not delete anything.
- Delete photos fails: do not delete check-ins until the failure is reported.
- Check-in delete fails: report error and keep archive metadata.

Check-in:

- Device not bound or mismatched keeps current redirect behavior.
- GPS failure shows error and does not show success.
- Duplicate check-in shows duplicate message.
- Success dialog appears before heavy refresh.

## Testing Plan

Automated:

- Report builder creates an archived workbook with leave labels.
- Export decision chooses live workbook, archive download, or no-file message.
- Cleanup refuses cross-month ranges.
- Cleanup calls archive creation before deletion.
- Cleanup does not delete when archive creation fails.
- Offsite image helper produces a Blob under the expected maximum dimensions.

Manual/browser:

- Admin Export for current live month downloads live workbook.
- Admin Export for deleted archived month downloads archive.
- Admin Export for empty month shows no-file message.
- Cleanup modal rejects cross-month date ranges.
- Cleanup archives first, then deletes selected range.
- Check-in and check-out popup timing is recorded.
- Offsite submit timing is recorded with a real compressed photo.

## Rollout Order

1. Extract shared report builder without changing visible behavior.
2. Add archive table, bucket, and server archive action.
3. Change Export button to live-or-archive behavior.
4. Replace cleanup prompt with date-range modal and archive-before-delete server action.
5. Optimize check-in success dialog timing.
6. Optimize offsite image flow and submit timing.
