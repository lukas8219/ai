import { google } from 'googleapis';
import { InboxSearchResult } from './interfaces';
import dotenv from 'dotenv';

dotenv.config();

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

import { InboxSearchParams, InboxSearchResult } from './interfaces';

export async function searchGmail({ query, from, to }: InboxSearchParams): Promise<InboxSearchResult[]> {
  const results: InboxSearchResult[] = [];
  try {
    // Construct Gmail query string with date filters if provided
    let gmailQuery = query;
    if (from) {
      // Gmail uses after:YYYY/MM/DD
      const afterDate = new Date(from).toISOString().slice(0, 10).replace(/-/g, '/');
      gmailQuery += ` after:${afterDate}`;
    }
    if (to) {
      // Gmail uses before:YYYY/MM/DD (exclusive)
      const beforeDate = new Date(to).toISOString().slice(0, 10).replace(/-/g, '/');
      gmailQuery += ` before:${beforeDate}`;
    }

    // List message ids matching the query
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: gmailQuery,
    });
    if (!res.data.messages) return results;

    for (const msg of res.data.messages) {
      const message = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });

      const headers = message.data.payload?.headers || [];

      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const fromHeader = headers.find(h => h.name === 'From')?.value || '';

      let body = '';
      function getBody(payload: any): string {
        if (!payload) return '';

        // Helper decode
        function decode(data: string) {
          return Buffer.from(data, 'base64').toString('utf-8');
        }

        if (payload.mimeType === 'multipart/alternative' || payload.mimeType === 'multipart/mixed') {
          // multipart/alternative usually has text/plain and text/html parts
          let textPlain = '';
          let textHtml = '';
          if (payload.parts) {
            for (const part of payload.parts) {
              if (part.mimeType === 'text/plain' && part.body?.data) {
                textPlain = decode(part.body.data);
              } else if (part.mimeType === 'text/html' && part.body?.data) {
                textHtml = decode(part.body.data);
              }
            }
          }
          return textPlain || textHtml || '';
        }

        if (payload.mimeType === 'text/plain' && payload.body?.data) {
          return decode(payload.body.data);
        }

        if (payload.parts && payload.parts.length) {
          for (const part of payload.parts) {
            const partBody = getBody(part);
            if (partBody) return partBody;
          }
        }

        return '';
      }
      body = getBody(message.data.payload);

      const hasAttachment = (message.data.payload?.parts || []).some(part => !!part.filename && part.filename.length > 0);

      results.push({
        type: 'gmail',
        subject,
        content: body,
        hasAttachment,
        sender: fromHeader,
      });
    }
  } catch (error) {
    console.error('Error searching Gmail:', error);
  }
  return results;
}
