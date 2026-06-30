import { MediaMention, MediaRadarResponse } from '@/types/media';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  RadioIcon,
  TvIcon,
  MessageCircleIcon,
  NewspaperIcon,
  ZapIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  TrendingUpIcon,
  VideoIcon,
  MicIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface MediaRadarPanelProps {
  data: MediaRadarResponse;
  onRefresh: () => void;
  isRefreshing: boolean;
}

const sourceIcons = {
  tv: TvIcon,
  social: MessageCircleIcon,
  news: NewspaperIcon,
};

const tierColors: Record<string, string> = {
  strong: 'bg-orange-100 text-orange-800',
  building: 'bg-yellow-100 text-yellow-800',
  neutral: 'bg-emerald-100 text-emerald-800',
  weak: 'bg-slate-100 text-slate-700',
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function MentionRow({ mention, highlight }: { mention: MediaMention; highlight?: boolean }) {
  const navigate = useNavigate();
  const SourceIcon = sourceIcons[mention.sourceType] ?? NewspaperIcon;

  return (
    <div
      className={cn(
        'p-4 rounded-lg border bg-white transition-shadow hover:shadow-sm',
        highlight && 'border-emerald-300 bg-emerald-50/40'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => navigate(`/stock/${mention.symbol}`)}
            className="text-lg font-bold hover:text-sky-600"
          >
            {mention.symbol}
          </button>
          {mention.isEarly && (
            <Badge className="bg-emerald-100 text-emerald-800 text-xs gap-1">
              <ZapIcon size={12} />
              Pre-momentum
            </Badge>
          )}
          {mention.contentType === 'video' && (
            <Badge variant="outline" className="text-xs gap-1">
              <VideoIcon size={12} />
              Video{mention.hasTranscript ? ' · transcript' : ''}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs gap-1">
            <SourceIcon size={12} />
            {mention.source}
          </Badge>
          {mention.figureTags?.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs capitalize">
              {tag.replace('-', ' ')}
            </Badge>
          ))}
          <Badge className={cn('text-xs', tierColors[mention.momentumTier])}>
            {mention.momentumTier} momentum
          </Badge>
        </div>
        <div className="text-right text-sm">
          {mention.price > 0 && (
            <>
              <span className="font-semibold">${mention.price.toFixed(2)}</span>
              <span
                className={cn(
                  'ml-2',
                  mention.changePercentage >= 0 ? 'text-green-600' : 'text-red-600'
                )}
              >
                {mention.changePercentage >= 0 ? '+' : ''}
                {mention.changePercentage.toFixed(2)}%
              </span>
            </>
          )}
        </div>
      </div>

      <a
        href={mention.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium text-foreground hover:text-sky-600 line-clamp-2 flex items-start gap-1"
      >
        {mention.headline}
        <ExternalLinkIcon size={14} className="shrink-0 mt-0.5 opacity-50" />
      </a>

      {mention.transcriptPreview && (
        <p className="text-xs text-violet-700 bg-violet-50 rounded px-2 py-1 mt-2 line-clamp-2">
          <MicIcon size={12} className="inline mr-1" />
          Transcript: {mention.transcriptPreview}
        </p>
      )}

      {mention.excerpt && mention.excerpt !== mention.headline && !mention.transcriptPreview && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{mention.excerpt}</p>
      )}

      <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
        <span>Published {timeAgo(mention.publishedAt)}</span>
        <Button size="sm" variant="ghost" className="h-7" onClick={() => navigate(`/stock/${mention.symbol}`)}>
          View chart
        </Button>
      </div>
    </div>
  );
}

function MentionSection({
  title,
  description,
  mentions,
  icon: Icon,
  iconClass,
  badge,
  highlight,
}: {
  title: string;
  description: string;
  mentions: MediaMention[];
  icon: typeof NewspaperIcon;
  iconClass: string;
  badge?: number;
  highlight?: boolean;
}) {
  if (mentions.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Icon size={20} className={iconClass} />
        <h2 className="text-xl font-bold">{title}</h2>
        {badge != null && badge > 0 && (
          <Badge className="bg-violet-100 text-violet-800">{badge}</Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-4">{description}</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {mentions.map((m) => (
          <MentionRow key={`${title}-${m.id}`} mention={m} highlight={highlight} />
        ))}
      </div>
    </section>
  );
}

export function MediaRadarPanel({ data, onRefresh, isRefreshing }: MediaRadarPanelProps) {
  const {
    mentions,
    earlyHits,
    tipRanksNews = [],
    vipNews = [],
    videoMentions = [],
    xSocialMentions = [],
    status,
  } = data;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-lg border bg-slate-50">
        <div className="flex items-center gap-3">
          <div className="relative">
            <RadioIcon className="text-red-500" size={28} />
            {status.isMonitoring && (
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
            )}
          </div>
          <div>
            <p className="font-semibold text-foreground">Live TV, Social & Policy Monitor</p>
            <p className="text-sm text-muted-foreground">
              CNBC · Bloomberg · Reuters · X · YouTube · Trump/tech · TipRanks · Reddit
              {status.lastPollAt && ` · Last scan ${timeAgo(status.lastPollAt)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-sm text-muted-foreground">
            {status.feedsActive}/{status.feedsTotal} feeds · {status.mentionCount} mentions
            {(status.vipCount ?? 0) > 0 && (
              <>
                {' · '}
                <strong className="text-amber-700">{status.vipCount} VIP</strong>
              </>
            )}
            {(status.videoCount ?? 0) > 0 && (
              <>
                {' · '}
                <strong className="text-purple-700">{status.videoCount} video</strong>
              </>
            )}
            {(status.transcriptCount ?? 0) > 0 && (
              <>
                {' · '}
                <strong className="text-violet-700">{status.transcriptCount} transcripts</strong>
              </>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing} className="gap-2">
            <RefreshCwIcon size={14} className={cn(isRefreshing && 'animate-spin')} />
            Scan now
          </Button>
        </div>
      </div>

      {earlyHits.length > 0 && (
        <MentionSection
          title="Early Hits — before momentum"
          description="Mentioned on TV or social but momentum is still neutral/building."
          mentions={earlyHits}
          icon={TrendingUpIcon}
          iconClass="text-emerald-600"
          highlight
        />
      )}

      <MentionSection
        title="Trump, Policy & VIP"
        description="Trump/market headlines, White House policy, tech CEO moves, and mega-cap investment news — symbols extracted for chart audit."
        mentions={vipNews}
        icon={NewspaperIcon}
        iconClass="text-amber-600"
        badge={status.vipCount}
      />

      <MentionSection
        title="X / Social posts"
        description="Trump, Musk, and tech CEO posts surfaced via X (Google News proxy) — linked to tickers when mentioned."
        mentions={xSocialMentions}
        icon={MessageCircleIcon}
        iconClass="text-sky-600"
        badge={status.xSocialCount}
      />

      <MentionSection
        title="Video & announcements"
        description="YouTube speeches, interviews, and investment announcements. Captions fetched automatically when available for symbol extraction."
        mentions={videoMentions}
        icon={VideoIcon}
        iconClass="text-purple-600"
        badge={status.videoCount}
      />

      <MentionSection
        title="TipRanks News"
        description="Analyst notes, price targets, and stock stories from TipRanks."
        mentions={tipRanksNews}
        icon={NewspaperIcon}
        iconClass="text-violet-600"
        badge={status.tipRanksCount ?? tipRanksNews.length}
      />

      <section>
        <h2 className="text-xl font-bold mb-4">Live mention feed</h2>
        {mentions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border rounded-lg bg-white">
            <RadioIcon size={32} className="mx-auto mb-3 opacity-40" />
            <p>Scanning feeds… mentions appear here as they are detected.</p>
            <p className="text-sm mt-1">Polls every {status.pollIntervalSeconds}s automatically.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {mentions.map((m) => (
              <MentionRow key={m.id} mention={m} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
