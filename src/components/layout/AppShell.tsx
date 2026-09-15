import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useWorkspace } from '../../lib/workspace/workspaceContext'

export type AppView = 'dashboard' | 'test-cases' | 'test-suites' | 'qa-sources' | 'ai-suggestions' | 'import' | 'bugs' | 'risks' | 'releases' | 'executions' | 'release-report'

const NAV_GROUPS: { label: string; items: { id: AppView; title: string; icon: string }[] }[] = [
  { label: 'Workspace', items: [
    { id: 'dashboard', title: 'Dashboard', icon: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z' },
  ] },
  { label: 'Plan & design', items: [
    { id: 'qa-sources', title: 'QA Sources', icon: 'M14 2H5v20h14V7z M14 2v6h5 M8 12h8 M8 16h8' },
    { id: 'ai-suggestions', title: 'AI Coverage Workspace', icon: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z' },
    { id: 'test-cases', title: 'Test Cases', icon: 'M9 5h12 M9 12h12 M9 19h12 M2 5l2 2 3-4 M2 12l2 2 3-4 M2 19l2 2 3-4' },
    { id: 'test-suites', title: 'Test Suites', icon: 'm3 6 9-4 9 4-9 4Z M3 12l9 4 9-4 M3 18l9 4 9-4' },
    { id: 'import', title: 'Import', icon: 'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5' },
  ] },
  { label: 'Validate & deliver', items: [
    { id: 'bugs', title: 'Bugs', icon: 'M8 8h8v8a4 4 0 0 1-8 0Z M9 8V5h6v3 M3 10h5 M16 10h5 M3 16h5 M16 16h5 M6 3l3 2 M18 3l-3 2' },
    { id: 'risks', title: 'Risks', icon: 'm12 3 10 18H2Z M12 9v5 M12 17v1' },
    { id: 'releases', title: 'Releases', icon: 'M4 21V3 M4 4h15l-3 5 3 5H4' },
    { id: 'executions', title: 'Executions', icon: 'm8 4 13 8-13 8Z' },
    { id: 'release-report', title: 'Release Report', icon: 'M4 3h16v18H4z M8 7h8 M8 12h3 M8 16h8' },
  ] },
]

const NAV_LABELS: Partial<Record<AppView, string>> = { 'qa-sources': 'Sources', 'ai-suggestions': 'AI Coverage', 'test-suites': 'Suites', 'release-report': 'Report' }

export function AppShell({ activeView, onNavigate, children }: { activeView: AppView; onNavigate: (view: AppView) => void; children: ReactNode }) {
  const workspace = useWorkspace()
  const [menuOpen, setMenuOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const menuRef = useRef<HTMLButtonElement>(null)
  const previousView = useRef(activeView)
  useEffect(() => {
    if (previousView.current === activeView) return
    previousView.current = activeView
    // Preserve a newly opened review's more specific focus target.
    if (!mainRef.current?.contains(document.activeElement)) mainRef.current?.focus({ preventScroll: true })
    if (mainRef.current) mainRef.current.scrollTop = 0
  }, [activeView])
  const isDemoReview = Boolean(document.querySelector('meta[name="qa-review-mode"]'))
  const hasDemoData = workspace?.get('sources').items.some((source) => source.id.startsWith('demo-northstar-source-'))
  const group = NAV_GROUPS.find((candidate) => candidate.items.some((item) => item.id === activeView))!
  const activeItem = group.items.find((item) => item.id === activeView)!

  function navigate(view: AppView) {
    onNavigate(view)
    setMenuOpen(false)
    mainRef.current?.focus({ preventScroll: true })
    if (mainRef.current) mainRef.current.scrollTop = 0
  }

  return (
    <div className={`app-shell${activeView === 'ai-suggestions' ? ' app-shell--ai-coverage' : ''}`} data-workspace={activeView}>
      <a className="skip-link" href="#workspace-main">Skip to workspace</a>
      <header className="app-header">
        <div className="workspace-brand">
          <span className="workspace-brand__mark" aria-hidden="true">Q<span>A</span></span>
          <div><h1 aria-label="QA Mission Control">Mission Control</h1><span>Evidence → Decision</span></div>
        </div>
        <button ref={menuRef} type="button" className="button button--secondary mobile-nav-toggle" aria-expanded={menuOpen} aria-controls="workspace-navigation" onClick={() => setMenuOpen(!menuOpen)}>Menu</button>
        <div className="workspace-breadcrumb"><svg className="workspace-context-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={activeItem.icon} /></svg><span>{group.label}</span><span aria-hidden="true">/</span><strong>{activeItem.title}</strong></div>
        <span className={`workspace-local${isDemoReview || hasDemoData ? ' workspace-local--demo' : ''}`}><span aria-hidden="true" /><small className="workspace-local__full">{isDemoReview ? 'Demo workspace · Mock AI' : hasDemoData ? 'Local workspace · Synthetic demo data' : 'Local workspace'}</small>{(isDemoReview || hasDemoData) && <small className="workspace-local__short">{isDemoReview ? 'Mock AI demo' : 'Synthetic demo'}</small>}</span>
      </header>
      <div className="app-body">
        <aside id="workspace-navigation" className={`app-sidebar${menuOpen ? ' app-sidebar--open' : ''}`} aria-label="Primary navigation" onKeyDown={(event) => { if (event.key === 'Escape' && menuOpen) { setMenuOpen(false); menuRef.current?.focus() } }}>
          <nav className="nav-list" aria-label="Workspace pages">
            {NAV_GROUPS.map((navGroup) => (
              <div className="nav-group" key={navGroup.label}>
                <p className="app-sidebar__label">{navGroup.label}</p>
                {navGroup.items.map((item) => (
                  <button key={item.id} type="button" className={`nav-button${item.id === activeView ? ' nav-button--active' : ''}`} onClick={() => navigate(item.id)} aria-label={item.title} aria-current={item.id === activeView ? 'page' : undefined}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={item.icon} /></svg>
                    <span className="nav-button__title">{NAV_LABELS[item.id] ?? item.title}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="app-sidebar__note"><strong>AI suggests. QA approves.</strong></div>
        </aside>
        <main id="workspace-main" ref={mainRef} tabIndex={-1} className="app-main">{children}</main>
      </div>
    </div>
  )
}
