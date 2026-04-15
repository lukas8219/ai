export interface InboxSearchParams {
  query: string;
  from?: string; // ISO string
  to?: string;   // ISO string
}

export interface InboxSearchResult {
  type: string;
  subject?: string;
  content?: string;
  hasAttachment?: boolean;
  url?: string;
  sender?: string;
  replies?: InboxSearchResult[];
  threadMessage?: string;
  repository?: string;
  issueOrPr?: string;
  discussion?: string;
  discussionMessages?: string[];
}
