import axios from 'axios';
import dotenv from 'dotenv';
import { InboxSearchResult } from './interfaces';

dotenv.config();

const API_BASE = `https://api.helpscout.net/v2`;

const authHeader = {
  Authorization: `Basic ${Buffer.from(
    `${process.env.HELPSCOUT_API_KEY}:${process.env.HELPSCOUT_API_SECRET}`
  ).toString('base64')}`,
};

export async function searchHelpScout(query: string): Promise<InboxSearchResult[]> {
  const results: InboxSearchResult[] = [];
  try {
    // Search conversations in the given mailbox (CloudAMQP Support Inbox)
    // Using mailbox id from env
    const mailboxId = process.env.HELPSCOUT_API_ACCOUNT_ID;
    if (!mailboxId) {
      console.error('HELPSCOUT_API_ACCOUNT_ID not set in environment');
      return results;
    }

    // Search conversations endpoint: /conversations
    // List conversations with optional query

    const url = `${API_BASE}/mailboxes/${mailboxId}/conversations?query=${encodeURIComponent(query)}&page=1&perPage=10`;
    let conversations: any[] = [];
    let page = 1;
    const perPage = 10;

    do {
      const response = await axios.get(`${API_BASE}/mailboxes/${mailboxId}/conversations?query=${encodeURIComponent(query)}&page=${page}&perPage=${perPage}`, { headers: authHeader });
      conversations = response.data._embedded.conversations || [];

      for (const conv of conversations) {
        const convoUrl = `https://secure.helpscout.net/conversation/${conv.id}`;

        const sender = conv?.customer?.email || 'unknown';

        // Fetch messages for each conversation
        const messagesResp = await axios.get(`${API_BASE}/conversations/${conv.id}/threads`, { headers: authHeader });

        const messages = messagesResp.data._embedded.threads || [];

        const replies: InboxSearchResult[] = [];
        for (const msg of messages) {
          if (msg.type === 'customer' || msg.type === 'reply' || msg.type === 'note') {
            replies.push({ type: 'helpscout', content: msg.body });
          }
        }

        results.push({
          type: 'helpscout',
          url: convoUrl,
          sender,
          replies,
        });
      }
      page++;
    } while (conversations.length === perPage);

  } catch (error) {
    console.error('Error searching HelpScout:', error);
  }
  return results;
}
