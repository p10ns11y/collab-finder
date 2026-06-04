import { ExternalLink } from 'lucide-react'
import type { Tweet } from '../../lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

type Props = {
  tweets: Tweet[]
}

export function TweetFeed({ tweets }: Props) {
  if (tweets.length === 0) return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Results</CardTitle>
        <span className="text-xs text-ink-faint">{tweets.length} posts</span>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border-subtle">
          {tweets.map((t) => (
            <li key={t.id} className="px-4 py-3.5 transition-colors hover:bg-surface-2/40">
              <div className="mb-1.5 flex items-center gap-2 text-[11px] text-ink-faint">
                <span className="font-mono text-accent/90">{t.id}</span>
                {t.created_at && <span>{t.created_at}</span>}
                <a
                  href={`https://x.com/i/web/status/${t.id}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="ml-auto inline-flex items-center gap-1 text-ink-muted hover:text-accent"
                  aria-label="Open on X"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{t.text}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}