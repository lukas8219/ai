import { InboxSearchResult } from './interfaces';
import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';
import { paginate } from '@octokit/plugin-paginate-rest';
import { Octokit as BaseOctokit } from '@octokit/rest';

dotenv.config();

const Octokit = BaseOctokit.plugin(paginate);
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

export async function searchGitHub(query: string): Promise<InboxSearchResult[]> {
  const results: InboxSearchResult[] = [];
  try {
    const results: InboxSearchResult[] = [];
    try {
      // Use paginate to fetch all issues and PRs matching query
      const searchResults = await octokit.paginate(
        'GET /search/issues',
        {
          q: query + ' in:title,in:body',
        },
        response => response.data.items
      );

      for (const item of searchResults) {
        const repoFullName = item.repository_url.split('repos/')[1];
        const discussionMessages: string[] = [];

        // Paginate comments for this issue
        const comments = await octokit.paginate(
          octokit.issues.listComments,
          {
            owner: repoFullName.split('/')[0],
            repo: repoFullName.split('/')[1],
            issue_number: item.number,
          },
          response => response.data
        );

        for (const comment of comments) {
          discussionMessages.push(comment.body || '');
        }

        results.push({
          type: 'github',
          repository: repoFullName,
          issueOrPr: `#${item.number} ${item.title}`,
          discussion: item.body || '',
          discussionMessages,
        });
      }
    } catch (error) {
      console.error('Error searching GitHub:', error);
    }
    return results;
  } catch (error) {
    console.error('Error searching GitHub:', error);
  }
  return results;
}
