import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useWorkspace } from '../../lib/workspace/workspaceContext'
import { BACKUP_MAX_BYTES, type WorkspaceBackup } from '../../lib/workspace/workspaceBackup'
import { workspaceRestoreVersions } from '../../lib/workspace/workspaceBackupRepository'
import { processWorkspacePackage } from '../../lib/workspace/workspaceBackupWorkerClient'
import { DemoTrace } from './DemoTrace'
import { WorkspaceHistoryPanel } from './WorkspaceHistoryPanel'

function download(text: string, name: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
type Preview = { backup: WorkspaceBackup; versions: Record<string, number>; fileName: string }
export function WorkspaceDataPanel({ demoOnly = false }: { demoOnly?: boolean }) {
  const workspace = useWorkspace()!
  const [busy, setBusy] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const request = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort() } }, [])
  function begin(label: string) {
    if (request.current) return null
    const controller = new AbortController()
    request.current = controller; setBusy(label); setError(null); setMessage(null)
    return controller
  }
  function finish() { request.current = null; if (mounted.current) setBusy('') }
  function failed(reason: unknown) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Workspace transfer could not finish. Saved data is unchanged.') }
  async function exportBackup(csv = false) {
    const controller = begin('Preparing a coherent workspace backup…')
    if (!controller) return
    try {
      const text = await processWorkspacePackage(csv ? 'requirements_csv_current' : 'export_current', null, controller.signal)
      if (!mounted.current || controller.signal.aborted) return
      download(text, csv ? 'qa-requirement-history.csv' : `qa-mission-control-${new Date().toISOString().slice(0, 10)}.json`, csv ? 'text/csv;charset=utf-8' : 'application/json')
      setMessage(csv ? 'Requirement history exported. Historical interpretations are labeled; use the app to verify current freshness.' : 'Validated workspace backup downloaded. Keep it in a trusted location; it contains your source and QA data.')
    } catch (reason) { failed(reason) }
    finally { finish() }
  }
  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const controller = begin('Validating the package in a background worker…')
    if (!controller) return
    setPreview(null); setConfirmed(false)
    try {
      if (file.size > BACKUP_MAX_BYTES) throw new Error('Workspace packages are limited to 256 MB. Saved data is unchanged.')
      const text = await file.text()
      const backup = await processWorkspacePackage('validate', text, controller.signal)
      const versions = await workspaceRestoreVersions(workspace.repository)
      if (mounted.current && !controller.signal.aborted) setPreview({ backup, versions, fileName: file.name.slice(0, 512) })
    } catch (reason) { failed(reason) }
    finally { finish() }
  }
  async function restore() {
    if (!preview || !confirmed || request.current || !window.confirm('Replace this entire local workspace with the reviewed backup? Existing records not in the package will be removed. Keep an exported backup of this workspace first.')) return
    const controller = begin('Restoring the workspace atomically…')
    if (!controller) return
    try {
      await processWorkspacePackage('restore', { backup: preview.backup, expected: preview.versions })
      // Reset transient approvals, open drafts and cached collections together.
      window.location.reload()
    } catch (reason) { failed(reason); finish() }
  }
  async function loadDemo() {
    if (request.current || !window.confirm('Replace the entire local workspace with synthetic demo data? Export a backup first if you want to keep current data. No live AI will be called.')) return
    const controller = begin('Preparing the deterministic demo…')
    if (!controller) return
    try {
      const versions = await workspaceRestoreVersions(workspace.repository)
      const backup = await processWorkspacePackage('demo', null, controller.signal)
      if (!mounted.current || controller.signal.aborted) { finish(); return }
      setBusy('Restoring the synthetic demo atomically…')
      await processWorkspacePackage('restore', { backup, expected: versions })
      window.location.reload()
    } catch (reason) { failed(reason); finish() }
  }
  if (demoOnly) return <section className="demo-entry" aria-label="Explore the synthetic demo">
    <div className="demo-entry__story"><p className="meta-kicker">Start here · no API key needed</p>
    <h3>Follow one requirement all the way to a release decision.</h3>
    <p>Explore Northstar Commerce 3.2: two complete synthetic specifications, exact requirement evidence, reviewed tests and BUG-DEMO-001. Investigate the duplicate-order failure and the proposed 3.3 policy changes.</p>
    <DemoTrace /></div><div className="demo-entry__action"><p className="meta-kicker">Your first investigation</p><h4>One requirement. Every consequence.</h4><p>Inspect the evidence, follow a failed test, and see what it means for release.</p><button className="button button--primary" disabled={!!busy} onClick={() => void loadDemo()}>Load synthetic demo workspace</button>
    <p className="helper-text">Curated data · no provider calls. Replaces this browser workspace after confirmation. Back up existing work in Import → Workspace backup & restore first.</p>
    {busy && <p role="status">{busy}</p>}
    {error && <p className="feedback feedback--error" role="alert">{error}</p>}</div>
  </section>
  return <section className="workspace-data" aria-label="Workspace backup and restore">
    <div className="workspace-data-grid">
      <section className="panel"><p className="meta-kicker">Portable workspace</p><h3>Back up your QA evidence</h3><p>Keep Sources, Requirements, coverage, QA-confirmed links, tests, jobs, execution and release baselines together.</p><button className="button button--primary" disabled={!!busy} onClick={() => void exportBackup()}>Download workspace backup</button><p className="helper-text">Local JSON · maximum 256 MB · no prompts, raw AI responses or provider credentials. Original attachments are not included; reviewed text and canonical import locations are retained.</p></section>
      <section className="panel"><p className="meta-kicker">Validated replacement</p><h3>Restore a workspace</h3><p>Validate a QA Mission Control package and review its contents before replacing any data.</p><label className="field-group">Choose workspace backup<input type="file" accept=".json,application/json" disabled={!!busy} onChange={(event) => void chooseFile(event)} /></label><p className="helper-text">Restore preserves identities and history. Document indexes are rebuilt locally. Interrupted jobs restore paused; no AI starts automatically. Old results cannot overwrite the restored workspace.</p></section>
    </div>
    <section className="panel workspace-data-utilities"><div><p className="meta-kicker">Explore & share</p><h3>Demo workspace and structured evidence</h3><p className="helper-text">Load Northstar Commerce 3.2 with the complete 114-requirement specification, five companion change items, 16 representative tests, mixed executions, one defect and one policy risk. Loading uses no AI. Later explicit AI actions still use your configured provider.</p></div><div className="button-row"><button className="button button--secondary" disabled={!!busy} onClick={() => void loadDemo()}>Load synthetic demo workspace</button><button className="button button--secondary" disabled={!!busy} onClick={() => void exportBackup(true)}>Export requirement history CSV</button></div></section>
    {busy && <div className="feedback"><p role="status">{busy}</p>{!busy.startsWith('Restoring') && <button className="button button--secondary button--compact" onClick={() => request.current?.abort()}>Cancel transfer</button>}</div>}
    {error && <p className="feedback feedback--error" role="alert">{error}</p>}
    {message && <p className="feedback feedback--success" role="status">{message}</p>}
    {preview && <section className="panel" aria-label="Validated restore preview"><header className="panel-heading"><div><h3>Review replacement</h3><p>{preview.fileName} · exported {preview.backup.exportedAt.slice(0, 10)}</p></div><button className="button button--secondary" disabled={!!busy} onClick={() => { setPreview(null); setConfirmed(false) }}>Discard preview</button></header>
      <dl className="document-metrics">{[['Sources', 'sources'], ['Requirements', 'requirements'], ['Test Cases', 'testCases'], ['Confirmed links', 'requirementTestLinks'], ['Executions', 'executions'], ['Releases', 'releases']].map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{preview.backup.collections[key].length.toLocaleString()}</dd></div>)}</dl>
      <details className="document-secondary"><summary>All package collections</summary>{Object.entries(preview.backup.collections).map(([name, rows]) => <p key={name}>{name}: {rows.length.toLocaleString()}</p>)}</details>
      <p className="feedback feedback--warning">This is replacement, not a merge. A local backup is not encrypted or signed. Restore only a trusted package; imported QA confirmations represent its saved history, not a new AI approval.</p>
      <label className="checkbox-label"><input type="checkbox" checked={confirmed} disabled={!!busy} onChange={(event) => setConfirmed(event.target.checked)} />I have backed up the current workspace and want to replace it.</label>
      <button className="button button--danger" disabled={!!busy || !confirmed} onClick={() => void restore()}>Replace workspace from backup</button>
    </section>}
    <WorkspaceHistoryPanel />
  </section>
}
