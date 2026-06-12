import { format } from 'date-fns'

export function exportWorkspacePayload(payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `local-growth-os-export-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function exportTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
