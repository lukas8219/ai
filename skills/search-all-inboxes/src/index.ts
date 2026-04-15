import { searchGmail } from './gmail';
import { searchSlack } from './slack';
import { searchHelpScout } from './helpscout';
import { searchGitHub } from './github';
import { InboxSearchResult } from './interfaces';

function renderMarkdown(results: Map<string, InboxSearchResult[]>): string {
  let md = '';

  if (results.has('gmail')) {
    md += '# Gmail\n';
    for (const item of results.get('gmail')!) {
      md += `### Subject\n${item.subject}\n`;
      md += `### Content\n${item.content}\n`;
      md += `### Has attachment\n${item.hasAttachment ? 'Yes' : 'No'}\n\n`;
    }
  }

  if (results.has('slack')) {
    md += '# Slack\n';
    for (const item of results.get('slack')!) {
      md += `### Thread message\n${item.threadMessage}\n`;
      md += `### Sender\n${item.sender}\n`;
      md += '### Replies[]\n';
      if (item.replies) {
        for (const reply of item.replies) {
          md += `- ${reply.threadMessage || reply.content || ''}\n`;
        }
      }
      md += '\n';
    }
  }

  if (results.has('helpscout')) {
    md += '# HelpScout\n';
    for (const item of results.get('helpscout')!) {
      md += `### HelpScout URL\n${item.url}\n`;
      md += `### Sender\n${item.sender}\n`;
      md += '### Replies[]\n';
      if (item.replies) {
        for (const reply of item.replies) {
          md += `- ${reply.content || ''}\n`;
        }
      }
      md += '\n';
    }
  }

  if (results.has('github')) {
    md += '# Github\n';
    for (const item of results.get('github')!) {
      md += `### Repository\n${item.repository}\n`;
      md += `### Issue or PR\n${item.issueOrPr}\n`;
      md += `### Discussion\n${item.discussion}\n`;
      md += '#### Discussion messages[]\n';
      if (item.discussionMessages) {
        for (const msg of item.discussionMessages) {
          md += `- ${msg}\n`;
        }
      }
      md += '\n';
    }
  }

  return md;
}

export async function searchAllInboxes(query: string): Promise<void> {
  const resultsMap = new Map<string, InboxSearchResult[]>();

  const [gmailResults, slackResults, helpScoutResults, githubResults] = await Promise.all([
    searchGmail(query),
    searchSlack(query),
    searchHelpScout(query),
    searchGitHub(query),
  ]);

  resultsMap.set('gmail', gmailResults);
  resultsMap.set('slack', slackResults);
  resultsMap.set('helpscout', helpScoutResults);
  resultsMap.set('github', githubResults);

  const markdownOutput = renderMarkdown(resultsMap);

  process.stdout.write(markdownOutput);
}

if (require.main === module) {
  const query = process.argv.slice(2).join(' ') || '';
  searchAllInboxes(query).catch(err => {
    console.error('Error running searchAllInboxes:', err);
    process.exit(1);
  });
}
