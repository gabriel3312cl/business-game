import { Box, Link, Typography } from '@mui/material'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  children: string
}

export function AdvisorMarkdown({ children }: Props) {
  return (
    <Box
      sx={{
        overflowWrap: 'anywhere',
        '& > :first-of-type': { mt: 0 },
        '& > :last-child': { mb: 0 },
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        disallowedElements={['img']}
        unwrapDisallowed
        components={{
          p: ({ children: content }) => (
            <Typography component="p" variant="body2" sx={{ my: 0.8, lineHeight: 1.6 }}>
              {content}
            </Typography>
          ),
          h1: ({ children: content }) => (
            <Typography component="h1" variant="subtitle1" fontWeight={900} sx={{ my: 1 }}>
              {content}
            </Typography>
          ),
          h2: ({ children: content }) => (
            <Typography
              component="h2"
              variant="subtitle2"
              color="secondary.light"
              fontWeight={850}
              sx={{ mt: 1.25, mb: 0.5 }}
            >
              {content}
            </Typography>
          ),
          h3: ({ children: content }) => (
            <Typography component="h3" variant="body2" fontWeight={850} sx={{ mt: 1, mb: 0.4 }}>
              {content}
            </Typography>
          ),
          strong: ({ children: content }) => (
            <Box component="strong" sx={{ color: 'secondary.light', fontWeight: 850 }}>
              {content}
            </Box>
          ),
          em: ({ children: content }) => (
            <Box component="em" sx={{ color: 'text.secondary' }}>
              {content}
            </Box>
          ),
          ul: ({ children: content }) => (
            <Box component="ul" sx={{ pl: 2.5, my: 0.75 }}>
              {content}
            </Box>
          ),
          ol: ({ children: content }) => (
            <Box component="ol" sx={{ pl: 2.5, my: 0.75 }}>
              {content}
            </Box>
          ),
          li: ({ children: content }) => (
            <Box
              component="li"
              sx={{
                typography: 'body2',
                lineHeight: 1.55,
                mb: 0.45,
                pl: 0.25,
                '&::marker': { color: 'secondary.main', fontWeight: 800 },
                '& > p': { my: 0 },
              }}
            >
              {content}
            </Box>
          ),
          blockquote: ({ children: content }) => (
            <Box
              component="blockquote"
              sx={{
                m: '10px 0',
                pl: 1.25,
                borderLeft: '3px solid',
                borderColor: 'secondary.main',
                color: 'text.secondary',
                '& > p': { my: 0 },
              }}
            >
              {content}
            </Box>
          ),
          code: ({ children: content }) => (
            <Box
              component="code"
              sx={{
                px: 0.45,
                py: 0.15,
                borderRadius: 0.75,
                bgcolor: 'rgba(184,255,61,.09)',
                color: 'primary.light',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: '0.82em',
              }}
            >
              {content}
            </Box>
          ),
          pre: ({ children: content }) => (
            <Box
              component="pre"
              sx={{
                m: '10px 0',
                p: 1,
                overflowX: 'auto',
                borderRadius: 1.5,
                bgcolor: 'rgba(0,0,0,.28)',
                border: '1px solid rgba(255,255,255,.08)',
                whiteSpace: 'pre-wrap',
                '& code': { p: 0, bgcolor: 'transparent', color: 'text.primary' },
              }}
            >
              {content}
            </Box>
          ),
          a: ({ href, children: content }) => (
            <Link
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              color="primary.light"
            >
              {content}
            </Link>
          ),
          table: ({ children: content }) => (
            <Box sx={{ overflowX: 'auto', my: 1 }}>
              <Box
                component="table"
                sx={{ width: '100%', borderCollapse: 'collapse', typography: 'caption' }}
              >
                {content}
              </Box>
            </Box>
          ),
          th: ({ children: content }) => (
            <Box
              component="th"
              sx={{
                p: 0.65,
                textAlign: 'left',
                color: 'secondary.light',
                borderBottom: '1px solid rgba(255,255,255,.18)',
              }}
            >
              {content}
            </Box>
          ),
          td: ({ children: content }) => (
            <Box
              component="td"
              sx={{ p: 0.65, borderBottom: '1px solid rgba(255,255,255,.08)' }}
            >
              {content}
            </Box>
          ),
          hr: () => (
            <Box
              component="hr"
              sx={{ my: 1.25, border: 0, borderTop: '1px solid rgba(255,255,255,.1)' }}
            />
          ),
          del: ({ children: content }) => (
            <Box component="del" sx={{ color: 'text.disabled' }}>
              {content}
            </Box>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </Box>
  )
}

export default AdvisorMarkdown
