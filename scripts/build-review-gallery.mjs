// Present actual browser captures, never generated mockups or edited UI images.
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = resolve(process.argv[2])
const before = JSON.parse(await readFile(resolve(output, 'before-1440/verification.json'), 'utf8'))
const after = JSON.parse(await readFile(resolve(output, 'current-1440/verification.json'), 'utf8'))
const screens = [
  ['01-shell-dashboard', 'App shell & overview', 'Wide pale navigation, large introductory space and independent summary panels.', 'Fixed dark grouped navigation, compact breadcrumb bar, release board and linked operational signals.'],
  ['02-sources', 'QA Sources', 'Full document cards stacked one after another; scanning competes with document content.', 'Persistent source index beside a single selected document, with search and actions at workspace level.'],
  ['03-source-structure', 'Source Structure', 'A vertical section selector embedded inside each source card.', 'A document workbench: compact section index beside the selected analysis, within source master/detail.'],
  ['04-section-analysis', 'Section Coverage Analysis', 'Analysis follows the full section selector in the vertical page flow.', 'Selected-section context and analysis share one workspace; compact findings and disclosures reduce repeated panels.'],
  ['05-global-coverage', 'Global Coverage Plan', 'Large mint coverage panels and prominent instructional blocks compete for attention.', 'Neutral plan workspace, compact metrics and toolbar, clear area queue and selected-area hierarchy.'],
  ['06-ai-suggestions', 'AI Suggestions', 'Oversized review framing with equally prominent nested panels and decorative status treatment.', 'Denser review inbox with restrained status, explicit QA approval and evidence on demand. Approval rules are unchanged.'],
  ['07-merge-selection', 'Global Merge · selection', 'Checkbox selection extends the vertical source card layout.', 'Merge selection stays in the source workbench with current-only inputs, selection count and explicit build action.'],
  ['08-merge-candidate', 'Global Merge · review', 'Candidate details precede the final save controls; warnings and relationships are spread down the page.', 'Unsaved state, scope metrics and confirmation come first; conflicts and overlaps precede area details.'],
  ['09-test-cases', 'Test Case library', 'Independent tall cards repeat badges and timestamps; steps were already expandable.', 'Compact aligned rows make the whole library scannable; status, priority, type and row actions have consistent columns.'],
  ['10-test-case-detail', 'Test Case detail', 'Expanded content shares the same oversized card treatment as the rest of the library.', 'Expand one row in place for preconditions and action/expected-result steps; adjacent cases remain compact.'],
  ['11-bugs', 'Bugs', 'List cards share desktop width with an empty editor placeholder.', 'Full-width defect register with compact metadata; reproduction details disclose on demand and editing opens only when needed.'],
  ['12-risks', 'Risks', 'Repeated risk cards and an unused editing column reduce working space.', 'Full-width risk register; severity signals scan quickly while description and mitigation remain available in disclosure.'],
  ['13-suites', 'Test Suites', 'Large suite cards repeat member lists and explanatory footers.', 'Compact suite rows foreground purpose and membership count; included Test Cases expand on demand.'],
  ['14-execution', 'Execution', 'Large summary cards and stacked scope/filter panels push the execution queue below the fold.', 'Five-result strip, segmented execution progress, failure shortcut, compact controls and a visible queue/runner workspace.'],
  ['15-report', 'Release Report', 'A dashboard-like stack of metrics, repeated cards and a permanently exposed Markdown block.', 'Meeting-ready release document with masthead, integrated results, prioritized failures, two-column assessment and print action.'],
]
const data = JSON.stringify({ screens, before: before.build.revision, after: after.build.revision }).replace(/</g, '\\u003c')
await writeFile(resolve(output, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>QA Mission Control · Visual review</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#eef1f5;color:#1a2639;font:14px/1.5 system-ui,sans-serif}header{padding:22px 28px;background:#142137;color:white}h1{font-size:24px;margin:0 0 6px}header p{margin:3px 0;color:#cad3e2}.bar{display:flex;gap:16px;align-items:end;flex-wrap:wrap;padding:18px 28px;background:white;border-bottom:1px solid #d4dce7;position:sticky;top:0;z-index:1}label{display:grid;gap:4px;font-size:12px;font-weight:650}select,a.button{font:inherit;padding:8px 12px;border:1px solid #b6c2d3;border-radius:5px;background:white;color:#192e4c}select:focus-visible,a:focus-visible{outline:3px solid #3979df;outline-offset:2px}a{color:#1656a7}.button{text-decoration:none;margin-left:auto}main{padding:24px 28px}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:18px}.frame{min-width:0;background:white;border:1px solid #d4dce7;border-radius:6px;overflow:hidden}.frame h2{font-size:16px;margin:0;padding:12px 16px;border-bottom:1px solid #e1e6ee}.frame p{min-height:65px;margin:0;padding:12px 16px;color:#44526a}.frame img{display:block;width:100%;height:auto;border-top:1px solid #e1e6ee}.frame a{display:block;padding:10px 16px;font-size:12px}.notes{padding:18px 0;max-width:1000px;color:#526079}code{font-size:11px;overflow-wrap:anywhere}.single{grid-template-columns:1fr}.single .frame:first-child{display:none}.single .frame{max-width:1440px;margin:auto}.single img{width:100%;max-width:none}@media(max-width:760px){.comparison{grid-template-columns:1fr}header,main,.bar{padding:16px}.frame p{min-height:0}}
</style></head><body>
<header><h1>QA Mission Control · Before / After</h1><p>Actual rendered application · identical synthetic QA data · mock AI only</p><p id="revisions"></p></header>
<div class="bar"><label>Screen<select id="screen"></select></label><label>View<select id="view"><option value="compare">Before / After · 1440px</option><option value="1440">Current · 1440px</option><option value="1280">Current · 1280px</option><option value="1024">Current · 1024px</option><option value="390">Current · 390px</option></select></label><a class="button" href="/" target="_blank" rel="noopener">Open current demo ↗</a></div>
<main><div class="comparison" id="comparison"><section class="frame"><h2>Before</h2><p id="before-copy"></p><img id="before-image" alt=""><a id="before-link" target="_blank" rel="noopener">Open full-size before screenshot ↗</a></section><section class="frame"><h2 id="after-heading">After</h2><p id="after-copy"></p><img id="after-image" alt=""><a id="after-link" target="_blank" rel="noopener">Open full-size current screenshot ↗</a></section></div>
<p class="notes">These are browser screenshots, not design mockups. The sample workspace contains 5 sources, 10 checkout sections, 6 current analyses, a saved plan, 18 Test Cases, 5 Bugs, 4 Risks, 4 Suites and mixed execution results. Each capture pass makes only two explicitly triggered mock AI requests. No provider calls. “Before” is an isolated Git archive; “After” uses the committed repository.</p></main>
<script>
const data=${data};
const screen=document.getElementById('screen'),view=document.getElementById('view');
data.screens.forEach((item,i)=>{const option=document.createElement('option');option.value=i;option.textContent=item[1];screen.append(option)});
document.getElementById('revisions').textContent='Before '+data.before+' → After '+data.after;
const initial=new URLSearchParams(location.search).get('screen');if(initial&&data.screens.some(s=>s[0]===initial))screen.value=data.screens.findIndex(s=>s[0]===initial);
function render(){const item=data.screens[Number(screen.value)];const width=view.value==='compare'?'1440':view.value;document.getElementById('comparison').classList.toggle('single',view.value!=='compare');document.getElementById('before-copy').textContent=item[2];document.getElementById('after-copy').textContent=item[3];document.getElementById('after-heading').textContent='After · '+width+'px';for(const side of ['before','after']){const path=(side==='before'?'before-1440':'current-'+width)+'/'+item[0]+'.png';const img=document.getElementById(side+'-image');img.parentElement.style.maxWidth=view.value==='compare'?'':width+'px';img.src=path;img.alt=item[1]+' · '+side;document.getElementById(side+'-link').href=path}history.replaceState(null,'','?screen='+item[0])}
screen.addEventListener('change',render);view.addEventListener('change',render);render();
</script></body></html>`)
console.log('Built visual evidence gallery: ' + resolve(output, 'index.html'))
