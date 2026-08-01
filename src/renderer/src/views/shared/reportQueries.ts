import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { components } from '@shared/api.generated'
import { useBeacon } from '../../api/queryClient'

export type ReportTemplate = components['schemas']['ReportTemplateDocument']
export type TemplateCollection = components['schemas']['ReportTemplateCollection']

const keys = {
  all: () => ['reports'] as const,
  templates: () => ['reports', 'templates'] as const,
  template: (id: string) => ['reports', 'template', id] as const
}

export function useTemplates() {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.templates(),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.reports.templates(signal)
    },
    enabled: client !== null
  })
}

export function useTemplate(templateId: string) {
  const client = useBeacon()

  return useQuery({
    queryKey: keys.template(templateId),
    queryFn: ({ signal }) => {
      if (client === null) throw new Error('No engine')
      return client.reports.template(templateId, signal)
    },
    enabled: client !== null && templateId !== ''
  })
}

export function useSaveTemplate() {
  const client = useBeacon()
  const queries = useQueryClient()

  return useMutation({
    mutationFn: (template: ReportTemplate) => {
      if (client === null) throw new Error('No engine')
      return client.reports.saveTemplate(template.template_id, template)
    },
    onSuccess: (result) => {
      // Written into the cache rather than refetched, for the same reason as
      // the index and constraint editors: the dirty flag compares against
      // this entry, so a round trip would show "unsaved" after a success.
      queries.setQueryData(keys.template(result.template_id), result)
      void queries.invalidateQueries({ queryKey: keys.templates() })
    }
  })
}

export interface RenderOptions {
  templateId: string
  indexId?: string
}

/**
 * Render a report.
 *
 * 202 with a job, like every other long task. The PDF is fetched separately
 * once the job succeeds — the job carries an id, not the bytes.
 */
export function useRenderReport() {
  const client = useBeacon()

  return useMutation({
    mutationFn: (options: RenderOptions) => {
      if (client === null) throw new Error('No engine')
      return client.reports.render({
        template_id: options.templateId,
        ...(options.indexId === undefined || options.indexId === ''
          ? {}
          : { index_id: options.indexId })
      })
    }
  })
}

/**
 * Fetch the finished PDF and hand it to the OS.
 *
 * The bytes go through the renderer because the download is authenticated:
 * opening py-beacon's URL in a browser would arrive with no bearer token.
 * Main only writes the file and asks the OS to open it.
 */
export function useOpenRender() {
  const client = useBeacon()

  return useMutation({
    mutationFn: async ({ renderId, filename }: { renderId: string; filename: string }) => {
      if (client === null) throw new Error('No engine')
      const bridge = window.beacon
      if (bridge === undefined) throw new Error('No desktop bridge')

      const bytes = await client.reports.download(renderId)
      return bridge.reports.open(filename, bytes)
    }
  })
}
