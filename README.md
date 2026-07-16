# ContextGuard

ContextGuard is a deep-work shield for knowledge workers. It uses the task you set manually or the active file and Git branch detected by VS Code to build a semantic focus profile. Browser tab titles, Slack channel names, and Gmail inbox subject lines are then scored against that focus so low-context work can be collapsed or deprioritized.

## What works

- **Focus sources:** Set a manual focus in the dashboard, or install the VS Code extension to automatically create focus from the active workspace file and current Git branch. The VS Code extension only re-runs when the active file or `.git/HEAD` changes; it skips unchanged file/branch pairs.
- **Focus refinement:** GPT-5.6 turns raw work notes or the VS Code file/branch context into one concise focus statement.
- **Semantic matching:** `text-embedding-3-small` embeds each focus once and caches repeated tab, channel, and subject strings. Cosine similarity marks items below the selected threshold as **Low context**.
- **Browser:** The Manifest V3 extension reads tab titles only and groups low-context tabs into a collapsed **Low context** Chrome tab group. Chrome does not expose native tab-opacity controls; grouping is the closest safe native tab-deprioritization behavior.
- **Slack:** The dashboard calls Slack `conversations.list` for channel names only; it never requests or reads messages.
- **Gmail:** The dashboard loads inbox message metadata and extracts only the `Subject` header. It does not request or retain message bodies.

## Run locally

1. Copy `.env.example` to `.env`, add `OPENAI_API_KEY`, then run `npm install` and `npm run dev`.
2. Open `http://localhost:3000` for the dashboard. The manual textbox is always available as a focus override.
3. In Chrome, open `chrome://extensions`, enable Developer mode, select **Load unpacked**, and choose the `extension` folder. Use the popup to set focus and group low-context tab titles.
4. Optional Slack setup: add a user token with the minimal read-only `channels:read` / `groups:read` access needed by your workspace to `SLACK_USER_TOKEN`. The app only calls `conversations.list`.

### VS Code auto-focus extension

1. Open the `vscode-extension` folder in VS Code.
2. Install the extension for development: press `F5` to open an Extension Development Host, or package the folder with `@vscode/vsce` and install the resulting `.vsix`.
3. In the development host, open the coding workspace you want ContextGuard to observe. The extension sends the active file's relative path and Git branch to the local ContextGuard server when either changes.
4. In the dashboard, choose **Load VS Code focus**. The source badge will show **Auto-detected VS Code**. Run **ContextGuard: Refresh focus** from the Command Palette if you need to force a refresh.

The extension sends path/name and branch metadata to `http://localhost:3000`; it never reads or sends source-file contents.

### Gmail OAuth setup (local testing)

This demo uses a Google Cloud OAuth **Web application** client with the application publishing status set to **Testing**. Add each demo account as a test user; production verification is not needed for this local, test-user-only demo.

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project, then enable the **Gmail API**.
2. Go to **Google Auth platform**. Configure branding and audience, choose **External** if these are personal Gmail accounts, leave the app in **Testing**, and add the team’s Gmail accounts under **Test users**.
3. Under **Data Access**, add `https://www.googleapis.com/auth/gmail.readonly`. This is the requested read-only scope; ContextGuard still makes metadata-only API requests and uses only the `Subject` header.
4. Under **Clients**, create an OAuth 2.0 **Web application** client. Add `http://localhost:3000/api/gmail/oauth2callback` to its Authorized redirect URIs (or the `GMAIL_REDIRECT_URI` value you configure).
5. Download the client JSON into the project root as `credentials.json`. It is gitignored. If needed, set `GMAIL_CREDENTIALS_PATH` and `GMAIL_REDIRECT_URI` in `.env` instead.
6. Start ContextGuard, click **Gmail subjects**, then choose **Connect Gmail**. Complete consent with a configured test user. The local refresh token is saved as `.gmail-token.json` and is gitignored.

Google’s current [Node.js Gmail quickstart](https://developers.google.com/workspace/gmail/api/quickstart/nodejs) documents enabling the API and OAuth client setup. Google classifies `gmail.readonly` as a restricted scope, so keep this demo limited to approved test users and never store email content; ContextGuard requests the scope but reads only headers through Gmail’s metadata response mode. See Google’s [scope reference](https://developers.google.com/workspace/gmail/api/auth/scopes) for details.

## Privacy and efficiency

The MVP processes only user-entered focus text; VS Code workspace/file-path and Git-branch metadata; browser tab titles; Slack channel names; and Gmail subject lines. It does not read browser page bodies, source-file contents, Slack messages, or Gmail message bodies. Gmail access is subject-line-only, following the same metadata-only policy as Slack channel-name access. Focus vectors are generated once per meaningful task switch; all repeated context strings are cached in the running backend.

## Hackathon submission notes

Track: **Work and Productivity**. The required OpenAI product calls are part of the product path: GPT-5.6 creates the focus statement and `text-embedding-3-small` performs every semantic comparison.

### Building with Codex

Codex was used to turn the product brief into the Express API, OpenAI integration, dashboard, Chrome extension, VS Code auto-focus extension, Gmail OAuth flow, tab-group behavior, and developer documentation. We made the key product decision to keep all context sources metadata-only: titles, channel names, file paths/branches, and subject lines provide enough signal for a credible demo without full-content permissions. GPT-5.6 is intentionally used as a product component—not merely as a coding assistant—to normalize a raw task or automatic IDE context into a stable embedding target.

Core functionality Codex feedback session: `/feedback <ADD_THIS_CODEX_SESSION_ID_BEFORE_SUBMISSION>`.

### Roadmap

GitHub branch/PR focus detection, richer opt-in IDE context, and an email integration that can act on user-approved low-context threads are future work. Automatic VS Code focus detection is implemented now; no email bodies, Slack messages, or manager-authored task descriptions are planned for the MVP.

## Suggested 3-minute demo

1. Switch between files/branches in the VS Code Extension Development Host and load the auto-detected focus in ContextGuard.
2. Set a manual focus override and point out the source badge changing to **Manual override**.
3. Score Chrome tab titles, Slack channel names, and Gmail subject lines; expand **Low context** in each source to show the consistent treatment.
4. Explain that GPT-5.6 cleans the task and `text-embedding-3-small` supplies the similarity scores, while every integration remains metadata-only.
