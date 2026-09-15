import { createContext, useContext } from 'react'
import type { WorkspaceClient } from './workspaceClient'

export const WorkspaceContext = createContext<WorkspaceClient | null>(null)
export const useWorkspace = () => useContext(WorkspaceContext)
