# Skill: search-all-inboxes

## Purpose
The `search-all-inboxes` skill enables searching across multiple inboxes and platforms that include:
- Gmail (Personal)
- Slack (mentions and selected channels)
- HelpScout (CloudAMQP Support Inbox)
- GitHub Issues

The skill compiles search results from all inboxes into a single consolidated Markdown output with clear sections per inbox.

## Input

A single search query string that will be used across all inbox platforms.

## Output

A Markdown formatted string sent to stdout consisting of results grouped by inbox, with relevant metadata such as subject, content, sender, attachments, discussion replies, URLs, etc.

## Runtime

NodeJS and TypeScript.

## High-level Architecture

- Modular implementation: separate modules/config for each inbox
- Central coordinator module aggregates results and formats markdown
- Uses official or community SDKs/APIs for integration with each inbox

## Inbox Modules
Each module implements the following interface:

```typescript
interface InboxSearcher {
  /**
   * Search the inbox with the given query string.
   * @param query The search query string.
   * @returns A promise resolving to a list of search results with inbox-specific details.
   */
  search(query: string): Promise<InboxSearchResult[]>;
}
```

Where `InboxSearchResult` contains fields specific to the inbox but generally includes:
- subject/title
- content/body
- sender/author
- replies/comments
- URLs or references
- attachments metadata

## Markdown Output Structure

The combined output will be a Markdown document with the following structure:

```
# Gmail
### Subject
### Content
### Has attachment

# Slack
### Thread message
### Sender
### Replies[]

# HelpScout
### HelpScout URL
### Sender
### Replies[]

# Github
### Repository
### Issue or PR
### Discussion
#### Discussion messages[]
```

## Example Input and Output

- Input:

```
"password reset not working"
```

- Output (excerpt):

```
# Gmail
### Subject
Password reset not working
### Content
I am facing issues with password reset on my app...
### Has attachment
No

# Slack
### Thread message
Hey team, anyone else seeing password reset errors?
### Sender
user123
### Replies[]
- Yes, seeing the same issue.
- Checking logs now.

# HelpScout
### HelpScout URL
https://secure.helpscout.net/conversation/12345
### Sender
support@cloudamqp.com
### Replies[]
- We are investigating the issue.
- Temporary workaround provided.

# Github
### Repository
cloudamqp/project
### Issue or PR
#234 Password Reset Bug
### Discussion
Users report password resets failing intermittently.
#### Discussion messages[]
- Same problem here.
- Fixed in branch bugfix/password-reset.
```

## Planned Libraries to Explore
- Gmail: `googleapis` npm package
- Slack: `@slack/web-api` npm package
- HelpScout: Check for official or community npm packages or REST API access
- GitHub: `@octokit/rest` npm package


## Execution

The skill will be executed with a query string parameter and will output the markdown to stdout for further processing or display.


---

This document outlines the skill approach and modular components for future detailed implementations.
