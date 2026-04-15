import { InboxSearchResult } from './interfaces';
import { WebClient } from '@slack/web-api';
import dotenv from 'dotenv';
dotenv.config();

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

import { InboxSearchParams, InboxSearchResult } from './interfaces';

export async function searchSlack({ query, from, to }: InboxSearchParams): Promise<InboxSearchResult[]> {
  const results: InboxSearchResult[] = [];

  // Slack timestamp uses Unix epoch in seconds with decimals
  // Convert date string to unix timestamp seconds float
  function toUnixTS(dateStr?: string): number | undefined {
    if (!dateStr) return undefined;
    return new Date(dateStr).getTime() / 1000;
  }

  const oldest = toUnixTS(from);
  // Slack 'latest' is inclusive and can be string timestamp or number
  const latest = toUnixTS(to);

  try {
    // Search messages with the query
    const searchResp = await slack.search.messages({ query, count: 10, sort: 'timestamp', sort_dir: 'desc' });

    if (!searchResp.messages?.matches) return results;

    // Filter by date range
    const filteredMatches = searchResp.messages.matches.filter(m => {
      const ts = parseFloat(m.ts || '0');
      if (oldest && ts < oldest) return false;
      if (latest && ts > latest) return false;
      return true;
    });

    for (const match of filteredMatches) {
      // Retrieve full thread if exists
      let replies: InboxSearchResult[] = [];
      if (match.thread_ts) {
        const threadResp = await slack.conversations.replies({ channel: match.channel?.id!, ts: match.thread_ts });
        if (threadResp.messages) {
          replies = threadResp.messages.slice(1).map(m => ({ type: 'slack', threadMessage: m.text || '', sender: m.user || '' }));
        }
      }

      results.push({
        type: 'slack',
        threadMessage: match.text || '',
        sender: match.user || '',
        replies,
      });
    }

    // Optionally add select channels fetching (configured via env)
    const channelsToFetch = process.env.SLACK_CHANNEL_IDS ? process.env.SLACK_CHANNEL_IDS.split(',') : [];

    for (const channelId of channelsToFetch) {
      // List messages from the channel with date filter
      const channelMsgs = await slack.conversations.history({ channel: channelId, limit: 10, oldest, latest });

      if (!channelMsgs.messages) continue;

      for (const msg of channelMsgs.messages) {
        let replies: InboxSearchResult[] = [];

        if (msg.thread_ts && msg.ts !== msg.thread_ts) continue; // Ignore if it's reply and not thread root

        if (msg.thread_ts) {
          const threadResp = await slack.conversations.replies({ channel: channelId, ts: msg.thread_ts });
          replies = threadResp.messages?.slice(1).map(m => ({ type: 'slack', threadMessage: m.text || '', sender: m.user || '' })) || [];
        }

        results.push({
          type: 'slack',
          threadMessage: msg.text || '',
          sender: msg.user || '',
          replies,
        });
      }
    }
  } catch (error) {
    console.error('Error searching Slack:', error);
  }

  return results;
}
