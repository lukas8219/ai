# search-all-inboxes Skill

## Overview
The `search-all-inboxes` skill enables unified searching across multiple communication and support platforms that a user may be using:

- Gmail (Personal mailbox)
- Slack (mentions and selected channels)
- HelpScout (CloudAMQP Support Inbox mailbox)
- GitHub Issues and Pull Requests

It aggregates the search results into a single Markdown formatted output, separated by platform, listing relevant details from each message, conversation, or discussion thread.

## Features
- Modular architecture with separate modules for each inbox platform
- Uses official or well-maintained community SDKs/APIs for data access
- Supports querying messages, threads, replies, issues, and comments
- Outputs rich Markdown to stdout with headers and lists for easy reading or further processing
- Only performs read operations on external services (safe, no data modification)

## Usage

1. Copy `.env.example` to `.env` and fill in your API credentials and tokens.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Run the search with a query string:

   ```bash
   npm start -- "your search query here"
   ```

4. The output is a large Markdown document printed to stdout covering all inboxes.

## Environment Variables
The following environment variables are used by the skill. Set them appropriately in a `.env` file:

- Gmail:
  - `GMAIL_CLIENT_ID`
  - `GMAIL_CLIENT_SECRET`
  - `GMAIL_REDIRECT_URI` (usually `http://localhost`)
  - `GMAIL_REFRESH_TOKEN`
- Slack:
  - `SLACK_BOT_TOKEN`
- HelpScout:
  - `HELPSCOUT_API_KEY`
  - `HELPSCOUT_API_SECRET`
  - `HELPSCOUT_API_ACCOUNT_ID` (mailbox ID to search within)
- GitHub:
  - `GITHUB_TOKEN`

## Output Format

The Markdown output is structured as follows:

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

## Development

Written in TypeScript targeting NodeJS runtime. Uses `dotenv` for environment variable management. 

## Notes
- The skill currently limits API results to the top 10 matching items for performance.
- You must obtain proper credentials and permissions to use the respective APIs.
- The Slack module requires channel IDs for specific channels to fetch full threads.

## License
MIT

---

This document provides a complete overview and usage instructions for the `search-all-inboxes` skill.