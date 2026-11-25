import { Check, Copy, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import type { Tweet } from '../../core/domain/finder'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

type Props = {
  tweets: Tweet[]
}

export function TweetFeed({ tweets }: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const copyTweet = async (tweet: Tweet) => {
    const content = `${tweet.text}\n\nhttps://x.com/i/web/status/${tweet.id}`
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(tweet.id)
      setTimeout(() => setCopiedId(null), 1200)
    } catch (err) {
      // Clipboard may be unavailable in some contexts; non-fatal
      console.warn('[ui] clipboard copy failed', err)
    }
  }

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
                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      copyTweet(t)
                    }}
                    className="inline-flex items-center justify-center rounded p-0.5 text-ink-muted hover:bg-surface-2 hover:text-accent"
                    aria-label={copiedId === t.id ? 'Copied' : 'Copy text and link'}
                    title="Copy post text + link"
                  >
                    {copiedId === t.id ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                  <a
                    href={`https://x.com/i/web/status/${t.id}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-ink-muted hover:text-accent"
                    aria-label="Open on X"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink select-none">{t.text}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}