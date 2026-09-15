import { fingerprint } from '../document-intelligence/documentFingerprint'
import { object, projectEvidence, validateEvidenceInput, type PendingClue } from './productEvidence'

const methods = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'])
const pointer = (parent: string, key: string) => `${parent}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`
const boundedString = (value: unknown, max = 250) => {
  if (typeof value !== 'string') return ''
  if (value.length > max) throw new Error('An API name or description exceeds the supported evidence boundary. Choose a smaller explicit contract projection; no shortened claim was imported.')
  return value.replace(/\p{Cc}/gu, ' ')
}
const schemaKeys = ['type', 'format', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'minProperties', 'maxProperties', 'multipleOf', 'uniqueItems', 'additionalProperties', 'nullable', 'readOnly', 'writeOnly']
function scalarConstraints(raw: unknown) {
  const value = object(raw)
  return schemaKeys.flatMap((key) => {
    const item = value[key]
    if (typeof item === 'number' && Number.isFinite(item) || typeof item === 'boolean') return [`${key}: ${String(item)}`]
    if (typeof item === 'string') return [`${key}: ${boundedString(item)}`]
    if (key === 'type' && Array.isArray(item) && item.every((entry) => typeof entry === 'string')) return [`type: ${item.map((entry) => boundedString(entry, 20)).join(' | ')}`]
    return []
  }).join('; ')
}

