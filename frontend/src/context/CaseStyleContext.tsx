import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type CaseStyle = 'uppercase' | 'mixed'

interface CaseStyleContextValue {
  caseStyle: CaseStyle
  toggleCaseStyle: () => void
}

const CaseStyleContext = createContext<CaseStyleContextValue | undefined>(undefined)

function getInitialCaseStyle(): CaseStyle {
  return localStorage.getItem('caseStyle') === 'mixed' ? 'mixed' : 'uppercase'
}

export function CaseStyleProvider({ children }: { children: ReactNode }) {
  const [caseStyle, setCaseStyle] = useState<CaseStyle>(getInitialCaseStyle)

  useEffect(() => {
    document.documentElement.classList.toggle('mixed-case', caseStyle === 'mixed')
    localStorage.setItem('caseStyle', caseStyle)
  }, [caseStyle])

  const toggleCaseStyle = () => setCaseStyle((c) => (c === 'mixed' ? 'uppercase' : 'mixed'))

  return <CaseStyleContext.Provider value={{ caseStyle, toggleCaseStyle }}>{children}</CaseStyleContext.Provider>
}

export function useCaseStyle() {
  const ctx = useContext(CaseStyleContext)
  if (!ctx) throw new Error('useCaseStyle must be used within CaseStyleProvider')
  return ctx
}