/** Bounded JSON projection. It is not a full OpenAPI/JSON Schema validator or a client executor. */
export async function importApiContract(input: { name: string; text: string }) {
  validateEvidenceInput(input)
  let raw: unknown
  try { raw = JSON.parse(input.text) } catch { throw new Error('Choose an OpenAPI 3.0/3.1 or JSON Schema JSON document. YAML must be explicitly exported as JSON first.') }
  let visited = 0
  const budget = [{ value: raw, depth: 0 }]
  while (budget.length) {
    const current = budget.pop()!
    if (++visited > 200000 || current.depth > 40) throw new Error('The API schema exceeds safe structural limits. No partial contract was imported.')
    if (current.value && typeof current.value === 'object') for (const value of Object.values(current.value)) budget.push({ value, depth: current.depth + 1 })
  }
  const root = object(raw)
  const isOpenApi = typeof root.openapi === 'string' && /^3\.(0|1)\.\d+$/.test(root.openapi)
  if (!isOpenApi && (root.openapi !== undefined || root.swagger !== undefined || typeof raw !== 'boolean' && !['$schema', '$defs', 'type', 'properties', 'allOf', 'anyOf', 'oneOf', '$ref', 'required'].some((key) => key in root))) throw new Error('This is not a supported OpenAPI 3.0/3.1 or recognizable JSON Schema contract.')
  const clues: PendingClue[] = []
  const limitations = ['Local projection only; contract descriptions do not prove implemented behavior. No API is called.', 'Examples, defaults, server URLs and external references are not imported or fetched.', 'Schema composition, references and custom keywords require QA review; this is not a complete contract validator.']
  const add = (kind: PendingClue['kind'], summary: string, location: string) => { if (clues.length >= 3000) throw new Error('The contract exceeds 3,000 evidence clues. No prefix was imported.'); clues.push({ kind, summary, origin: { fileIndex: 0, pointer: location } }) }
  const schema = (value: unknown, location: string, label: string, depth = 0): void => {
    if (depth > 24) throw new Error('The schema exceeds the supported projection depth. No prefix was imported.')
    if (typeof value === 'boolean') { add('schema', `${label} — schema ${value ? 'allows any instance' : 'rejects every instance'}`, location); return }
    const item = object(value)
    const constraints = scalarConstraints(item)
    const required = Array.isArray(item.required) ? item.required.filter((key) => typeof key === 'string').map((key) => boundedString(key)).join(', ') : ''
    const enumSize = Array.isArray(item.enum) ? item.enum.length : null
    if (constraints || required || enumSize !== null || item.pattern !== undefined || item.const !== undefined) add('schema', `${label} — ${constraints}${required ? `; required: ${required}` : ''}${enumSize === null ? '' : `; enum: ${enumSize} allowed values (values withheld)`}${item.const !== undefined ? '; const value defined (withheld)' : ''}${item.pattern !== undefined ? '; pattern constraint defined (not executed)' : ''}`, location)
    if (typeof item.$ref === 'string') add('reference', `${label} — ${item.$ref.startsWith('#/') ? `local reference ${boundedString(item.$ref, 500)} (not expanded)` : 'external reference (not fetched)'}`, pointer(location, '$ref'))
    for (const keyword of ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas']) for (const [name, child] of Object.entries(object(item[keyword]))) schema(child, pointer(pointer(location, keyword), name), `${label}.${boundedString(name, 100)}`, depth + 1)
    for (const keyword of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) if (Array.isArray(item[keyword])) {
      add('schema', `${label} — ${keyword}: ${(item[keyword] as unknown[]).length} subschemas; evaluate composition rules together`, pointer(location, keyword))
      ;(item[keyword] as unknown[]).forEach((child, index) => schema(child, pointer(pointer(location, keyword), String(index)), `${label} ${keyword}[${index}]`, depth + 1))
    }
    for (const keyword of ['items', 'not', 'if', 'then', 'else', 'contains', 'additionalProperties', 'unevaluatedProperties']) if (item[keyword] && typeof item[keyword] === 'object') schema(item[keyword], pointer(location, keyword), `${label} ${keyword}`, depth + 1)
  }
  if (isOpenApi) {
    for (const [path, rawPath] of Object.entries(object(root.paths))) {
      if (!path.startsWith('/')) continue
      const pathItem = object(rawPath); const pathPointer = pointer('/paths', path)
      if (pathItem.$ref) add('reference', `Path ${boundedString(path)} references a separate path definition; not expanded`, pointer(pathPointer, '$ref'))
      for (const [method, rawOperation] of Object.entries(pathItem)) {
        if (!methods.has(method)) continue
        const operation = object(rawOperation); const location = pointer(pathPointer, method); const label = `${method.toUpperCase()} ${boundedString(path, 500)}`
        add('endpoint', `${label}${operation.summary ? ` — ${boundedString(operation.summary)}` : ''}${operation.deprecated === true ? ' (deprecated)' : ''}`, location)
        const parameters = new Map<string, { value: unknown; location: string }>()
        for (const [owner, parent] of [[pathItem, pathPointer], [operation, location]] as const) if (Array.isArray(owner.parameters)) owner.parameters.forEach((value, index) => { const parameter = object(value); parameters.set(parameter.$ref ? `${parent}:${index}` : `${parameter.in}:${parameter.name}`, { value, location: pointer(pointer(parent, 'parameters'), String(index)) }) })
        for (const parameter of parameters.values()) {
          const value = object(parameter.value)
          if (value.$ref) { add('reference', `${label} — parameter reference requires review (not expanded)`, parameter.location); continue }
          add('parameter', `${label} — ${boundedString(value.in, 30)} parameter ${boundedString(value.name)}; ${value.required === true ? 'required' : 'optional'}; ${scalarConstraints(value.schema) || 'schema not expanded'}`, parameter.location)
        }
        const security = operation.security === undefined ? root.security : operation.security
        if (Array.isArray(security)) {
          const anonymous = !security.length || security.some((entry) => Object.keys(object(entry)).length === 0)
          const alternatives = security.map((entry) => Object.entries(object(entry)).map(([name, scopes]) => `${boundedString(name)}${Array.isArray(scopes) && scopes.length ? ` scopes: ${scopes.map((scope) => boundedString(scope)).join(', ')}` : ''}`).join(' AND ')).filter(Boolean).join(' OR ')
          add('authentication', `${label} — ${anonymous ? 'Anonymous access permitted by this operation' : `Requires ${alternatives || 'declared authentication'}`}${anonymous && alternatives ? `; alternative ${alternatives}` : ''}`, operation.security === undefined ? '/security' : pointer(location, 'security'))
        } else add('authentication', `${label} — authentication not declared here; verify deployment and middleware`, location)
        for (const [code, response] of Object.entries(object(operation.responses))) {
          if (!/^(?:[1-5](?:\d\d|XX)|default)$/.test(code)) { limitations.push('Unrecognized response keys were omitted; review the original contract.'); continue }
          const value = object(response); const responsePointer = pointer(pointer(location, 'responses'), code)
          add('response', `${label} — response ${code}${value.$ref ? '; referenced response (not expanded)' : value.description ? `: ${boundedString(value.description)}` : ''}`, responsePointer)
          for (const [media, details] of Object.entries(object(value.content))) if (object(details).schema !== undefined) schema(object(details).schema, pointer(pointer(pointer(responsePointer, 'content'), media), 'schema'), `${label} response ${code}`)
        }
        const body = object(operation.requestBody)
        if (Object.keys(body).length) {
          add('parameter', `${label} — request body ${body.required === true ? 'required' : 'optional'}${body.$ref ? '; reference not expanded' : ''}`, pointer(location, 'requestBody'))
          for (const [media, details] of Object.entries(object(body.content))) if (object(details).schema !== undefined) schema(object(details).schema, pointer(pointer(pointer(pointer(location, 'requestBody'), 'content'), media), 'schema'), `${label} request body`)
        }
      }
    }
    for (const [name, value] of Object.entries(object(object(root.components).schemas))) schema(value, pointer('/components/schemas', name), boundedString(name))
    for (const [name, value] of Object.entries(object(object(root.components).securitySchemes))) add('authentication', `Security scheme ${boundedString(name)} — ${boundedString(object(value).type, 40)}${object(value).scheme ? ` / ${boundedString(object(value).scheme, 40)}` : ''}${object(value).in ? ` / ${boundedString(object(value).in, 40)}` : ''}; credentials and URLs withheld`, pointer('/components/securitySchemes', name))
  } else schema(raw, '', 'Root')
  return projectEvidence(isOpenApi ? 'openapi' : 'json_schema', [{ path: input.name, fingerprint: await fingerprint(input.text), lineCount: input.text.split(/\r\n|\r|\n/).length }], clues, limitations)
}
